const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createDataStore } = require('./dataStore');

// Synthetic fixtures live only in a new temporary database; no production rules or SMS are used.
const CUSTOMER = 'TEST-START-CUSTOMER';
const WORKER = { id: 'TEST-START-WORKER', name: 'متخصص آزمایشی', phone: '09120007001' };
const OTHER_WORKER = { ...WORKER, id: 'TEST-START-WORKER-OTHER' };
const FIXED_NOW = Date.parse('2026-10-12T10:00:00.000Z');

function fixture(t, overrides = {}, accept = true) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-start-core-'));
  const file = path.join(tmp, 'isolated.sqlite');
  let store = createDataStore(file);
  const orderId = 'TEST-START-ORDER';
  store.createOrder({
    id: orderId, customerId: CUSTOMER, customerName: 'مشتری آزمایشی', customerPhone: '09120007002',
    serviceTitle: 'خدمت آزمایشی', address: 'نشانی آزمایشی', date: 'تاریخ آزمایشی', time: 'بازه آزمایشی',
    price: 123456, pricing: { total: 123456 }, status: 'PENDING',
    createdAt: '2026-10-12T08:00:00.000Z', ...overrides,
  });
  if (accept) assert.equal(store.tryAcceptOrder(orderId, WORKER).code, 'ok');
  t.after(() => { store.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
  return {
    file, orderId, get store() { return store; },
    reopen() { store.close(); store = createDataStore(file); return store; },
  };
}

function startEvent(store, orderId, kind) {
  return store.listOrderEvents(orderId).filter(event => event.kind === kind).at(-1);
}

function decisionContext(f) {
  if (typeof f.store.startDecisionContext === 'function') return f.store.startDecisionContext(f.store.getOrder(f.orderId));
  // Reference-shape fallback lets the pre-fix red run exercise the actual replay/ABA bugs.
  const events = f.store.listOrderEvents(f.orderId);
  const acceptanceNo = events.filter(e => e.kind === 'ORDER_ACCEPTED').length;
  const acceptanceKey = 'admin-start:' + f.orderId + ':' + acceptanceNo + ':';
  const latest = events.filter(e => e.kind === 'ADMIN_DECISION' && e.idempotencyKey.startsWith(acceptanceKey)).at(-1);
  return { acceptanceKey, expectedDecisionEventId: latest ? latest.id : null };
}

let commandNo = 0;
function adminCommand(f, overrides = {}) {
  commandNo += 1;
  return { ...decisionContext(f), requestId: 'TEST-COMMAND-' + commandNo, ...overrides };
}

function startKey(f) {
  return decisionContext(f).acceptanceKey;
}

function report(f) {
  assert.equal(f.store.reportStart(f.orderId, WORKER, startKey(f)).code, 'ok');
  return startEvent(f.store, f.orderId, 'START_REPORTED_BY_WORKER');
}

function answerReport(f, answer = 'yes') {
  const event = report(f);
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, answer, event.id).code, 'ok');
  return event;
}

function prompt(f, t, value = { minutes: 7 }, active = true) {
  t.mock.method(Date, 'now', () => FIXED_NOW);
  assert.equal(f.store.publishRule({ ruleKey: 'start.promptDelayMinutes', value, active, actor: 'admin' }).code, 'ok');
  assert.equal(f.store.sweepStartPrompts(), 1);
  return startEvent(f.store, f.orderId, 'START_PROMPT_SENT');
}

function setStatus(f, status) {
  f.store.updateOrder({ ...f.store.getOrder(f.orderId), status });
}

function reassign(f, worker = OTHER_WORKER) {
  f.store.transaction(() => {
    f.store.updateOrder({ ...f.store.getOrder(f.orderId), cleanerId: worker.id, cleanerName: worker.name });
    f.store.recordAcceptance(f.orderId, { actorRole: 'admin' });
  });
}

function addLegacyAdmin(f, rawData) {
  const raw = new DatabaseSync(f.file);
  const columns = raw.prepare('PRAGMA table_info(order_events)').all().map(c => c.name);
  const extraColumn = rawData === undefined ? '' : ', dataJson';
  const extraValue = rawData === undefined ? '' : ', ?';
  assert.ok(rawData === undefined || columns.includes('dataJson'), 'additive dataJson schema exists');
  const args = ['TEST-LEGACY-ADMIN', f.orderId, 'admin', 'ADMIN_DECISION', '2026-10-12T09:00:00.000Z',
    'admin-start:' + f.orderId + ':1:1'];
  if (rawData !== undefined) args.push(rawData);
  raw.prepare('INSERT INTO order_events (id, orderId, actorRole, kind, recordedAt, idempotencyKey' + extraColumn +
    ') VALUES (?, ?, ?, ?, ?, ?' + extraValue + ')').run(...args);
  raw.prepare("UPDATE orders SET startStatus = 'admin_resolved' WHERE id = ?").run(f.orderId);
  raw.close();
}

test('prompt yes/no survives database reopen and retry/conflicting answer has no additional effects', t => {
  const f = fixture(t, { expectedStartAt: '2026-10-12T09:00:00.000Z' });
  const sent = prompt(f, t);
  assert.equal(f.store.startPromptFor(f.store.getOrder(f.orderId)), 'ask_started');
  assert.equal(f.store.startPromptEventId(f.store.getOrder(f.orderId)), sent.id);
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', sent.id).code, 'ok');
  const before = f.store.listOrderEvents(f.orderId);
  assert.deepEqual(before.at(-1).data, { answer: 'yes', promptEventId: sent.id });
  f.reopen();
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', sent.id).code, 'duplicate');
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'no', sent.id).code, 'already-answered');
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
  assert.equal(f.store.getOrder(f.orderId).agreedStartAt, null);
});

test('worker report and explicit confirmation keep independent status/pricing and duplicate effects bounded', t => {
  const f = fixture(t);
  const before = f.store.getOrder(f.orderId);
  const event = report(f);
  assert.equal(f.store.startPromptEventId(f.store.getOrder(f.orderId)), event.id);
  assert.equal(f.store.reportStart(f.orderId, WORKER, startKey(f)).code, 'duplicate');
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', event.id).code, 'ok');
  const after = f.store.getOrder(f.orderId);
  assert.equal(after.status, before.status);
  assert.equal(after.price, before.price);
  assert.deepEqual(after.pricing, before.pricing);
  assert.equal(after.agreedStartAt, event.claimedAt);
  assert.equal(f.store.startCountsAsStarted(after), true);
  assert.deepEqual(startEvent(f.store, f.orderId, 'START_CONFIRMED_BY_CUSTOMER').data, { reportEventId: event.id });
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', event.id).code, 'duplicate');
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'no', event.id).code, 'already-answered');
  assert.equal(f.store.listNotifications(CUSTOMER).filter(n => n.kind === 'START_REPORTED').length, 1);
  assert.equal(f.store.listLedger().length, 0);
});

test('customer denial records both claims, dispute metadata and exactly one denial notification', t => {
  const f = fixture(t);
  const event = answerReport(f, 'no');
  assert.equal(f.store.getOrder(f.orderId).startStatus, 'disputed');
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  assert.deepEqual(startEvent(f.store, f.orderId, 'DISPUTE_OPENED').data, { subject: 'start' });
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'no', event.id).code, 'duplicate');
  assert.equal(f.store.listNotifications(WORKER.id).filter(n => n.kind === 'START_DENIED').length, 1);
});

for (const answer of ['yes', 'no']) {
  test('later worker report remains answerable after automated customer ' + answer, t => {
    const f = fixture(t, { expectedStartAt: '2026-10-12T09:00:00.000Z' });
    const sent = prompt(f, t);
    assert.equal(f.store.respondStart(f.orderId, CUSTOMER, answer, sent.id).code, 'ok');
    const oldAnswer = startEvent(f.store, f.orderId, 'START_PROMPT_ANSWERED');
    const event = report(f);
    assert.equal(f.store.startPromptFor(f.store.getOrder(f.orderId)), 'confirm_report');
    assert.equal(f.store.startPromptEventId(f.store.getOrder(f.orderId)), event.id);
    assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', event.id).code, 'ok');
    assert.equal(f.store.getOrder(f.orderId).agreedStartAt, event.claimedAt);
    assert.deepEqual(startEvent(f.store, f.orderId, 'START_PROMPT_ANSWERED'), oldAnswer);
    assert.equal(f.store.respondStart(f.orderId, CUSTOMER, answer, sent.id).code, 'duplicate');
  });
}

test('new acceptance resets only current start projection and rejects response about prior worker', t => {
  const f = fixture(t);
  const old = answerReport(f);
  const history = f.store.listOrderEvents(f.orderId);
  reassign(f);
  assert.equal(f.store.getOrder(f.orderId).startStatus, 'not_recorded');
  assert.equal(f.store.getOrder(f.orderId).agreedStartAt, null);
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  assert.deepEqual(f.store.listOrderEvents(f.orderId).slice(0, history.length), history);
  assert.equal(f.store.reportStart(f.orderId, WORKER, startKey(f)).code, 'forbidden');
  assert.equal(f.store.reportStart(f.orderId, OTHER_WORKER, startKey(f)).code, 'ok');
  const next = startEvent(f.store, f.orderId, 'START_REPORTED_BY_WORKER');
  assert.notEqual(next.id, old.id);
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', old.id).code, 'stale-prompt');
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', next.id).code, 'ok');
});

test('return Pending resets current start projection, and repeat acceptance has a fresh start cycle', t => {
  const f = fixture(t);
  const old = answerReport(f);
  const history = f.store.listOrderEvents(f.orderId);
  setStatus(f, 'PENDING');
  f.store.clearAcceptanceForReturnToPending(f.orderId, { actorRole: 'admin', previousWorkerId: WORKER.id });
  const pending = f.store.getOrder(f.orderId);
  assert.equal(pending.startStatus, 'not_recorded');
  assert.equal(pending.agreedStartAt, null);
  assert.equal(pending.acceptedAt, null);
  assert.equal(pending.cleanerId, null);
  assert.equal(f.store.tryAcceptOrder(f.orderId, WORKER).code, 'ok');
  assert.deepEqual(f.store.listOrderEvents(f.orderId).slice(0, history.length), history);
  const next = report(f);
  assert.notEqual(next.id, old.id);
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', old.id).code, 'stale-prompt');
});

test('missing/wrong event references cannot confirm current report and have no side effects', t => {
  const f = fixture(t);
  const event = report(f);
  const before = f.store.listOrderEvents(f.orderId);
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes').code, 'invalid');
  for (const ref of ['', null, {}, 'x'.repeat(129)]) {
    assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', ref).code, 'invalid');
  }
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', 'OTHER-EVENT').code, 'stale-prompt');
  assert.equal(f.store.respondStart(f.orderId, 'OTHER-CUSTOMER', 'yes', event.id).code, 'forbidden');
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
});

test('stale automated answer cannot silently confirm a newer worker report', t => {
  const f = fixture(t, { expectedStartAt: '2026-10-12T09:00:00.000Z' });
  const old = prompt(f, t);
  const next = report(f);
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', old.id).code, 'stale-prompt');
  assert.equal(f.store.getOrder(f.orderId).startStatus, 'worker_reported');
  assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', next.id).code, 'ok');
});

test('admin duplicate decisions are bounded, correction retains original value and survives reopen', t => {
  const f = fixture(t);
  const firstCommand = adminCommand(f);
  assert.equal(f.store.adminStartDecision(f.orderId, true, firstCommand).code, 'ok');
  const first = startEvent(f.store, f.orderId, 'ADMIN_DECISION');
  assert.deepEqual(first.data, { subject: 'start', started: true,
    acceptanceKey: firstCommand.acceptanceKey, requestId: firstCommand.requestId });
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), true);
  assert.equal(f.store.adminStartDecision(f.orderId, true, firstCommand).code, 'duplicate');
  const secondCommand = adminCommand(f);
  assert.equal(f.store.adminStartDecision(f.orderId, false, secondCommand).code, 'ok');
  const second = startEvent(f.store, f.orderId, 'ADMIN_DECISION');
  assert.equal(second.correctsEventId, first.id);
  assert.deepEqual(second.data, { subject: 'start', started: false,
    acceptanceKey: secondCommand.acceptanceKey, requestId: secondCommand.requestId });
  const history = f.store.listOrderEvents(f.orderId);
  f.reopen();
  assert.deepEqual(f.store.listOrderEvents(f.orderId), history);
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  assert.equal(f.store.adminStartDecision(f.orderId, false, secondCommand).code, 'duplicate');
  assert.deepEqual(f.store.listOrderEvents(f.orderId), history);
});

test('worker report cannot reopen a start decision already resolved by admin', t => {
  const f = fixture(t);
  assert.equal(f.store.adminStartDecision(f.orderId, false, adminCommand(f)).code, 'ok');
  const before = f.store.listOrderEvents(f.orderId);
  assert.equal(f.store.reportStart(f.orderId, WORKER, startKey(f)).code, 'resolved');
  assert.equal(f.store.startPromptFor(f.store.getOrder(f.orderId)), null);
  assert.equal(f.store.startPromptEventId(f.store.getOrder(f.orderId)), null);
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
});

for (const raw of [undefined, '{invalid', 'null', '[]', '{"subject":"start"}', '{"subject":"other","started":true}']) {
  test('legacy admin metadata fails safely without claiming started: ' + String(raw), t => {
    const f = fixture(t);
    addLegacyAdmin(f, raw);
    assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
    f.reopen();
    assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
    assert.equal(f.store.adminStartDecision(f.orderId, false, adminCommand(f)).code, 'ok');
  });
}

for (const [summary, kind] of [['customer_reported', 'START_PROMPT_ANSWERED'],
  ['customer_confirmed', 'START_CONFIRMED_BY_CUSTOMER']]) {
  test('legacy ' + summary + ' with missing structured proof does not assume started', t => {
    const f = fixture(t);
    const event = summary === 'customer_reported' ? 'start-prompt-answer:' : 'start-confirm:';
    assert.equal(f.store.appendOrderEvent({ orderId: f.orderId, actorId: CUSTOMER, actorRole: 'customer', kind,
      idempotencyKey: event + f.orderId + ':1' }).code, 'ok');
    const raw = new DatabaseSync(f.file);
    raw.prepare('UPDATE orders SET startStatus = ? WHERE id = ?').run(summary, f.orderId);
    raw.close();
    assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  });
}

test('oversized legacy JSON is unknown consistently in event DTO and started projection', t => {
  const f = fixture(t);
  addLegacyAdmin(f, JSON.stringify({ subject: 'start', started: true, legacy: 'x'.repeat(5000) }));
  assert.equal(startEvent(f.store, f.orderId, 'ADMIN_DECISION').data, null);
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  assert.equal(f.store.adminStartDecision(f.orderId, true, adminCommand(f)).code, 'ok');
});

test('event metadata is a bounded plain JSON object and participates in duplicate comparison', t => {
  const f = fixture(t);
  const event = { orderId: f.orderId, actorRole: 'admin', kind: 'ADMIN_DECISION',
    idempotencyKey: 'TEST-METADATA', data: { subject: 'start', started: false } };
  assert.equal(f.store.appendOrderEvent(event).code, 'ok');
  assert.equal(f.store.appendOrderEvent({ ...event, data: { started: false, subject: 'start' } }).code, 'duplicate');
  assert.equal(f.store.appendOrderEvent({ ...event, data: { subject: 'start', started: true } }).code, 'key-conflict');
  const cyclic = {}; cyclic.self = cyclic;
  for (const data of [[], 'text', 1, new Date(), { bad: undefined }, { bad: NaN }, { bad: BigInt(1) }, cyclic,
    { large: 'x'.repeat(20000) }]) {
    assert.equal(f.store.appendOrderEvent({ ...event, idempotencyKey: 'INVALID-META', data }).code, 'invalid');
  }
  const history = f.store.listOrderEvents(f.orderId);
  const raw = new DatabaseSync(f.file);
  assert.throws(() => raw.prepare('UPDATE order_events SET dataJson = ? WHERE id = ?').run('{}', history.at(-1).id), /append-only/);
  raw.close();
});

test('no rule, inactive/malformed/negative/out-of-range delay produce no question and no default', t => {
  const f = fixture(t, { expectedStartAt: '2026-10-12T09:00:00.000Z' });
  t.mock.method(Date, 'now', () => FIXED_NOW);
  assert.equal(f.store.sweepStartPrompts(), 0);
  for (const [value, active] of [[{ minutes: 7 }, false], [{ minutes: -1 }, true], [{ minutes: '7' }, true],
    [{ minutes: Number.MAX_SAFE_INTEGER }, true], [{ other: 7 }, true]]) {
    assert.equal(f.store.publishRule({ ruleKey: 'start.promptDelayMinutes', value, active, actor: 'admin' }).code, 'ok');
    assert.equal(f.store.sweepStartPrompts(), 0);
  }
  assert.equal(f.store.startPromptFor(f.store.getOrder(f.orderId)), null);
  assert.equal(f.store.listOrderEvents(f.orderId).filter(e => e.kind === 'START_PROMPT_SENT').length, 0);
});

test('configured delay uses exact due boundary and emits one prompt across retry/reopen', t => {
  const f = fixture(t, { expectedStartAt: '2026-10-12T09:53:00.000Z' });
  let now = FIXED_NOW - 1;
  t.mock.method(Date, 'now', () => now);
  f.store.publishRule({ ruleKey: 'start.promptDelayMinutes', value: { minutes: 7 }, active: true, actor: 'admin' });
  assert.equal(f.store.sweepStartPrompts(), 0);
  now += 1;
  assert.equal(f.store.sweepStartPrompts(), 1);
  assert.equal(f.store.sweepStartPrompts(), 0);
  f.reopen();
  assert.equal(f.store.sweepStartPrompts(), 0);
  assert.equal(f.store.listNotifications(CUSTOMER).filter(n => n.kind === 'START_PROMPT').length, 1);
});

test('explicit zero delay is valid and absent expectedStartAt remains unguessed', t => {
  const f = fixture(t, { expectedStartAt: '2026-10-12T10:00:00.000Z' });
  prompt(f, t, { minutes: 0 });
  const g = fixture(t);
  g.store.publishRule({ ruleKey: 'start.promptDelayMinutes', value: { minutes: 0 }, active: true, actor: 'admin' });
  assert.equal(g.store.sweepStartPrompts(), 0);
  assert.equal(g.store.getOrder(g.orderId).expectedStartAt, null);
});

for (const status of ['PENDING', 'CANCEL_REQUESTED', 'CANCELLED', 'COMPLETED', 'UNKNOWN']) {
  test('start report/answer cannot change status or financial data for ' + status, t => {
    const f = fixture(t);
    const event = report(f);
    setStatus(f, status);
    const before = f.store.getOrder(f.orderId);
    const history = f.store.listOrderEvents(f.orderId);
    assert.equal(f.store.reportStart(f.orderId, WORKER, startKey(f)).code, 'bad-status');
    assert.equal(f.store.respondStart(f.orderId, CUSTOMER, 'yes', event.id).code, 'bad-status');
    assert.equal(f.store.startPromptFor(before), null);
    assert.deepEqual(f.store.getOrder(f.orderId), before);
    assert.deepEqual(f.store.listOrderEvents(f.orderId), history);
    assert.equal(f.store.listLedger().length, 0);
    if (status === 'CANCEL_REQUESTED') {
      assert.equal(f.store.adminStartDecision(f.orderId, true, adminCommand(f)).code, 'bad-status');
    }
  });
}

test('admin exact command replay after correction cannot flip the latest decision', t => {
  const f = fixture(t);
  const original = adminCommand(f);
  assert.equal(f.store.adminStartDecision(f.orderId, true, original).code, 'ok');
  assert.equal(f.store.adminStartDecision(f.orderId, false, adminCommand(f)).code, 'ok');
  const before = f.store.listOrderEvents(f.orderId);
  assert.equal(f.store.adminStartDecision(f.orderId, true, original).code, 'duplicate');
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
  f.reopen();
  assert.equal(f.store.adminStartDecision(f.orderId, true, original).code, 'duplicate');
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
});

test('admin correction remains latest when server audit clock moves backwards', t => {
  const f = fixture(t);
  const RealDate = Date;
  let auditNow = FIXED_NOW;
  t.mock.method(globalThis, 'Date', class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [auditNow])); }
    static now() { return auditNow; }
  });
  const original = adminCommand(f);
  assert.equal(f.store.adminStartDecision(f.orderId, true, original).code, 'ok');
  const first = startEvent(f.store, f.orderId, 'ADMIN_DECISION');
  const correction = adminCommand(f);
  auditNow -= 90000;
  assert.equal(f.store.adminStartDecision(f.orderId, false, correction).code, 'ok');
  const events = f.store.listOrderEvents(f.orderId).filter(event => event.kind === 'ADMIN_DECISION');
  const second = events.find(event => event.id !== first.id);
  assert.ok(Date.parse(second.recordedAt) < Date.parse(first.recordedAt), 'audit timestamps retain the actual clock rollback');
  assert.equal(second.correctsEventId, first.id);
  assert.equal(f.store.startDecisionContext(f.store.getOrder(f.orderId)).expectedDecisionEventId, second.id);
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  const before = f.store.listOrderEvents(f.orderId);
  assert.equal(f.store.adminStartDecision(f.orderId, true, original).code, 'duplicate');
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
  f.reopen();
  assert.equal(f.store.startDecisionContext(f.store.getOrder(f.orderId)).expectedDecisionEventId, second.id);
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), false);
});

test('admin command content conflict and stale decision context have no effects', t => {
  const f = fixture(t);
  const original = adminCommand(f);
  const staleRevision = adminCommand(f);
  assert.equal(f.store.adminStartDecision(f.orderId, true, original).code, 'ok');
  const before = f.store.listOrderEvents(f.orderId);
  assert.equal(f.store.adminStartDecision(f.orderId, false, original).code, 'key-conflict');
  assert.equal(f.store.adminStartDecision(f.orderId, false, staleRevision).code, 'stale-decision');
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
  assert.equal(f.store.startCountsAsStarted(f.store.getOrder(f.orderId)), true);
});

test('admin intent from a replaced acceptance cannot resolve the new worker start', t => {
  const f = fixture(t);
  const old = adminCommand(f);
  reassign(f);
  const before = f.store.listOrderEvents(f.orderId);
  assert.equal(f.store.adminStartDecision(f.orderId, true, old).code, 'stale-decision');
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
  assert.equal(f.store.getOrder(f.orderId).startStatus, 'not_recorded');
});

test('admin commands require explicit bounded IDs and revision without guessing old intent', t => {
  const f = fixture(t);
  const current = adminCommand(f);
  const noRevision = { ...current }; delete noRevision.expectedDecisionEventId;
  for (const opts of [undefined, {}, noRevision, { ...current, requestId: '' },
    { ...current, requestId: 'x'.repeat(65) }, { ...current, requestId: 'unsafe/command' },
    { ...current, expectedDecisionEventId: 1 }, { ...current, acceptanceKey: null }]) {
    assert.equal(f.store.adminStartDecision(f.orderId, true, opts).code, 'invalid');
  }
  assert.equal(f.store.listOrderEvents(f.orderId).filter(e => e.kind === 'ADMIN_DECISION').length, 0);
});

test('same worker delayed report after ABA reassignment cannot start a fresh acceptance', t => {
  const f = fixture(t);
  const old = startKey(f);
  reassign(f);
  reassign(f, WORKER);
  const before = f.store.listOrderEvents(f.orderId);
  assert.equal(f.store.reportStart(f.orderId, WORKER, old).code, 'stale-acceptance');
  assert.deepEqual(f.store.listOrderEvents(f.orderId), before);
  assert.equal(f.store.getOrder(f.orderId).startStatus, 'not_recorded');
  assert.equal(f.store.reportStart(f.orderId, WORKER, startKey(f)).code, 'ok');
});

test('worker start requires explicit acceptance reference and exposes it only for active orders', t => {
  const f = fixture(t);
  assert.equal(f.store.startAcceptanceKey(f.store.getOrder(f.orderId)), startKey(f));
  for (const key of [undefined, null, '', {}, 'x'.repeat(129)]) {
    assert.equal(f.store.reportStart(f.orderId, WORKER, key).code, 'invalid');
  }
  setStatus(f, 'CANCEL_REQUESTED');
  assert.equal(f.store.startAcceptanceKey(f.store.getOrder(f.orderId)), null);
});

test('legacy active assignment can report start without inventing an acceptance timestamp', t => {
  const f = fixture(t, { status: 'ACCEPTED', cleanerId: WORKER.id, cleanerName: WORKER.name }, false);
  const before = f.store.getOrder(f.orderId);
  assert.equal(before.acceptedAt, null);
  assert.equal(f.store.listOrderEvents(f.orderId).length, 0);
  assert.equal(f.store.workerStartReported(before), false);
  assert.equal(f.store.reportStart(f.orderId, WORKER, startKey(f)).code, 'ok');
  const after = f.store.getOrder(f.orderId);
  assert.equal(f.store.workerStartReported(after), true);
  assert.equal(after.acceptedAt, null);
  assert.equal(after.status, before.status);
  assert.equal(after.price, before.price);
  assert.deepEqual(after.pricing, before.pricing);
  assert.deepEqual(f.store.listOrderEvents(f.orderId).map(e => e.kind), ['START_REPORTED_BY_WORKER']);
  assert.equal(f.store.reportStart(f.orderId, WORKER, startKey(f)).code, 'duplicate');
});
