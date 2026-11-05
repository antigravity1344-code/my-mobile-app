'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'offer-policy-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-offer-policy-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

const HOUR = 3600000;

test('admin offer policy: defaults, validation, versioning and effect on new offers', async (t) => {
  const seeded = seedCommittedPolicy(process.env, {
    companyId: 'company-offers-policy', currencyUnit: 'toman',
    versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: { hourly: { model: 'hourly', rate: 1000 } } }],
  });
  assert.equal(seeded.ok, true);
  const harness = createTestHarness('paksho-offer-policy-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const adminToken = await harness.adminLogin(server);
  const workerLogin = await harness.login(server, '09120000311', 'WORKER');
  const w = harness.store.getUser(workerLogin.user.id);
  w.status = 'APPROVED';
  harness.store.updateUser(w);
  const wreq = (method, pathname, body) => request(server, { method, pathname, token: workerLogin.token, body });
  const areq = (method, body, token = adminToken) => request(server, { method, pathname: '/api/admin/offer-policy', token, body });

  assert.equal((await areq('GET', undefined, workerLogin.token)).status, 401);
  const initial = await areq('GET');
  assert.deepEqual(initial.json.policy, { version: 0, minPercent: 50, maxPercent: 100, goldMaxPercent: 130, effectiveAt: null });

  for (const bad of [
    { minPercent: 80, maxPercent: 70, goldMaxPercent: 130, expectedVersion: 0 },
    { minPercent: 50, maxPercent: 120, goldMaxPercent: 110, expectedVersion: 0 },
    { minPercent: 0, maxPercent: 100, goldMaxPercent: 130, expectedVersion: 0 },
    { minPercent: 50, maxPercent: 100, goldMaxPercent: 301, expectedVersion: 0 },
    { minPercent: 50.5, maxPercent: 100, goldMaxPercent: 130, expectedVersion: 0 },
    { minPercent: 50, maxPercent: 100, goldMaxPercent: 130 },
  ]) assert.equal((await areq('PUT', bad)).status, 400);

  const startAt = new Date(Date.now() + 48 * HOUR).toISOString();
  const endAt = new Date(Date.now() + 51 * HOUR).toISOString();
  const offerBody = (bp, offset = 0) => ({
    serviceId: 'hourly', startAt: new Date(Date.parse(startAt) + offset * 24 * HOUR).toISOString(),
    endAt: new Date(Date.parse(endAt) + offset * 24 * HOUR).toISOString(), adjustmentBasisPoints: bp,
  });
  assert.equal((await wreq('POST', '/api/workers/me/offers', offerBody(12000))).status, 400); // سقف پیش‌فرض ۱۰۰٪

  const saved = await areq('PUT', { minPercent: 70, maxPercent: 110, goldMaxPercent: 150, expectedVersion: 0 });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.policy.version, 1);
  assert.equal((await areq('PUT', { minPercent: 60, maxPercent: 100, goldMaxPercent: 130, expectedVersion: 0 })).status, 409);

  const info = await wreq('GET', '/api/workers/me/offers');
  assert.equal(info.json.minBasisPoints, 7000);
  assert.equal(info.json.maxBasisPoints, 11000);
  assert.equal((await wreq('POST', '/api/workers/me/offers', offerBody(6000))).status, 400);
  assert.equal((await wreq('POST', '/api/workers/me/offers', offerBody(11500))).status, 400);
  assert.equal((await wreq('POST', '/api/workers/me/offers', offerBody(11000))).status, 201);
});
