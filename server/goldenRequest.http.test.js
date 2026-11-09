'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'golden-request-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-golden-request-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

test('D-83 golden request: hidden, priced independently, void on decline or expiry', async (t) => {
  const seeded = seedCommittedPolicy(process.env, {
    companyId: 'company-golden-request', currencyUnit: 'toman',
    versions: [{
      id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z',
      services: {
        hourly: { model: 'hourly', rate: 1000, minQuantity: 1, maxQuantity: 8 },
        extra: { model: 'hourly', rate: 1000, minQuantity: 1, maxQuantity: 8, surcharges: [{ id: 'tools', optionId: 'tools', amount: 100 }] },
        staircase_common_areas: { model: 'fixed', rate: 500000 },
      },
    }],
  });
  assert.equal(seeded.ok, true);
  const harness = createTestHarness('paksho-golden-request-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const adminToken = await harness.adminLogin(server);
  const customer = await harness.login(server, '09120000511');
  const targetLogin = await harness.login(server, '09120000512', 'WORKER');
  const otherLogin = await harness.login(server, '09120000513', 'WORKER');
  for (const login of [targetLogin, otherLogin]) {
    const user = harness.store.getUser(login.user.id);
    user.status = 'APPROVED';
    harness.store.updateUser(user);
  }
  const customerReq = (method, pathname, body) => request(server, { method, pathname, token: customer.token, body });
  const asWorker = (login, method, pathname, body) => request(server, { method, pathname, token: login.token, body });
  const adminReq = (method, pathname, body) => request(server, { method, pathname, token: adminToken, body });

  async function quoted(body) {
    const response = await customerReq('POST', '/api/pricing/quote', body);
    assert.equal(response.status, 200, JSON.stringify(response.json));
    return response.json.quote;
  }
  async function place(quote, extra) {
    return customerReq('POST', '/api/orders', {
      serviceTitle: 'درخواست طلایی', address: 'آدرس ساختگی', date: '1405-01-01', time: '10:00',
      quoteToken: quote.quoteToken, confirmedTotal: quote.total, directRequestWorkerId: targetLogin.user.id, ...extra,
    });
  }
  async function sees(login, orderId) {
    const listed = await asWorker(login, 'GET', '/api/orders/available');
    assert.equal(listed.status, 200);
    return listed.json.orders.some((order) => order.id === orderId);
  }

  const hourly = await quoted({ serviceId: 'hourly', quantity: 2, directRequestWorkerId: targetLogin.user.id });
  assert.equal(hourly.total, 2600);
  const stairs = await quoted({ serviceId: 'staircase_common_areas', directRequestWorkerId: targetLogin.user.id });
  assert.equal(stairs.total, 650000);
  const tools = await quoted({ serviceId: 'extra', quantity: 2, directRequestWorkerId: targetLogin.user.id, options: { tools: true } });
  assert.equal(tools.total, 2700);
  assert.deepEqual(tools.surcharges, [{ id: 'tools', amount: 100 }]);
  assert.equal((await customerReq('POST', '/api/pricing/quote', {
    serviceId: 'hourly', quantity: 2, directRequestWorkerId: targetLogin.user.id, workerTier: 'silver',
  })).status, 400);
  assert.equal((await customerReq('POST', '/api/pricing/quote', {
    serviceId: 'hourly', quantity: 2, directRequestWorkerId: 'USER-missing',
  })).status, 400);

  const created = await place(hourly, { serviceId: 'hourly', quantity: 2, durationHours: 2, clientRequestId: 'goldreq01' });
  assert.equal(created.status, 200);
  assert.equal(created.json.order.price, 2600);
  assert.equal(created.json.order.directRequestWorkerId, targetLogin.user.id);
  assert.equal(created.json.order.requestedWorkerTier, null);
  const orderId = created.json.order.id;
  assert.equal(await sees(otherLogin, orderId), false);
  assert.equal(await sees(targetLogin, orderId), true);
  assert.equal((await asWorker(otherLogin, 'PUT', `/api/orders/${orderId}/accept`, {})).status, 403);
  assert.equal((await asWorker(targetLogin, 'PUT', `/api/orders/${orderId}/accept`, {})).status, 200);

  const declineQuote = await quoted({ serviceId: 'hourly', quantity: 1, directRequestWorkerId: targetLogin.user.id });
  const declineOrder = await place(declineQuote, { serviceId: 'hourly', quantity: 1, durationHours: 1, clientRequestId: 'goldreq02' });
  const declineId = declineOrder.json.order.id;
  const beforeWallet = harness.store.workerWallet.read(targetLogin.user.id);
  const declined = await asWorker(targetLogin, 'PUT', `/api/orders/${declineId}/direct-request/decline`, {});
  assert.equal(declined.status, 200);
  assert.equal(declined.json.order.status, 'CANCELLED');
  assert.equal(await sees(targetLogin, declineId), false);
  assert.equal(await sees(otherLogin, declineId), false);
  assert.deepEqual(harness.store.workerWallet.read(targetLogin.user.id), beforeWallet);
  assert.equal(harness.store.listOrderEvents(declineId).some((event) => event.kind === 'ORDER_CANCELLED'), true);

  const again = await place(
    await quoted({ serviceId: 'hourly', quantity: 1, directRequestWorkerId: targetLogin.user.id }),
    { serviceId: 'hourly', quantity: 1, durationHours: 1, clientRequestId: 'goldreq03' },
  );
  assert.equal(again.status, 200);

  const expiring = await place(
    await quoted({ serviceId: 'hourly', quantity: 1, directRequestWorkerId: targetLogin.user.id }),
    { serviceId: 'hourly', quantity: 1, durationHours: 1, clientRequestId: 'goldreq04' },
  );
  const expireId = expiring.json.order.id;
  const db = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
  db.prepare('UPDATE orders SET directRequestExpiresAt = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', expireId);
  db.close();
  assert.equal(await sees(targetLogin, expireId), false);
  assert.equal(await sees(otherLogin, expireId), false);
  const expired = harness.store.getOrder(expireId);
  assert.equal(expired.status, 'CANCELLED');
  assert.equal(expired.cancelReason, 'مهلت درخواست طلایی تمام شد.');
  assert.equal(harness.store.workerWallet.read(targetLogin.user.id).balances.length, 0);

  const tierChange = await adminReq('PUT', '/api/admin/tier-pricing', { silverPercent: 110, goldPercent: 125, expectedVersion: 0 });
  assert.equal(tierChange.status, 200);
  assert.equal(tierChange.json.policy.goldenRequestPercent, 130);
  assert.equal(tierChange.json.policy.goldPercent, 125);
  const stillGolden = await quoted({ serviceId: 'hourly', quantity: 2, directRequestWorkerId: targetLogin.user.id });
  assert.equal(stillGolden.total, 2600);
  const goldTier = await customerReq('POST', '/api/pricing/quote', { serviceId: 'hourly', quantity: 2, workerTier: 'gold' });
  assert.equal(goldTier.json.quote.total, 2500);
  const goldenChange = await adminReq('PUT', '/api/admin/golden-request', { percent: 140, windowMinutes: 20, expectedVersion: 1 });
  assert.equal(goldenChange.status, 200);
  assert.equal(goldenChange.json.policy.goldPercent, 125);
  assert.equal(goldenChange.json.policy.goldenRequestPercent, 140);
  assert.equal((await quoted({ serviceId: 'hourly', quantity: 2, directRequestWorkerId: targetLogin.user.id })).total, 2800);
  assert.equal(harness.store.getOrder(orderId).price, 2600);

  const blockedQuote = await quoted({ serviceId: 'hourly', quantity: 1, directRequestWorkerId: targetLogin.user.id });
  const blocked = await place(blockedQuote, { serviceId: 'hourly', quantity: 1, durationHours: 1, clientRequestId: 'goldreq05' });
  const debt = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
  debt.prepare(`INSERT INTO worker_wallet_entries (id, workerId, sourceKey, type, amount, currencyUnit, orderId, createdAt)
    VALUES ('d83-debt', ?, 'commission:d83-debt', 'COMMISSION', -1000, 'toman', 'd83-debt-order', ?)`).run(targetLogin.user.id, new Date().toISOString());
  debt.close();
  const refused = await asWorker(targetLogin, 'PUT', `/api/orders/${blocked.json.order.id}/accept`, {});
  assert.equal(refused.status, 409);
  assert.equal(refused.json.code, 'WORKER_WALLET_DEBT');
  assert.equal(harness.store.getOrder(blocked.json.order.id).status, 'PENDING');
});
