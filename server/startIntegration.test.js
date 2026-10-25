const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestHarness } = require('./testAuthHarness');

const harness = createTestHarness('paksho-start-isolated-');
const { store, request } = harness;
// Zero-commission fixture isolates start/points/privacy regressions from debt; workerWallet.test.js covers the 25% debt rule.
assert.equal(store.commissionPolicy.publish({ratePercent:0,expectedVersion:store.commissionPolicy.read().version}).code,'ok');
const activeCompletionPolicy = store.completionPolicy.read();
assert.equal(store.completionPolicy.publish({ mode: 'worker_only', expectedVersion: activeCompletionPolicy.version }).code, 'ok');
function completionPayload(orderId) {
  const order = store.getOrder(orderId);
  return {
    acceptanceKey: store.completionAcceptanceKey(order) || 'legacy-invalid-acceptance',
    actualHours: Number(order && order.durationHours) > 0 ? Number(order.durationHours) : null,
    finalAmount: Number.isSafeInteger(order && order.price) ? order.price : 0,
  };
}

after(() => harness.close());

// This monetary fixture exists only in this process's disposable SQLite database.
// It is not a tariff, payment test or authorization for real financial orders.
const FULL_ADDRESS = 'محله آزمایشی، خیابان آزمایش، پلاک ۱۲، واحد ۳';
const PRIVATE_NOTE = 'یادداشت خصوصی مشتری برای آزمون';
let phoneSequence = 7100;
const nextPhone = () => '0912' + String(phoneSequence++).padStart(7, '0');
const eventCount = (id, kind) => store.listOrderEvents(id).filter((event) => event.kind === kind).length;

async function actors(server) {
  const customer = await harness.login(server, nextPhone());
  const stranger = await harness.login(server, nextPhone());
  const worker = await harness.login(server, nextPhone(), 'WORKER');
  const otherWorker = await harness.login(server, nextPhone(), 'WORKER');
  const adminToken = await harness.adminLogin(server);
  for (const actor of [worker, otherWorker]) {
    const approved = await request(server, {
      method: 'PUT', pathname: '/api/admin/users/' + actor.user.id + '/status',
      token: adminToken, body: { status: 'APPROVED' },
    });
    assert.equal(approved.status, 200);
  }
  return { customer, stranger, worker, otherWorker, adminToken };
}

async function createOrder(server, customer, overrides = {}) {
  const created = await request(server, {
    method: 'POST', pathname: '/api/orders', token: customer.token,
    body: {
      customerName: 'مشتری آزمایشی', serviceTitle: 'خدمت آزمایشی ایزوله',
      address: FULL_ADDRESS, notes: PRIVATE_NOTE, date: '۱۴۰۵/۰۷/۲۰', time: 'صبح',
      price: 1000000, pricing: { total: 1000000 }, customerTier: 'VIP',
      expectedStartAt: new Date(Date.now() + 3600000).toISOString(),
      ...overrides,
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.order.status, 'PENDING');
  assert.equal(created.json.order.cleanerPhone, undefined);
  return created.json.order;
}

async function acceptOrder(server, worker, orderId) {
  const accepted = await request(server, {
    method: 'PUT', pathname: '/api/orders/' + orderId + '/accept', token: worker.token, body: {},
  });
  assert.equal(accepted.status, 200);
  return accepted.json.order;
}

async function customerOrder(server, customer, orderId) {
  const response = await request(server, { pathname: '/api/orders', token: customer.token });
  assert.equal(response.status, 200);
  const order = response.json.orders.find((entry) => entry.id === orderId);
  assert.ok(order);
  assert.equal(order.cleanerPhone, undefined);
  return order;
}

async function workerStartBody(server, worker, orderId) {
  const response = await request(server, { pathname: '/api/orders', token: worker.token });
  assert.equal(response.status, 200);
  const order = response.json.orders.find((entry) => entry.id === orderId);
  assert.ok(order);
  assert.equal(typeof order.startAcceptanceKey, 'string');
  return { acceptanceKey: order.startAcceptanceKey };
}

async function adminDecisionBody(server, adminToken, orderId, started, requestId) {
  const response = await request(server, { pathname: '/api/admin/orders/' + orderId + '/start-events', token: adminToken });
  assert.equal(response.status, 200);
  assert.equal(response.json.orderId, orderId);
  assert.equal(typeof response.json.startDecisionContext.acceptanceKey, 'string');
  return { started, requestId, ...response.json.startDecisionContext };
}

async function reportThenPrompt(server, worker, customer, orderId) {
  const body = await workerStartBody(server, worker, orderId);
  const reported = await request(server, {
    method: 'PUT', pathname: '/api/orders/' + orderId + '/start', token: worker.token, body,
  });
  assert.equal(reported.status, 200);
  assert.equal(reported.json.order.startReported, true);
  const order = await customerOrder(server, customer, orderId);
  assert.equal(order.startPrompt, 'confirm_report');
  assert.equal(typeof order.startPromptEventId, 'string');
  return order.startPromptEventId;
}

function effects(orderId, users) {
  return {
    order: store.getOrder(orderId), events: store.listOrderEvents(orderId),
    notifications: users.flatMap((user) => store.listNotifications(user.user.id).filter((n) => n.orderId === orderId)),
    ledger: store.listLedger().filter((entry) => entry.orderId === orderId),
  };
}

test('API lifecycle create -> accept -> start -> customer yes -> complete preserves status and privacy', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, stranger, worker, otherWorker } = await actors(server);
  const order = await createOrder(server, customer);
  const orderId = order.id;
  const available = await request(server, { pathname: '/api/orders/available', token: worker.token });
  const publicOrder = available.json.orders.find((entry) => entry.id === orderId);
  assert.ok(publicOrder);
  assert.equal(publicOrder.customerPhone, '');
  assert.equal(publicOrder.address === FULL_ADDRESS, false);
  assert.equal(publicOrder.notes, undefined);
  assert.equal(publicOrder.pricing, undefined);
  const assigned = await acceptOrder(server, worker, orderId);
  assert.equal(assigned.address, FULL_ADDRESS);
  assert.equal(assigned.customerPhone, store.getUser(customer.user.id).phone);
  assert.equal(assigned.notes, undefined);
  assert.equal(assigned.pricing, undefined);
  assert.equal(assigned.customerTier, undefined);
  assert.equal(assigned.customerId, undefined);
  const start = '/api/orders/' + orderId + '/start';
  const startBody = await workerStartBody(server, worker, orderId);
  assert.equal((await request(server, { method: 'PUT', pathname: start, body: {} })).status, 401);
  assert.equal((await request(server, { method: 'PUT', pathname: start, token: customer.token, body: {} })).status, 403);
  assert.equal((await request(server, { method: 'PUT', pathname: start, token: otherWorker.token, body: startBody })).status, 403);
  assert.equal((await request(server, { method: 'PUT', pathname: start, token: worker.token, body: {} })).status, 400);
  assert.equal((await request(server, { method: 'PUT', pathname: start, token: worker.token,
    body: { acceptanceKey: 'isolated-wrong-acceptance' } })).status, 409);
  const forgedFields = await request(server, {
    method: 'PUT', pathname: start, token: worker.token,
    body: { ...startBody, status: 'COMPLETED', agreedStartAt: '1900-01-01T00:00:00.000Z', actorId: stranger.user.id },
  });
  assert.equal(forgedFields.status, 200);
  assert.equal(store.getOrder(orderId).agreedStartAt, null);
  const promptEventId = await reportThenPrompt(server, worker, customer, orderId);
  assert.equal(store.getOrder(orderId).status, 'ACCEPTED');
  assert.equal(store.getOrder(orderId).startStatus, 'worker_reported');
  const reports = await Promise.all([1, 2].map(() => request(server, {
    method: 'PUT', pathname: start, token: worker.token, body: startBody,
  })));
  assert.equal(reports.every((response) => response.status === 200), true);
  assert.equal(eventCount(orderId, 'START_REPORTED_BY_WORKER'), 1);
  const answerPath = '/api/orders/' + orderId + '/start-response';
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: stranger.token, body: { answer: 'yes', promptEventId },
  })).status, 403);
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'bad', promptEventId },
  })).status, 400);
  const answer = await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'yes', promptEventId },
  });
  assert.equal(answer.status, 200);
  assert.equal(answer.json.order.status, 'ACCEPTED');
  assert.equal(answer.json.order.startStatus, 'customer_confirmed');
  const report = store.listOrderEvents(orderId).find((event) => event.kind === 'START_REPORTED_BY_WORKER');
  assert.equal(answer.json.order.agreedStartAt, report.claimedAt);
  assert.equal(answer.json.order.startPrompt, null);
  assert.equal(answer.json.order.startPromptEventId, null);
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'yes', promptEventId },
  })).status, 200);
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'no', promptEventId },
  })).status, 409);
  assert.equal(eventCount(orderId, 'START_CONFIRMED_BY_CUSTOMER'), 1);
  const complete = await request(server, {
    method: 'PUT', pathname: '/api/orders/' + orderId + '/complete', token: worker.token, body: completionPayload(orderId),
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.json.order.status, 'COMPLETED');
  assert.equal(complete.json.order.address === FULL_ADDRESS, false);
  assert.equal(complete.json.order.customerPhone, '');
  assert.equal(complete.json.order.notes, undefined);
  assert.equal(complete.json.order.pricing, undefined);
  assert.equal((await customerOrder(server, customer, orderId)).cleanerPhone, undefined);
});

test('customer no opens one dispute; admin authenticated resolution is replay-safe and correction preserves history', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, adminToken } = await actors(server);
  const order = await createOrder(server, customer);
  await acceptOrder(server, worker, order.id);
  const promptEventId = await reportThenPrompt(server, worker, customer, order.id);
  const answerPath = '/api/orders/' + order.id + '/start-response';
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await request(server, {
      method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'no', promptEventId },
    })).status, 200);
  }
  assert.equal(store.getOrder(order.id).status, 'ACCEPTED');
  assert.equal(store.getOrder(order.id).startStatus, 'disputed');
  assert.equal(store.getOrder(order.id).agreedStartAt, null);
  assert.equal(eventCount(order.id, 'START_REPORTED_BY_WORKER'), 1);
  assert.equal(eventCount(order.id, 'START_DENIED_BY_CUSTOMER'), 1);
  assert.equal(eventCount(order.id, 'DISPUTE_OPENED'), 1);
  const history = store.listOrderEvents(order.id);
  const adminPath = '/api/admin/orders/' + order.id + '/start-decision';
  const auditPath = '/api/admin/orders/' + order.id + '/start-events';
  const firstDecision = await adminDecisionBody(server, adminToken, order.id, false, 'isolated_decision_first');
  for (const token of [undefined, customer.token, worker.token]) {
    assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token, body: { started: true } })).status, 401);
    assert.equal((await request(server, { pathname: auditPath, token })).status, 401);
  }
  assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token: adminToken, body: { started: 'yes' } })).status, 400);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token: adminToken, body: firstDecision })).status, 200);
  }
  assert.equal(eventCount(order.id, 'ADMIN_DECISION'), 1);
  assert.equal(store.startCountsAsStarted(store.getOrder(order.id)), false);
  const correctedDecision = await adminDecisionBody(server, adminToken, order.id, true, 'isolated_decision_corrected');
  assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token: adminToken, body: correctedDecision })).status, 200);
  const decisions = store.listOrderEvents(order.id).filter((event) => event.kind === 'ADMIN_DECISION');
  assert.equal(decisions.length, 2);
  assert.equal(decisions[1].correctsEventId, decisions[0].id);
  assert.deepEqual(decisions.map((event) => ({ subject: event.data.subject, started: event.data.started })),
    [{ subject: 'start', started: false }, { subject: 'start', started: true }]);
  assert.equal(store.startCountsAsStarted(store.getOrder(order.id)), true);
  assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token: adminToken, body: firstDecision })).status, 200);
  assert.equal(store.startCountsAsStarted(store.getOrder(order.id)), true);
  assert.equal(eventCount(order.id, 'ADMIN_DECISION'), 2);
  const alteredReplay = { ...firstDecision, started: true };
  assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token: adminToken, body: alteredReplay })).status, 409);
  const staleDecision = { ...firstDecision, requestId: 'isolated_decision_stale' };
  assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token: adminToken, body: staleDecision })).status, 409);
  assert.deepEqual(store.listOrderEvents(order.id).slice(0, history.length), history);
  const audit = await request(server, { pathname: auditPath, token: adminToken });
  assert.equal(audit.status, 200);
  assert.deepEqual(audit.json.events, store.listOrderEvents(order.id));
  assert.equal(audit.json.startDecisionContext.expectedDecisionEventId, decisions[1].id);
  const expiredAdminToken = await harness.adminLogin(server);
  const originalNow = Date.now;
  const advance = originalNow() + 13 * 60 * 60 * 1000;
  try {
    Date.now = () => advance;
    assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token: expiredAdminToken,
      body: correctedDecision })).status, 401);
  } finally {
    Date.now = originalNow;
  }
  assert.equal(eventCount(order.id, 'ADMIN_DECISION'), 2);
  assert.equal((await request(server, { method: 'POST', pathname: '/api/admin/logout', token: adminToken })).status, 200);
  assert.equal((await request(server, { method: 'PUT', pathname: adminPath, token: adminToken, body: { started: false } })).status, 401);
});

test('unresolved start disputes block worker completion without effects; existing admin resolution unlocks it', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, otherWorker, adminToken } = await actors(server);
  for (const started of [false, true]) {
    const order = await createOrder(server, customer);
    await acceptOrder(server, worker, order.id);
    const promptEventId = await reportThenPrompt(server, worker, customer, order.id);
    assert.equal((await request(server, {
      method: 'PUT', pathname: '/api/orders/' + order.id + '/start-response',
      token: customer.token, body: { answer: 'no', promptEventId },
    })).status, 200);
    const completePath = '/api/orders/' + order.id + '/complete';
    for (const status of ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']) {
      const current = store.getOrder(order.id);
      current.status = status;
      store.updateOrder(current);
      const before = effects(order.id, [customer, worker, otherWorker]);
      assert.equal(store.reportCompletion(order.id, worker.user, completionPayload(order.id)).code, 'start-disputed');
      const rejected = await request(server, {
        method: 'PUT', pathname: completePath, token: worker.token,
        body: completionPayload(order.id),
      });
      assert.equal(rejected.status, 409);
      assert.equal(rejected.json.code, 'start-disputed');
      assert.deepEqual(effects(order.id, [customer, worker, otherWorker]), before);
      assert.equal(store.getOrder(order.id).startStatus, 'disputed');
    }
    const workerList = await request(server, { pathname: '/api/orders', token: worker.token });
    assert.equal(workerList.json.orders.find((entry) => entry.id === order.id).startStatus, 'disputed');
    const decision = await adminDecisionBody(server, adminToken, order.id, started,
      'complete_dispute_' + String(started));
    const resolved = await request(server, {
      method: 'PUT', pathname: '/api/admin/orders/' + order.id + '/start-decision',
      token: adminToken, body: decision,
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.json.order.startStatus, 'admin_resolved');
    const complete = await request(server, {
      method: 'PUT', pathname: completePath, token: worker.token, body: completionPayload(order.id),
    });
    assert.equal(complete.status, 200);
    assert.equal(complete.json.order.status, 'COMPLETED');
    assert.equal(complete.json.order.startStatus, 'admin_resolved');
    assert.equal(store.getOrder(order.id).price, order.price);
    assert.equal(eventCount(order.id, 'START_DENIED_BY_CUSTOMER'), 1);
    assert.equal(eventCount(order.id, 'DISPUTE_OPENED'), 1);
    assert.equal(eventCount(order.id, 'ADMIN_DECISION'), 1);
  }
});

test('start and response reject forged actors, bad references, invalid sessions and blocked accounts without effects', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, stranger, worker, otherWorker, adminToken } = await actors(server);
  const order = await createOrder(server, customer);
  await acceptOrder(server, worker, order.id);
  const startPath = '/api/orders/' + order.id + '/start';
  const startBody = await workerStartBody(server, worker, order.id);
  const before = effects(order.id, [customer, worker]);
  const forbidden = await request(server, {
    method: 'PUT', pathname: startPath, token: otherWorker.token,
    body: { ...startBody, cleanerId: worker.user.id, actorId: worker.user.id, role: 'WORKER', startStatus: 'customer_confirmed' },
  });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(effects(order.id, [customer, worker]), before);
  const expired = await harness.login(server, nextPhone(), 'WORKER');
  store.deleteSession(expired.token);
  store.createSession(expired.token, { userId: expired.user.id, role: 'WORKER', expires: Date.now() - 1 });
  assert.equal((await request(server, { method: 'PUT', pathname: startPath, token: expired.token, body: {} })).status, 401);
  assert.equal((await request(server, { method: 'PUT', pathname: startPath, token: 'wrong-test-session', body: {} })).status, 401);
  assert.deepEqual(effects(order.id, [customer, worker]), before);
  const promptEventId = await reportThenPrompt(server, worker, customer, order.id);
  const answerPath = '/api/orders/' + order.id + '/start-response';
  const reported = effects(order.id, [customer, worker]);
  for (const body of [{ answer: 'yes' }, { answer: 'yes', promptEventId: 4 }, { answer: 'maybe', promptEventId }]) {
    assert.equal((await request(server, { method: 'PUT', pathname: answerPath, token: customer.token, body })).status, 400);
  }
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'yes', promptEventId: 'unknown-event' },
  })).status, 409);
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: stranger.token, body: { answer: 'yes', promptEventId, userId: customer.user.id },
  })).status, 403);
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: worker.token, body: { answer: 'yes', promptEventId },
  })).status, 403);
  assert.deepEqual(effects(order.id, [customer, worker]), reported);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/admin/users/' + worker.user.id + '/status', token: adminToken, body: { status: 'BLOCKED' },
  })).status, 200);
  assert.equal((await request(server, { method: 'PUT', pathname: startPath, token: worker.token, body: {} })).status, 403);
  const unapproved = await harness.login(server, nextPhone(), 'WORKER');
  assert.equal((await request(server, { method: 'PUT', pathname: startPath, token: unapproved.token, body: {} })).status, 403);
  assert.deepEqual(effects(order.id, [customer, worker]), reported);
});

test('lost committed create, start and customer response can be retried without duplicate orders or events', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker } = await actors(server);
  const clientRequestId = 'isolated_lost_response_01';
  const body = {
    clientRequestId, serviceTitle: 'خدمت آزمایشی ایزوله', address: FULL_ADDRESS,
    date: '۱۴۰۵/۰۷/۲۰', time: 'صبح', price: 1000000,
  };
  assert.equal((await request(server, {
    method: 'POST', pathname: '/api/orders', token: customer.token, body, loseResponse: true,
  })).responseLost, true);
  const retried = await request(server, { method: 'POST', pathname: '/api/orders', token: customer.token, body });
  assert.equal(retried.status, 200);
  assert.equal(retried.json.duplicate, true);
  const orderId = retried.json.order.id;
  assert.equal(store.getOrders({ customerId: customer.user.id }).length, 1);
  await acceptOrder(server, worker, orderId);
  const startPath = '/api/orders/' + orderId + '/start';
  const startBody = await workerStartBody(server, worker, orderId);
  assert.equal((await request(server, {
    method: 'PUT', pathname: startPath, token: worker.token, body: startBody, loseResponse: true,
  })).responseLost, true);
  assert.equal((await request(server, { method: 'PUT', pathname: startPath, token: worker.token, body: startBody })).status, 200);
  const promptEventId = (await customerOrder(server, customer, orderId)).startPromptEventId;
  const answerPath = '/api/orders/' + orderId + '/start-response';
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'yes', promptEventId }, loseResponse: true,
  })).responseLost, true);
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'yes', promptEventId },
  })).status, 200);
  assert.equal(eventCount(orderId, 'ORDER_ACCEPTED'), 1);
  assert.equal(eventCount(orderId, 'START_REPORTED_BY_WORKER'), 1);
  assert.equal(eventCount(orderId, 'START_CONFIRMED_BY_CUSTOMER'), 1);
  assert.equal(store.listNotifications(customer.user.id).filter((n) => n.orderId === orderId && n.kind === 'START_REPORTED').length, 1);
});

test('reassign and return to pending reset start summaries; delayed old-cycle response cannot confirm new worker', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, otherWorker, adminToken } = await actors(server);
  const order = await createOrder(server, customer);
  await acceptOrder(server, worker, order.id);
  const oldStartBody = await workerStartBody(server, worker, order.id);
  const oldPrompt = await reportThenPrompt(server, worker, customer, order.id);
  const answerPath = '/api/orders/' + order.id + '/start-response';
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'yes', promptEventId: oldPrompt },
  })).status, 200);
  const oldEvents = store.listOrderEvents(order.id);
  const adminPath = '/api/admin/orders/' + order.id;
  assert.equal((await request(server, {
    method: 'PUT', pathname: adminPath, token: adminToken, body: { cleanerId: otherWorker.user.id },
  })).status, 200);
  assert.equal(store.getOrder(order.id).startStatus, 'not_recorded');
  assert.equal(store.getOrder(order.id).agreedStartAt, null);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + order.id + '/start', token: worker.token, body: oldStartBody,
  })).status, 403);
  const newPrompt = await reportThenPrompt(server, otherWorker, customer, order.id);
  assert.notEqual(newPrompt, oldPrompt);
  const stale = await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'yes', promptEventId: oldPrompt },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.order.startPromptEventId, newPrompt);
  assert.equal(store.getOrder(order.id).startStatus, 'worker_reported');
  assert.equal((await request(server, {
    method: 'PUT', pathname: answerPath, token: customer.token, body: { answer: 'no', promptEventId: newPrompt },
  })).status, 200);
  assert.equal((await request(server, {
    method: 'PUT', pathname: adminPath, token: adminToken, body: { status: 'PENDING' },
  })).status, 200);
  assert.equal(store.getOrder(order.id).acceptedAt, null);
  assert.equal(store.getOrder(order.id).cleanerId, null);
  assert.equal(store.getOrder(order.id).startStatus, 'not_recorded');
  assert.equal(store.getOrder(order.id).agreedStartAt, null);
  await acceptOrder(server, worker, order.id);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + order.id + '/start', token: worker.token, body: oldStartBody,
  })).status, 409);
  const thirdPrompt = await reportThenPrompt(server, worker, customer, order.id);
  assert.notEqual(thirdPrompt, oldPrompt);
  assert.notEqual(thirdPrompt, newPrompt);
  assert.deepEqual(store.listOrderEvents(order.id).slice(0, oldEvents.length), oldEvents);
  assert.equal(eventCount(order.id, 'ORDER_ACCEPTED'), 3);
  assert.equal(eventCount(order.id, 'START_REPORTED_BY_WORKER'), 3);
});

test('cancel before start, during dispute and closed orders reject start and response with no extra effects', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, adminToken } = await actors(server);
  const pending = await createOrder(server, customer);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + pending.id + '/cancel', token: customer.token, body: {},
  })).status, 200);
  const pendingEffects = effects(pending.id, [customer, worker]);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + pending.id + '/start', token: worker.token, body: { acceptanceKey: 'isolated-no-acceptance' },
  })).status, 403);
  assert.deepEqual(effects(pending.id, [customer, worker]), pendingEffects);
  const order = await createOrder(server, customer);
  await acceptOrder(server, worker, order.id);
  const startBody = await workerStartBody(server, worker, order.id);
  const promptEventId = await reportThenPrompt(server, worker, customer, order.id);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + order.id + '/start-response', token: customer.token,
    body: { answer: 'no', promptEventId },
  })).status, 200);
  const cancelPath = '/api/orders/' + order.id + '/cancel';
  const quote = await request(server, { method: 'PUT', pathname: cancelPath, token: customer.token, body: {} });
  assert.equal(quote.status, 409);
  assert.equal((await request(server, {
    method: 'PUT', pathname: cancelPath, token: customer.token, body: { confirmQuote: quote.json.quote },
  })).status, 200);
  assert.equal(store.getOrder(order.id).status, 'CANCEL_REQUESTED');
  const locked = effects(order.id, [customer, worker]);
  for (const [suffix, token, body] of [
    ['start', worker.token, startBody], ['start-response', customer.token, { answer: 'no', promptEventId }],
    ['complete', worker.token, completionPayload(order.id)],
  ]) {
    const response = await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/' + suffix, token, body });
    assert.equal(response.status, suffix === 'complete' ? 409 : 400);
  }
  assert.deepEqual(effects(order.id, [customer, worker]), locked);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status: 'CANCELLED' },
  })).status, 200);
  const cancelled = effects(order.id, [customer, worker]);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + order.id + '/start', token: worker.token, body: startBody,
  })).status, 400);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + order.id + '/start-response', token: customer.token,
    body: { answer: 'yes', promptEventId },
  })).status, 400);
  assert.deepEqual(effects(order.id, [customer, worker]), cancelled);
});

test('configured prompt delay respects exact time boundary and customer prompt yes/no without fabricating agreed time', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker } = await actors(server);
  const fixed = Date.now();
  const originalNow = Date.now;
  Date.now = () => fixed;
  t.after(() => { Date.now = originalNow; });
  // This timing value exists solely in the isolated test DB and is not an operational default.
  assert.equal(store.publishRule({ ruleKey: 'start.promptDelayMinutes', value: { minutes: 2 }, actor: 'system' }).code, 'ok');
  t.after(() => store.publishRule({ ruleKey: 'start.promptDelayMinutes', value: { minutes: 2 }, active: false, actor: 'system' }));
  const beforeDue = await createOrder(server, customer, { expectedStartAt: new Date(fixed - 120000 + 1).toISOString() });
  const atDue = await createOrder(server, customer, { expectedStartAt: new Date(fixed - 120000).toISOString() });
  const afterDue = await createOrder(server, customer, { expectedStartAt: new Date(fixed - 120000 - 1).toISOString() });
  for (const order of [beforeDue, atDue, afterDue]) await acceptOrder(server, worker, order.id);
  store.sweepStartPrompts();
  assert.equal(eventCount(beforeDue.id, 'START_PROMPT_SENT'), 0);
  assert.equal(eventCount(atDue.id, 'START_PROMPT_SENT'), 1);
  assert.equal(eventCount(afterDue.id, 'START_PROMPT_SENT'), 1);
  assert.equal(store.sweepStartPrompts(), 0);
  const yesPrompt = await customerOrder(server, customer, atDue.id);
  assert.equal(yesPrompt.startPrompt, 'ask_started');
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + atDue.id + '/start-response', token: customer.token,
    body: { answer: 'yes', promptEventId: yesPrompt.startPromptEventId },
  })).status, 200);
  assert.equal(store.getOrder(atDue.id).startStatus, 'customer_reported');
  assert.equal(store.getOrder(atDue.id).agreedStartAt, null);
  const noPrompt = await customerOrder(server, customer, afterDue.id);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + afterDue.id + '/start-response', token: customer.token,
    body: { answer: 'no', promptEventId: noPrompt.startPromptEventId },
  })).status, 200);
  assert.equal(store.getOrder(afterDue.id).startStatus, 'not_recorded');
  assert.equal(store.getOrder(afterDue.id).agreedStartAt, null);
  assert.equal(eventCount(afterDue.id, 'DISPUTE_OPENED'), 0);
  assert.equal(eventCount(atDue.id, 'START_PROMPT_ANSWERED'), 1);
  assert.equal((await customerOrder(server, customer, afterDue.id)).startPrompt, null);
});

test('missing order and pending order cannot record a start or customer confirmation', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker } = await actors(server);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/missing-isolated-order/start', token: worker.token, body: { acceptanceKey: 'isolated-missing' },
  })).status, 404);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/missing-isolated-order/start-response', token: customer.token,
    body: { answer: 'yes', promptEventId: 'missing-event' },
  })).status, 404);
  const order = await createOrder(server, customer);
  const before = effects(order.id, [customer, worker]);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + order.id + '/start', token: worker.token, body: { acceptanceKey: 'isolated-no-acceptance' },
  })).status, 403);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/' + order.id + '/start-response', token: customer.token,
    body: { answer: 'yes', promptEventId: 'missing-event' },
  })).status, 400);
  assert.deepEqual(effects(order.id, [customer, worker]), before);
});
