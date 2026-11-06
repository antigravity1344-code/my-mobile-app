'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'service-switch-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-service-switch-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

const HOUR = 3600000;

seedCommittedPolicy(process.env, {
  companyId: 'company-service-switch', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: { hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

test('service switches: off hides the service, blocks quotes/offers, keeps old data, on restores, audit logged', async (t) => {
  const harness = createTestHarness('paksho-service-switch-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const adminToken = await harness.adminLogin(server);
  const worker = await harness.login(server, '09120000511', 'WORKER');
  const u = harness.store.getUser(worker.user.id); u.status = 'APPROVED'; harness.store.updateUser(u);
  const customer = await harness.login(server, '09120000512');
  const put = (body, token = adminToken) => request(server, { method: 'PUT', pathname: '/api/admin/service-switches', token, body });
  const enabledList = () => request(server, { method: 'GET', pathname: '/api/services/enabled', token: customer.token })
    .then((r) => ({ json: { disabledServiceIds: r.json.disabledServiceIds.filter((id) => id !== 'patient_companion') } }));
  const offer = () => request(server, { method: 'POST', pathname: '/api/workers/me/offers', token: worker.token, body: {
    serviceId: 'hourly_labor', startAt: new Date(Date.now() + 48 * HOUR).toISOString(),
    endAt: new Date(Date.now() + 51 * HOUR).toISOString(), adjustmentBasisPoints: 8000 } });
  const quote = (extra = {}) => request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly_labor', quantity: 2, options: extra } });

  assert.equal((await put({ serviceId: 'hourly_labor', enabled: false }, customer.token)).status, 401);
  assert.equal((await put({ serviceId: 'nope', enabled: false })).status, 400);
  assert.equal((await put({ serviceId: 'hourly_labor', enabled: 'no' })).status, 400);
  assert.deepEqual((await enabledList()).json.disabledServiceIds, []);
  const snap = await request(server, { method: 'GET', pathname: '/api/admin/service-switches', token: adminToken });
  assert.equal(snap.json.services.length, 7); assert.ok(snap.json.services.every((s) => s.enabled));

  const open = await offer();
  assert.equal(open.status, 201);
  assert.equal((await quote()).status, 200);

  assert.equal((await put({ serviceId: 'hourly_labor', enabled: false })).status, 200);
  assert.deepEqual((await enabledList()).json.disabledServiceIds, ['hourly_labor']);
  const blockedQuote = await quote();
  assert.equal(blockedQuote.status, 409); assert.equal(blockedQuote.json.code, 'SERVICE_DISABLED');
  const blockedOrder = await request(server, { method: 'POST', pathname: '/api/orders', token: customer.token,
    body: { serviceId: 'hourly_labor', address: 'x', date: '1405/01/01', time: '10:00' } });
  assert.equal(blockedOrder.status, 409); assert.equal(blockedOrder.json.code, 'SERVICE_DISABLED');
  assert.equal((await offer()).status, 409);
  assert.equal((await request(server, { method: 'GET', pathname: '/api/offers', token: customer.token })).json.offers.length, 0);

  assert.equal((await put({ serviceId: 'hourly_labor', enabled: true })).status, 200);
  assert.deepEqual((await enabledList()).json.disabledServiceIds, []);
  assert.equal((await quote()).status, 200);
  assert.equal((await request(server, { method: 'GET', pathname: '/api/offers', token: customer.token })).json.offers.length, 1);

  const log = harness.store.database
    ? harness.store.database.prepare("SELECT enabled FROM feature_switch_log WHERE scope = 'SERVICE' ORDER BY id").all()
    : null;
  if (log) assert.deepEqual(log.map((r) => r.enabled), [0, 1]);
});
