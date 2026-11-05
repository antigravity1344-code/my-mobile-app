'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'feature-switch-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-feature-switch-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

const HOUR = 3600000;

seedCommittedPolicy(process.env, {
  companyId: 'company-feature-switch', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: { hourly: { model: 'hourly', rate: 1000 } } }],
});

test('feature switches: per-worker and global off hide offers and block new/booked ones, audit logged', async (t) => {
  const harness = createTestHarness('paksho-feature-switch-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const adminToken = await harness.adminLogin(server);
  const mk = async (phone, role) => harness.login(server, phone, role);
  const w1 = await mk('09120000411', 'WORKER');
  const w2 = await mk('09120000412', 'WORKER');
  for (const w of [w1, w2]) { const u = harness.store.getUser(w.user.id); u.status = 'APPROVED'; harness.store.updateUser(u); }
  const customer = await mk('09120000413');
  const sw = (body, token = adminToken) => request(server, { method: 'PUT', pathname: '/api/admin/feature-switches', token, body });
  const offer = (w, d) => request(server, { method: 'POST', pathname: '/api/workers/me/offers', token: w.token, body: {
    serviceId: 'hourly', startAt: new Date(Date.now() + (48 + d * 24) * HOUR).toISOString(),
    endAt: new Date(Date.now() + (51 + d * 24) * HOUR).toISOString(), adjustmentBasisPoints: 8000 } });

  assert.equal((await sw({ scope: 'GLOBAL', feature: 'offers', enabled: false }, customer.token)).status, 401);
  assert.equal((await sw({ scope: 'GLOBAL', feature: 'nope', enabled: false })).status, 400);
  assert.equal((await sw({ scope: 'WORKER', workerId: 'x', feature: 'offers', enabled: false })).status, 404);

  const o1 = await offer(w1, 0); const o2 = await offer(w2, 0);
  assert.equal(o1.status, 201); assert.equal(o2.status, 201);
  const list = () => request(server, { method: 'GET', pathname: '/api/offers', token: customer.token });
  assert.equal((await list()).json.offers.length, 2);

  // خاموش‌کردن یک متخصص: پیشنهادش از فهرست می‌رود، پیشنهاد تازه رد می‌شود، رزرو نمی‌شود؛ دیگری سالم می‌ماند
  assert.equal((await sw({ scope: 'WORKER', workerId: w1.user.id, feature: 'offers', enabled: false })).status, 200);
  assert.deepEqual((await list()).json.offers.map((o) => o.id), [o2.json.offer.id]);
  const blocked = await offer(w1, 1);
  assert.equal(blocked.status, 403); assert.equal(blocked.json.code, 'FEATURE_DISABLED');
  const info = await request(server, { method: 'GET', pathname: '/api/workers/me/offers', token: w1.token });
  assert.equal(info.json.enabled, false);
  const q = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly', quantity: 2, options: { offerId: o1.json.offer.id } } });
  assert.equal(q.status, 409); assert.equal(q.json.code, 'OFFER_UNAVAILABLE');
  const admins = await request(server, { method: 'GET', pathname: '/api/admin/users?role=WORKER', token: adminToken });
  assert.equal(admins.json.users.find((u) => u.id === w1.user.id).features.offers, false);
  assert.equal(admins.json.users.find((u) => u.id === w2.user.id).features.offers, true);

  // روشن‌کردن دوباره: پیشنهاد برمی‌گردد
  assert.equal((await sw({ scope: 'WORKER', workerId: w1.user.id, feature: 'offers', enabled: true })).status, 200);
  assert.equal((await list()).json.offers.length, 2);

  // کلید کلی: فهرست خالی و رزرو رد می‌شود
  assert.equal((await sw({ scope: 'GLOBAL', feature: 'offers', enabled: false })).status, 200);
  assert.equal((await list()).json.offers.length, 0);
  const q2 = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly', quantity: 2, options: { offerId: o2.json.offer.id } } });
  assert.equal(q2.status, 409);
  assert.equal((await sw({ scope: 'GLOBAL', feature: 'offers', enabled: true })).status, 200);
  assert.equal((await list()).json.offers.length, 2);
  assert.equal(harness.store.featureSwitches.snapshot().global.offers, true);
});
