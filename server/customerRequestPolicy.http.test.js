'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'customer-request-policy-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-customer-request-policy-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-customer-request-policy', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();

test('customer request bounds: admin-versioned, default 70-130, stale and invalid publishes refused', async (t) => {
  const harness = createTestHarness('paksho-customer-request-policy-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const adminToken = await harness.adminLogin(server);
  const customer = await harness.login(server, '09120000951');
  const create = (percent) => request(server, { method: 'POST', pathname: '/api/customer/requests', token: customer.token, body: {
    serviceId: 'hourly_labor', startAt: inHours(48), endAt: inHours(49), adjustmentBasisPoints: percent * 100, address: 'آدرس', genderPreference: 'NO_PREFERENCE' } });

  const read = await request(server, { method: 'GET', pathname: '/api/admin/customer-request-policy', token: adminToken });
  assert.equal(read.json.policy.minPercent, 70);
  assert.equal(read.json.policy.maxPercent, 130);
  assert.equal((await create(70)).status, 201);
  assert.equal((await create(69)).status, 400);

  const publish = await request(server, { method: 'PUT', pathname: '/api/admin/customer-request-policy', token: adminToken,
    body: { minPercent: 80, maxPercent: 120, expectedVersion: read.json.policy.version } });
  assert.equal(publish.status, 200, JSON.stringify(publish.json));
  assert.equal((await create(79)).status, 400);
  assert.equal((await create(120)).status, 201);
  assert.equal((await create(121)).status, 400);

  // نسخهٔ قدیمی و مقدار نامعتبر پذیرفته نمی‌شوند
  const stale = await request(server, { method: 'PUT', pathname: '/api/admin/customer-request-policy', token: adminToken,
    body: { minPercent: 75, maxPercent: 110, expectedVersion: read.json.policy.version } });
  assert.equal(stale.status, 409);
  const inverted = await request(server, { method: 'PUT', pathname: '/api/admin/customer-request-policy', token: adminToken,
    body: { minPercent: 120, maxPercent: 80, expectedVersion: publish.json.policy.version } });
  assert.equal(inverted.status, 400);

  // کاربر عادی حق تغییر ندارد
  const denied = await request(server, { method: 'PUT', pathname: '/api/admin/customer-request-policy', token: customer.token,
    body: { minPercent: 80, maxPercent: 120, expectedVersion: publish.json.policy.version } });
  assert.equal(denied.status, 401);
});
