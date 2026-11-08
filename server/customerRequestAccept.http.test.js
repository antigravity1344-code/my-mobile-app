'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'customer-request-accept-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-customer-request-accept-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-customer-request-accept', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();

test('customer request acceptance: one specialist, stored price, gender rule, no public quote with the request id', async (t) => {
  const harness = createTestHarness('paksho-customer-request-accept-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120000901');
  const female = await harness.login(server, '09120000902', 'WORKER');
  const male = await harness.login(server, '09120000903', 'WORKER');
  const approve = (w, gender) => { const u = harness.store.getUser(w.user.id); u.status = 'APPROVED'; u.gender = gender; harness.store.updateUser(u); };
  approve(female, 'FEMALE'); approve(male, 'MALE');

  const created = await request(server, { method: 'POST', pathname: '/api/customer/requests', token: customer.token, body: {
    serviceId: 'hourly_labor', startAt: inHours(48), endAt: inHours(49), adjustmentBasisPoints: 9000,
    address: 'آدرس آزمایشی ۹', genderPreference: 'FEMALE' } });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json.request.id;

  // مشتری نمی‌تواند با شناسهٔ درخواست قیمت عمومی بگیرد
  const publicQuote = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly_labor', quantity: 1, options: { offerId: id } } });
  assert.ok(publicQuote.status >= 400, 'a customer must not get a quote through the request id');

  // متخصص با جنسیت نامطابق پذیرفته نمی‌شود
  const wrong = await request(server, { method: 'POST', pathname: `/api/workers/me/customer-requests/${id}/accept`, token: male.token, body: {} });
  assert.equal(wrong.status, 403); assert.equal(wrong.json.code, 'GENDER_MISMATCH');

  // متخصص مطابق: سفارش با قیمت ذخیره‌شدهٔ درخواست و آدرس درخواست ساخته می‌شود
  const accepted = await request(server, { method: 'POST', pathname: `/api/workers/me/customer-requests/${id}/accept`, token: female.token, body: {} });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.json));
  assert.equal(accepted.json.order.price, 900);
  assert.equal(accepted.json.order.address, 'آدرس آزمایشی ۹');

  // پذیرش دوباره یا توسط متخصص دیگر: ۴۰۹-مانند (۴۰۹ با کد REQUEST_NOT_OPEN)
  const again = await request(server, { method: 'POST', pathname: `/api/workers/me/customer-requests/${id}/accept`, token: female.token, body: {} });
  assert.equal(again.status, 409); assert.equal(again.json.code, 'REQUEST_NOT_OPEN');

  // پس از پذیرش، مشتری نمی‌تواند درخواست را لغو کند؛ لغو از مسیر سفارش انجام می‌شود
  const cancel = await request(server, { method: 'DELETE', pathname: `/api/customer/requests/${id}`, token: customer.token });
  assert.equal(cancel.status, 409);

  // درخواست دیگر در فهرست متخصص‌ها نیست
  const list = await request(server, { method: 'GET', pathname: '/api/workers/me/customer-requests', token: female.token });
  assert.equal(list.json.requests.some((r) => r.id === id), false);
});
