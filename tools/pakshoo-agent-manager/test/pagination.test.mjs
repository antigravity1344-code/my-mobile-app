import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './security-helpers.mjs';
import { MAX_RESPONSE_BYTES, boundedResponse } from '../pagination.mjs';

test('default 100, max 500, stable snapshot excludes append and returns all original IDs once', t => {
  const f = fixture(t); f.start();
  for (let i = 0; i < 510; i++) f.run({ type: 'heartbeat', ...f.owner(), ttlMs: 60000 });
  const first = f.manager.eventsPage('SECURITY');
  assert.equal(first.items.length, 100);
  assert.equal(f.manager.eventsPage('SECURITY', { limit: 500 }).items.length, 500);
  for (const limit of [0,501,-1,1.5,'100']) assert.throws(() => f.manager.eventsPage('SECURITY', { limit }), /INVALID_PAGE_LIMIT/);
  assert.throws(() => f.manager.events('SECURITY'), /PAGINATION_REQUIRED/);
  assert.throws(() => f.manager.pendingReports(), /PAGINATION_REQUIRED/);
  f.run({ type: 'heartbeat', ...f.owner(), ttlMs: 60000 });
  const seen = first.items.map(x => x.seq);
  let cursor = first.nextCursor;
  while (cursor) {
    const next = f.manager.eventsPage('SECURITY', { limit: 100, cursor });
    assert.equal(next.snapshot, first.snapshot);
    seen.push(...next.items.map(x => x.seq)); cursor = next.nextCursor;
  }
  assert.equal(seen.length, 513); assert.equal(new Set(seen).size, 513);
  assert.equal(Math.max(...seen), first.snapshot);
  assert.equal(f.manager.eventsPage('SECURITY').snapshot, first.snapshot + 1);
});
test('cursor is bound to collection/task and validates integer bounds; empty page is explicit', t => {
  const f = fixture(t); f.start();
  const cursor = f.manager.eventsPage('SECURITY', { limit: 1 }).nextCursor;
  assert.throws(() => f.manager.eventsPage('OTHER', { cursor }), /INVALID_CURSOR/);
  assert.throws(() => f.manager.pendingReportsPage({ cursor }), /INVALID_CURSOR/);
  for (const changed of [{ after: -1 }, { snapshot: 0 }, { after: 0.5 }, { extra: 1 }]) {
    assert.throws(() => f.manager.eventsPage('SECURITY', { cursor: { ...cursor, ...changed } }), /INVALID_CURSOR/);
  }
  assert.deepEqual(f.manager.eventsPage('ABSENT').items, []);
  assert.equal(f.manager.eventsPage('ABSENT').nextCursor, null);
});
test('outbox pagination tolerates receipts and appends without losing pending older reports', t => {
  const f = fixture(t); f.start();
  const first = f.manager.pendingReportsPage({ limit: 1 });
  f.run({ type: 'report-receipt', actor: 'SUPERVISOR', reportId: first.items[0].id, receipt: 'simulated:delivered' });
  f.run({ type: 'heartbeat', ...f.owner(), ttlMs: 60000 });
  const next = f.manager.pendingReportsPage({ cursor: first.nextCursor });
  assert.deepEqual(next.items.map(x => x.id), [2,3]);
  assert.deepEqual(f.manager.pendingReportsPage().items.map(x => x.id), [2,3,4]);
  assert.equal(f.manager.db.prepare('SELECT count(*) AS n FROM outbox').get().n, 4);
});
test('UTF-8 response byte cap returns a continuation, not truncated reports', t => {
  const f = fixture(t);
  for (let i = 0; i < 40; i++) {
    const taskId = `BIG-${i}`; f.start(taskId);
    f.run({ type: 'finish', ...f.owner(taskId), status: 'REVIEW', report: { summary: 'ژ'.repeat(16000) } });
  }
  let cursor = null, pages = 0, count = 0;
  do {
    const result = f.manager.pendingReportsPage({ limit: 500, cursor });
    assert.ok(Buffer.byteLength(boundedResponse(result)) <= MAX_RESPONSE_BYTES);
    for (const item of result.items) if (item.payload.kind === 'REVIEW') assert.equal(item.payload.details.report.summary.length, 16000);
    count += result.items.length; pages++; cursor = result.nextCursor;
  } while (cursor);
  assert.equal(count, 160); assert.ok(pages > 1);
});
test('oversized legacy row is an explicit error with ID, never silently skipped', t => {
  const f = fixture(t); f.register();
  // Simulate a pre-hardening historical row in this disposable fixture only.
  f.manager.db.prepare('INSERT INTO events(task_id,kind,at,data) VALUES(?,?,?,?)')
    .run('SECURITY', 'LEGACY', 1000, JSON.stringify({ text: 'x'.repeat(MAX_RESPONSE_BYTES) }));
  const result = f.manager.eventsPage('SECURITY');
  assert.equal(result.items.length, 1);
  assert.throws(() => f.manager.eventsPage('SECURITY', { cursor: result.nextCursor }), /PAGE_ITEM_TOO_LARGE:2/);
  assert.equal(f.manager.db.prepare('SELECT count(*) AS n FROM events').get().n, 2);
});
