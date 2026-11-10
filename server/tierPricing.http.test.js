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
process.env.PAKSHO_QUOTE_SECRET = 'tier-lock-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-tier-lock-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

test('D-82 tier lock: price, stairs, acceptance and unchanged past orders', async (t) => {
  const seeded = seedCommittedPolicy(process.env, {
    companyId: 'company-tier-lock', currencyUnit: 'toman',
    versions: [{
      id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z',
      services: {
        hourly: { model: 'hourly', rate: 1000, minQuantity: 1, maxQuantity: 8 },
        extra: { model: 'hourly', rate: 1000, minQuantity: 1, maxQuantity: 8, surcharges: [{ id: 'tools', optionId: 'tools', amount: 100 }] },
        factored: { model: 'hourly', rate: 1000, minQuantity: 1, maxQuantity: 8, factors: [{ id: 'place', optionId: 'place', equals: 'outer', basisPoints: 15000 }] },
        staircase_common_areas: { model: 'fixed', rate: 500000, exemptFromTierLock: true },
      },
    }],
  });
  assert.equal(seeded.ok, true);
  const harness = createTestHarness('paksho-tier-lock-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const adminToken = await harness.adminLogin(server);
  const customer = await harness.login(server, '09120000411');
  const workers = {};
  for (const [name, phone] of [['gray', '09120000412'], ['silver', '09120000413'], ['gold', '09120000414'], ['gold_plus', '09120000415']]) {
    const login = await harness.login(server, phone, 'WORKER');
    const user = harness.store.getUser(login.user.id);
    user.status = 'APPROVED';
    harness.store.updateUser(user);
    harness.store.ensureAccount(login.user.id);
    if (name !== 'gray') {
      const db = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
      db.prepare('UPDATE user_points SET tierKey = ? WHERE userId = ?').run(name, login.user.id);
      db.close();
    }
    workers[name] = login;
  }
  const customerReq = (method, pathname, body) => request(server, { method, pathname, token: customer.token, body });
  const workerReq = (name, method, pathname, body) => request(server, { method, pathname, token: workers[name].token, body });
  const adminReq = (method, pathname, body) => request(server, { method, pathname, token: adminToken, body });

  const policy = await adminReq('GET', '/api/admin/tier-pricing');
  assert.equal(policy.status, 200);
  assert.deepEqual(policy.json.policy, { version: 0, grayPercent: 100, silverPercent: 110, goldPercent: 130, goldenRequestPercent: 130, windowMinutes: 30, effectiveAt: null });
  assert.equal((await adminReq('GET', '/api/admin/tier-pricing', undefined)).status, 200);
  assert.equal((await workerReq('gray', 'GET', '/api/admin/tier-pricing')).status, 401);
  for (const bad of [
    { silverPercent: 140, goldPercent: 130, expectedVersion: 0 },
    { silverPercent: 90, goldPercent: 130, expectedVersion: 0 },
    { silverPercent: 110, goldPercent: 301, expectedVersion: 0 },
    { silverPercent: 110.5, goldPercent: 130, expectedVersion: 0 },
    { goldPercent: 130, expectedVersion: 0 },
    { silverPercent: 110, goldPercent: 130 },
  ]) assert.equal((await adminReq('PUT', '/api/admin/tier-pricing', bad)).status, 400);

  async function quote(body) {
    return customerReq('POST', '/api/pricing/quote', body);
  }
  const plain = await quote({ serviceId: 'hourly', quantity: 2 });
  const gray = await quote({ serviceId: 'hourly', quantity: 2, workerTier: 'gray' });
  const silver = await quote({ serviceId: 'hourly', quantity: 2, workerTier: 'silver' });
  const gold = await quote({ serviceId: 'hourly', quantity: 2, workerTier: 'gold' });
  assert.equal(plain.json.quote.total, 2000);
  assert.equal(gray.json.quote.total, 2000);
  assert.equal(silver.json.quote.total, 2200);
  assert.equal(gold.json.quote.total, 2600);
  assert.equal((await quote({ serviceId: 'hourly', quantity: 2, workerTier: 'gold_plus' })).status, 400);
  assert.equal((await quote({ serviceId: 'hourly', quantity: 2, workerTier: 'silver', basisPoints: 5000 })).status, 400);

  const tools = await quote({ serviceId: 'extra', quantity: 2, workerTier: 'silver', options: { tools: true } });
  assert.equal(tools.status, 200);
  assert.equal(tools.json.quote.total, 2300);
  assert.deepEqual(tools.json.quote.surcharges, [{ id: 'tools', amount: 100 }]);
  const factor = await quote({ serviceId: 'factored', quantity: 1, workerTier: 'silver', options: { place: 'outer' } });
  assert.equal(factor.json.quote.total, 1650);

  const stairsSilver = await quote({ serviceId: 'staircase_common_areas', workerTier: 'silver' });
  const stairsGold = await quote({ serviceId: 'staircase_common_areas', workerTier: 'gold' });
  const stairsGray = await quote({ serviceId: 'staircase_common_areas', workerTier: 'gray' });
  const stairsPlain = await quote({ serviceId: 'staircase_common_areas' });
  assert.equal(stairsSilver.status, 400);
  assert.match(stairsSilver.json.message, /قفل سطح/);
  assert.equal(stairsGold.status, 400);
  assert.equal(stairsGray.json.quote.total, 500000);
  assert.equal(stairsPlain.json.quote.total, 500000);

  function orderBody(token, total, extra) {
    return {
      serviceTitle: 'خدمت آزمایشی', address: 'آدرس ساختگی', date: '1405-01-01', time: '10:00',
      quoteToken: token, confirmedTotal: total, ...extra,
    };
  }
  async function place(quoted, extra) {
    return customerReq('POST', '/api/orders', orderBody(quoted.json.quote.quoteToken, quoted.json.quote.total, extra));
  }
  const silverOrder = await place(silver, { serviceId: 'hourly', quantity: 2, durationHours: 2, workerTier: 'silver', clientRequestId: 'tierlock01' });
  assert.equal(silverOrder.status, 200);
  assert.equal(silverOrder.json.order.price, 2200);
  assert.equal(silverOrder.json.order.requestedWorkerTier, 'silver');
  assert.equal(silverOrder.json.order.tierPolicyVersion, 0);
  const replay = await place(silver, { serviceId: 'hourly', quantity: 2, durationHours: 2, workerTier: 'silver', clientRequestId: 'tierlock01' });
  assert.equal(replay.json.duplicate, true);
  assert.equal(replay.json.order.price, 2200);

  async function sees(name, orderId) {
    const listed = await workerReq(name, 'GET', '/api/orders/available');
    assert.equal(listed.status, 200);
    return listed.json.orders.some((order) => order.id === orderId);
  }
  const silverId = silverOrder.json.order.id;
  assert.equal(await sees('gray', silverId), false);
  assert.equal(await sees('silver', silverId), true);
  assert.equal((await workerReq('gray', 'PUT', `/api/orders/${silverId}/accept`, {})).status, 403);
  assert.equal((await workerReq('gray', 'PUT', `/api/orders/${silverId}/accept`, {})).json.code, 'NOT_QUALIFIED');
  assert.equal((await workerReq('silver', 'PUT', `/api/orders/${silverId}/accept`, {})).status, 200);

  const goldQuote = await quote({ serviceId: 'hourly', quantity: 2, workerTier: 'gold' });
  const goldOrder = await place(goldQuote, { serviceId: 'hourly', quantity: 2, durationHours: 2, workerTier: 'gold', clientRequestId: 'tierlock02' });
  const goldId = goldOrder.json.order.id;
  assert.equal(await sees('silver', goldId), false);
  assert.equal((await workerReq('silver', 'PUT', `/api/orders/${goldId}/accept`, {})).status, 403);
  assert.equal(await sees('gold', goldId), true);
  assert.equal(await sees('gold_plus', goldId), true);
  assert.equal((await workerReq('gold_plus', 'PUT', `/api/orders/${goldId}/accept`, {})).status, 200);

  const locked = await place(
    await quote({ serviceId: 'hourly', quantity: 2, workerTier: 'silver' }),
    { serviceId: 'hourly', quantity: 2, durationHours: 2, workerTier: 'silver', clientRequestId: 'tierlock03' },
  );
  assert.equal(locked.json.order.price, 2200);
  const savedPolicy = await adminReq('PUT', '/api/admin/tier-pricing', { silverPercent: 150, goldPercent: 160, expectedVersion: 0 });
  assert.equal(savedPolicy.status, 200);
  assert.equal(savedPolicy.json.policy.version, 1);
  assert.equal((await adminReq('PUT', '/api/admin/tier-pricing', { silverPercent: 110, goldPercent: 130, expectedVersion: 0 })).status, 409);
  const still = harness.store.getOrder(locked.json.order.id);
  assert.equal(still.price, 2200);
  assert.equal(still.tierPolicyVersion, 0);
  const later = await quote({ serviceId: 'hourly', quantity: 2, workerTier: 'silver' });
  assert.equal(later.json.quote.total, 3000);

  const assignTarget = locked.json.order.id;
  const denied = await adminReq('PUT', `/api/admin/orders/${assignTarget}`, { cleanerId: workers.gray.user.id, status: 'ACCEPTED' });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.code, 'NOT_QUALIFIED');
  const allowed = await adminReq('PUT', `/api/admin/orders/${assignTarget}`, { cleanerId: workers.silver.user.id, status: 'ACCEPTED' });
  assert.equal(allowed.status, 200);
});
