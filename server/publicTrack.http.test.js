'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'public-track-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-public-track-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-public-track', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

test('public tracking: summary only, unknown and malformed codes are 404, anonymous rate limit applies', async (t) => {
  const harness = createTestHarness('paksho-public-track-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const code = 'ORD-MOCKTRACK-0a1b2c3d';
  harness.store.createOrder({
    id: code, customerId: 'CUSTOMER-TRACK', customerName: 'مشتری محرمانه', customerPhone: '09120000641',
    serviceTitle: 'نظافت منزل', address: 'تهران، پلاک ۱۲', date: '۲۰ مهر', time: 'صبح',
    cleanerName: 'متخصص محرمانه', price: 800000, status: 'PENDING', createdAt: '2026-10-11T08:00:00.000Z',
  });

  const ok = await request(server, { method: 'GET', pathname: `/api/track/${code}` });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.order.trackingCode, code);
  assert.equal(ok.json.order.status, 'PENDING');
  assert.equal(ok.json.order.serviceTitle, 'نظافت منزل');
  assert.equal(ok.json.order.area, 'تهران');
  const text = JSON.stringify(ok.json);
  for (const secret of ['مشتری محرمانه', '09120000641', 'متخصص محرمانه', 'پلاک ۱۲', '800000', 'customerId']) {
    assert.equal(text.includes(secret), false, `response leaks ${secret}`);
  }

  assert.equal((await request(server, { method: 'GET', pathname: '/api/track/ORD-MISSING-00000000' })).status, 404);
  assert.equal((await request(server, { method: 'GET', pathname: '/api/track/not-a-code' })).status, 404);

  let last = null;
  for (let i = 0; i < 60; i += 1) {
    last = await request(server, { method: 'GET', pathname: `/api/track/${code}` });
  }
  assert.equal(last.status, 429);
  assert.equal(last.json.code, 'RATE_LIMITED');
});
