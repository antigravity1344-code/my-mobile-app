'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'discount-codes-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-discount-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-discount-codes', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

test('discount codes: admin manages them, quote applies percent, use is counted on order, limits enforced', async (t) => {
  const harness = createTestHarness('paksho-discount-codes-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const admin = await harness.adminLogin(server);
  const adminReq = (method, pathname, body) => request(server, { method, pathname, token: admin, body });
  const quote = (discountCode) => request(server, { method: 'POST', pathname: '/api/pricing/quote',
    body: { serviceId: 'hourly_labor', quantity: 2, options: {}, ...(discountCode ? { discountCode } : {}) } });

  // ساخت کد: درصدی، بدون انقضا و بدون سقف (هر دو اختیاری)
  const made = await adminReq('POST', '/api/admin/discount-codes', { code: 'save10', percent: 10 });
  assert.equal(made.status, 201);
  assert.equal(made.json.code.code, 'SAVE10');
  assert.equal(made.json.code.percent, 10);
  assert.equal((await adminReq('POST', '/api/admin/discount-codes', { code: 'SAVE10', percent: 5 })).status, 409);
  assert.equal((await adminReq('POST', '/api/admin/discount-codes', { code: 'BAD', percent: 0 })).status, 400);
  // انقضای گذشته رد می‌شود
  assert.equal((await adminReq('POST', '/api/admin/discount-codes', { code: 'OLD1', percent: 5, expiresAt: '2020-01-01T00:00:00.000Z' })).status, 400);

  // قیمت بدون کد: ۲ ساعت × ۱۰۰۰ = ۲۰۰۰؛ با ۱۰٪: ۱۸۰۰
  const plain = await quote();
  assert.equal(plain.json.quote.total, 2000);
  const withCode = await quote('save10');
  assert.equal(withCode.status, 200);
  assert.equal(withCode.json.quote.total, 1800);
  assert.equal(withCode.json.quote.discounts[0].id, 'promo:SAVE10');

  // کد نامعتبر
  const bogus = await quote('NOPE');
  assert.equal(bogus.status, 409);
  assert.equal(bogus.json.code, 'PROMO_INVALID');

  // غیرفعال شدن کد
  assert.equal((await adminReq('PUT', '/api/admin/discount-codes/SAVE10/active', { active: false })).status, 200);
  assert.equal((await quote('SAVE10')).json.code, 'PROMO_INVALID');
  assert.equal((await adminReq('PUT', '/api/admin/discount-codes/SAVE10/active', { active: true })).status, 200);

  // سقف استفاده: دو بار ثبت سفارش با کد یک‌بارمصرف؛ بار دوم رد می‌شود
  await adminReq('POST', '/api/admin/discount-codes', { code: 'ONCE', percent: 20, maxUses: 1 });
  const customer = await harness.login(server, '09120000701', 'CUSTOMER');
  const placeOrder = async (discountCode) => {
    const q = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
      body: { serviceId: 'hourly_labor', quantity: 2, options: {}, discountCode } });
    assert.equal(q.status, 200, JSON.stringify(q.json));
    return request(server, { method: 'POST', pathname: '/api/orders', token: customer.token, body: {
      serviceId: 'hourly_labor', serviceTitle: 'نظافت ساعتی', durationHours: 2, quantity: 2, options: {},
      quoteToken: q.json.quote.quoteToken, confirmedTotal: q.json.quote.total, price: q.json.quote.total,
      discountCode, customerName: 'مشتری کد', customerPhone: '09120000701', address: 'تهران، خیابان آزمایش ۱',
      date: 'آذر ۱۰', time: '10:00 - 12:00', notes: '', clientRequestId: 'discount-req-000001',
    } });
  };
  const first = await placeOrder('ONCE');
  assert.equal(first.status, 200, JSON.stringify(first.json));
  const listed = (await adminReq('GET', '/api/admin/discount-codes')).json.codes.find((c) => c.code === 'ONCE');
  assert.equal(listed.usedCount, 1);
  const second = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly_labor', quantity: 2, options: {}, discountCode: 'ONCE' } });
  assert.equal(second.json.code, 'PROMO_EXHAUSTED');
});
