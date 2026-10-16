const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestHarness } = require('./testAuthHarness');

const harness = createTestHarness('paksho-complete-isolated-');
const { store, request } = harness;
after(() => harness.close());

// These values and accounts exist only in this disposable database, never as application defaults.
assert.equal(store.publishRule({
  ruleKey: 'earn.orderCompleted', value: { customerAmount: 7, workerAmount: 11 }, actor: 'system',
}).code, 'ok');
const FULL_ADDRESS = 'محله آزمایشی، خیابان آزمون، پلاک ۲۴';
let phoneSequence = 8100;
const nextPhone = () => '0912' + String(phoneSequence++).padStart(7, '0');

async function actors(server) {
  const customer = await harness.login(server, nextPhone());
  const worker = await harness.login(server, nextPhone(), 'WORKER');
  const otherWorker = await harness.login(server, nextPhone(), 'WORKER');
  const adminToken = await harness.adminLogin(server);
  for (const actor of [worker, otherWorker]) {
    assert.equal((await request(server, {
      method: 'PUT', pathname: '/api/admin/users/' + actor.user.id + '/status', token: adminToken,
      body: { status: 'APPROVED' },
    })).status, 200);
  }
  return { customer, worker, otherWorker, adminToken };
}

async function createOrder(server, customer) {
  const response = await request(server, {
    method: 'POST', pathname: '/api/orders', token: customer.token,
    body: {
      serviceTitle: 'خدمت آزمایشی ایزوله', customerName: 'مشتری آزمایشی',
      address: FULL_ADDRESS, addressNotes: 'یادداشت خصوصی نشانی', notes: 'یادداشت خصوصی مشتری',
      date: '۱۴۰۵/۰۷/۲۰', time: 'صبح', price: 1000000,
      pricing: { total: 1000000 }, customerTier: 'VIP',
    },
  });
  assert.equal(response.status, 200);
  return response.json.order;
}

async function acceptOrder(server, worker, orderId) {
  const response = await request(server, {
    method: 'PUT', pathname: '/api/orders/' + orderId + '/accept', token: worker.token, body: {},
  });
  assert.equal(response.status, 200);
}

function snapshot(orderId, customer, worker) {
  return {
    order: store.getOrder(orderId), events: store.listOrderEvents(orderId),
    ledger: store.listLedger().filter((entry) => entry.orderId === orderId),
    notifications: [customer, worker].flatMap((user) =>
      store.listNotifications(user.user.id).filter((notification) => notification.orderId === orderId)),
  };
}

function assertCompletedOnce(orderId, customer, worker) {
  const ledger = store.listLedger().filter((entry) => entry.orderId === orderId && entry.reasonCode === 'order_completed');
  assert.equal(ledger.length, 2);
  assert.equal(ledger.filter((entry) => entry.userId === customer.user.id).length, 1);
  assert.equal(ledger.filter((entry) => entry.userId === worker.user.id).length, 1);
  for (const actor of [customer, worker]) {
    assert.equal(store.listNotifications(actor.user.id).filter((n) => n.orderId === orderId && n.kind === 'ORDER_COMPLETED').length, 1);
  }
}

test('completion stays available from all four active statuses without requiring a start report', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, adminToken } = await actors(server);
  for (const status of ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']) {
    await t.test(status, async () => {
      const order = await createOrder(server, customer);
      await acceptOrder(server, worker, order.id);
      if (status !== 'ACCEPTED') {
        assert.equal((await request(server, {
          method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status },
        })).status, 200);
      }
      assert.equal(store.getOrder(order.id).expectedStartAt, null);
      assert.equal(store.getOrder(order.id).startStatus, 'not_recorded');
      const completed = await request(server, {
        method: 'PUT', pathname: '/api/orders/' + order.id + '/complete', token: worker.token, body: {},
      });
      assert.equal(completed.status, 200);
      assert.equal(completed.json.order.status, 'COMPLETED');
      assert.ok(completed.json.order.completedAt);
      assert.equal(completed.json.order.startStatus, 'not_recorded');
      assert.equal(completed.json.order.customerPhone, '');
      assert.equal(completed.json.order.address === FULL_ADDRESS, false);
      assert.equal(completed.json.order.addressNotes, null);
      for (const privateKey of ['notes', 'pricing', 'customerTier', 'customerId']) {
        assert.equal(completed.json.order[privateKey], undefined);
      }
      assertCompletedOnce(order.id, customer, worker);
    });
  }
});

test('historical active orders without acceptedAt or expectedStartAt can still be completed', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker } = await actors(server);
  for (const status of ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']) {
    // A pre-migration row, not an API that can supply or overwrite acceptedAt.
    const orderId = 'LEGACY-COMPLETION-' + status;
    store.createOrder({
      id: orderId, customerId: customer.user.id, customerName: 'مشتری آزمایشی',
      customerPhone: store.getUser(customer.user.id).phone, serviceTitle: 'خدمت آزمایشی',
      address: FULL_ADDRESS, date: '۱۴۰۵/۰۷/۲۰', time: 'صبح', price: 1000000,
      status, cleanerId: worker.user.id, cleanerName: 'متخصص آزمایشی',
      cleanerPhone: store.getUser(worker.user.id).phone, createdAt: new Date().toISOString(),
    });
    assert.equal(store.getOrder(orderId).acceptedAt, null);
    assert.equal(store.getOrder(orderId).expectedStartAt, null);
    const complete = await request(server, {
      method: 'PUT', pathname: '/api/orders/' + orderId + '/complete', token: worker.token, body: {},
    });
    assert.equal(complete.status, 200);
    assert.equal(store.getOrder(orderId).acceptedAt, null);
    assertCompletedOnce(orderId, customer, worker);
  }
});

test('completion rejects wrong role, worker forgery, blocked/unapproved worker and invalid/expired/revoked sessions without effects', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, otherWorker, adminToken } = await actors(server);
  const order = await createOrder(server, customer);
  await acceptOrder(server, worker, order.id);
  const endpoint = '/api/orders/' + order.id + '/complete';
  const before = snapshot(order.id, customer, worker);
  for (const [token, expected, body] of [
    [undefined, 401, {}], ['not-a-valid-session', 401, {}],
    [customer.token, 403, {}], [otherWorker.token, 403, { cleanerId: worker.user.id }],
    [worker.token, 403, { cleanerId: otherWorker.user.id }],
  ]) {
    assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token, body })).status, expected);
    assert.deepEqual(snapshot(order.id, customer, worker), before);
  }
  const unapproved = await harness.login(server, nextPhone(), 'WORKER');
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: unapproved.token, body: {} })).status, 403);
  store.deleteSession(worker.token);
  store.createSession(worker.token, { userId: worker.user.id, role: 'WORKER', expires: Date.now() - 1 });
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {} })).status, 401);
  store.createSession(worker.token, { userId: worker.user.id, role: 'WORKER', expires: Date.now() + 3600000 });
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/admin/users/' + worker.user.id + '/status', token: adminToken, body: { status: 'BLOCKED' },
  })).status, 200);
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {} })).status, 403);
  assert.equal((await request(server, { method: 'POST', pathname: '/api/auth/logout', token: worker.token })).status, 200);
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {} })).status, 401);
  assert.deepEqual(snapshot(order.id, customer, worker), before);
});

test('completion retry after a lost response or concurrent request never repeats points, notifications or completedAt', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, adminToken } = await actors(server);
  const order = await createOrder(server, customer);
  await acceptOrder(server, worker, order.id);
  const endpoint = '/api/orders/' + order.id + '/complete';
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {}, loseResponse: true })).responseLost, true);
  const committed = snapshot(order.id, customer, worker);
  assert.equal(committed.order.status, 'COMPLETED');
  const retries = await Promise.all([1, 2].map(() => request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {} })));
  // Preserve the existing API contract for an already completed order: HTTP400.
  assert.equal(retries.every((response) => response.status === 400), true);
  assert.deepEqual(snapshot(order.id, customer, worker), committed);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status: 'COMPLETED' },
  })).status, 200);
  assert.equal(store.getOrder(order.id).completedAt, committed.order.completedAt);
  assertCompletedOnce(order.id, customer, worker);
  const recovered = await request(server, { pathname: '/api/orders', token: worker.token });
  assert.equal(recovered.json.orders.find((entry) => entry.id === order.id).status, 'COMPLETED');
});

test('pending, cancel requested and cancelled orders cannot complete and do not earn completion points', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, adminToken } = await actors(server);
  const order = await createOrder(server, customer);
  const endpoint = '/api/orders/' + order.id + '/complete';
  const pending = snapshot(order.id, customer, worker);
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {} })).status, 400);
  assert.deepEqual(snapshot(order.id, customer, worker), pending);
  await acceptOrder(server, worker, order.id);
  const cancelPath = '/api/orders/' + order.id + '/cancel';
  const quote = await request(server, { method: 'PUT', pathname: cancelPath, token: customer.token, body: {} });
  assert.equal(quote.status, 409);
  assert.equal((await request(server, {
    method: 'PUT', pathname: cancelPath, token: customer.token, body: { confirmQuote: quote.json.quote },
  })).status, 200);
  assert.equal(store.getOrder(order.id).status, 'CANCEL_REQUESTED');
  const requested = snapshot(order.id, customer, worker);
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {} })).status, 400);
  assert.deepEqual(snapshot(order.id, customer, worker), requested);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status: 'CANCELLED' },
  })).status, 200);
  const cancelled = snapshot(order.id, customer, worker);
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {} })).status, 400);
  assert.deepEqual(snapshot(order.id, customer, worker), cancelled);
  assert.equal(cancelled.ledger.filter((entry) => entry.reasonCode === 'order_completed').length, 0);
});

test('reassigned order completes only for the current worker, preserving previous acceptance history', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker, otherWorker, adminToken } = await actors(server);
  const order = await createOrder(server, customer);
  await acceptOrder(server, worker, order.id);
  const firstAcceptance = store.listOrderEvents(order.id).find((event) => event.kind === 'ORDER_ACCEPTED');
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { cleanerId: otherWorker.user.id },
  })).status, 200);
  const endpoint = '/api/orders/' + order.id + '/complete';
  const before = snapshot(order.id, customer, otherWorker);
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: worker.token, body: {} })).status, 403);
  assert.deepEqual(snapshot(order.id, customer, otherWorker), before);
  assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token: otherWorker.token, body: {} })).status, 200);
  assertCompletedOnce(order.id, customer, otherWorker);
  assert.equal(store.listLedger(worker.user.id).filter((entry) => entry.orderId === order.id).length, 0);
  assert.deepEqual(store.listOrderEvents(order.id).find((event) => event.id === firstAcceptance.id), firstAcceptance);
});

test('missing order returns404 and customer view never discloses the assigned worker phone', async (t) => {
  const server = await harness.serverFor(t);
  const { customer, worker } = await actors(server);
  assert.equal((await request(server, {
    method: 'PUT', pathname: '/api/orders/no-such-completion-order/complete', token: worker.token, body: {},
  })).status, 404);
  const order = await createOrder(server, customer);
  await acceptOrder(server, worker, order.id);
  const orders = await request(server, { pathname: '/api/orders', token: customer.token });
  const customerView = orders.json.orders.find((entry) => entry.id === order.id);
  assert.equal(customerView.cleanerPhone, undefined);
  assert.equal(orders.text.includes(store.getUser(worker.user.id).phone), false);
});
