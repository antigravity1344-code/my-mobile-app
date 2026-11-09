'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'anonymous-quote-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-anon-quote-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-anon-quote', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

test('pricing/quote: anonymous price, worker refused, anonymous rate limit', async (t) => {
  const harness = createTestHarness('paksho-anon-quote-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const quoteBody = { serviceId: 'hourly_labor', quantity: 2, options: {} };

  // ۱) بدون ورود: قیمت برمی‌گردد و داده کاربری ندارد
  const anon = await request(server, { method: 'POST', pathname: '/api/pricing/quote', body: quoteBody });
  assert.equal(anon.status, 200);
  assert.equal(anon.json.success, true);
  assert.ok(anon.json.quote);
  assert.equal(JSON.stringify(anon.json).includes('userId'), false);

  // ۲) کارگر واردشده همچنان رد می‌شود
  const worker = await harness.login(server, '09120000631', 'WORKER');
  const asWorker = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: worker.token, body: quoteBody });
  assert.equal(asWorker.status, 403);

  // ۳) محدودیت تعداد برای بی‌ورود: ۳۰ مجاز، نفر ۳۱ رد
  let last = null;
  for (let i = 0; i < 30; i += 1) {
    last = await request(server, { method: 'POST', pathname: '/api/pricing/quote', body: quoteBody });
  }
  assert.equal(last.status, 429);
  assert.equal(last.json.code, 'RATE_LIMITED');
});
