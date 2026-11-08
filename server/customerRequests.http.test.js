'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'customer-requests-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-customer-requests-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-customer-requests', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();

test('customer request: bounded customer percentage is stored, other order paths ignore it', async (t) => {
  const harness = createTestHarness('paksho-customer-requests-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120000701');
  const create = (body, token = customer.token) => request(server, { method: 'POST', pathname: '/api/customer/requests', token, body });
  const base = { serviceId: 'hourly_labor', startAt: inHours(48), endAt: inHours(52) };

  // ورودی معتبر در بازهٔ مشتری ذخیره می‌شود
  const ok = await create({ ...base, adjustmentBasisPoints: 9000 });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.request.adjustmentBasisPoints, 9000);
  assert.equal(ok.json.request.status, 'OPEN');
  assert.ok(ok.json.request.total > 0);

  // خارج از بازه رد می‌شود
  const low = await create({ ...base, adjustmentBasisPoints: 6900 });
  assert.equal(low.status, 400); assert.equal(low.json.code, 'PRICE_OUT_OF_RANGE');
  const high = await create({ ...base, adjustmentBasisPoints: 13100 });
  assert.equal(high.status, 400); assert.equal(high.json.code, 'PRICE_OUT_OF_RANGE');
  const notStep = await create({ ...base, adjustmentBasisPoints: 9050 });
  assert.equal(notStep.status, 400);

  // مشتری فقط می‌بیند و فقط لغو خودش
  const list = await request(server, { method: 'GET', pathname: '/api/customer/requests', token: customer.token });
  assert.equal(list.json.requests.length, 1);
  const other = await harness.login(server, '09120000702');
  assert.equal((await request(server, { method: 'DELETE', pathname: `/api/customer/requests/${ok.json.request.id}`, token: other.token })).status, 409);
  assert.equal((await request(server, { method: 'DELETE', pathname: `/api/customer/requests/${ok.json.request.id}`, token: customer.token })).status, 200);

  // مسیر عادی سفارش همان قیمت سرور را می‌دهد و درصد مشتری را نمی‌پذیرد
  const plain = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly_labor', quantity: 3, options: {} } });
  assert.equal(plain.status, 200);
  const cheated = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly_labor', quantity: 3, options: { adjustmentBasisPoints: 7000 } } });
  // مسیر عادی درصد مشتری را رد می‌کند؛ قیمت سرور هم دست‌نخورده می‌ماند
  assert.equal(cheated.status, 400);
  assert.equal(plain.json.quote.total, 3000);
});
