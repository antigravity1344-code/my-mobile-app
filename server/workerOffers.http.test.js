'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');
const { validateOfferInput, maxBasisPointsForTier } = require('./workerOffers');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'offers-isolated-quote-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-offers-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

const HOUR = 3600000;

test('offer input policy: tier bounds, steps, window and horizon', () => {
  const now = new Date('2030-01-01T08:00:00.000Z');
  const base = {
    serviceId: 'hourly',
    startAt: new Date(now.getTime() + 24 * HOUR).toISOString(),
    endAt: new Date(now.getTime() + 28 * HOUR).toISOString(),
    adjustmentBasisPoints: 7000,
  };
  assert.equal(validateOfferInput(base, { tierKey: 'gray', now }).adjustmentBasisPoints, 7000);
  assert.equal(maxBasisPointsForTier('gold'), 13000);
  assert.throws(() => validateOfferInput({ ...base, adjustmentBasisPoints: 11000 }, { tierKey: 'silver', now }), { code: 'PRICE_OUT_OF_RANGE' });
  assert.equal(validateOfferInput({ ...base, adjustmentBasisPoints: 13000 }, { tierKey: 'gold', now }).adjustmentBasisPoints, 13000);
  assert.throws(() => validateOfferInput({ ...base, adjustmentBasisPoints: 13100 }, { tierKey: 'gold', now }), { code: 'PRICE_OUT_OF_RANGE' });
  assert.throws(() => validateOfferInput({ ...base, adjustmentBasisPoints: 4900 }, { tierKey: 'gold', now }), { code: 'PRICE_OUT_OF_RANGE' });
  assert.throws(() => validateOfferInput({ ...base, adjustmentBasisPoints: 7050 }, { tierKey: 'gold', now }), { code: 'INPUT_INVALID' });
  assert.throws(() => validateOfferInput({ ...base, startAt: new Date(now.getTime() - HOUR).toISOString() }, { tierKey: 'gray', now }), { code: 'INPUT_INVALID' });
  assert.throws(() => validateOfferInput({ ...base, endAt: new Date(now.getTime() + 24.5 * HOUR).toISOString() }, { tierKey: 'gray', now }), { code: 'INPUT_INVALID' });
  assert.throws(() => validateOfferInput({ ...base, endAt: new Date(now.getTime() + 60 * HOUR).toISOString() }, { tierKey: 'gray', now }), { code: 'INPUT_INVALID' });
});

test('worker offers: create, list, book through signed quote, tamper resistance', async (t) => {
  const seeded = seedCommittedPolicy(process.env, {
    companyId: 'company-offers',
    currencyUnit: 'toman',
    versions: [{
      id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z',
      services: { hourly: { model: 'hourly', rate: 1000 } },
    }],
  });
  assert.equal(seeded.ok, true);

  const harness = createTestHarness('paksho-offers-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120000211');
  const other = await harness.login(server, '09120000213');
  const workerLogin = await harness.login(server, '09120000212', 'WORKER');
  const w = harness.store.getUser(workerLogin.user.id);
  w.status = 'APPROVED';
  harness.store.updateUser(w);
  const pendingLogin = await harness.login(server, '09120000214', 'WORKER');

  const startAt = new Date(Date.now() + 48 * HOUR).toISOString();
  const endAt = new Date(Date.now() + 52 * HOUR).toISOString();
  const wreq = (method, pathname, body, token = workerLogin.token) => request(server, { method, pathname, token, body });

  // محدودیت‌ها
  assert.equal((await wreq('POST', '/api/workers/me/offers', { serviceId: 'hourly', startAt, endAt, adjustmentBasisPoints: 7000 }, customer.token)).status, 403);
  assert.equal((await wreq('POST', '/api/workers/me/offers', { serviceId: 'hourly', startAt, endAt, adjustmentBasisPoints: 7000 }, pendingLogin.token)).status, 403);
  const tooHigh = await wreq('POST', '/api/workers/me/offers', { serviceId: 'hourly', startAt, endAt, adjustmentBasisPoints: 12000 });
  assert.equal(tooHigh.status, 400);
  assert.equal(tooHigh.json.code, 'PRICE_OUT_OF_RANGE');
  const noService = await wreq('POST', '/api/workers/me/offers', { serviceId: 'nope', startAt, endAt, adjustmentBasisPoints: 7000 });
  assert.equal(noService.status, 409);

  const created = await wreq('POST', '/api/workers/me/offers', { serviceId: 'hourly', startAt, endAt, adjustmentBasisPoints: 7000 });
  assert.equal(created.status, 201);
  assert.equal(created.json.offer.total, 700);
  assert.equal(created.json.offer.tariffTotal, 1000);
  const offerId = created.json.offer.id;

  const overlap = await wreq('POST', '/api/workers/me/offers', { serviceId: 'hourly', startAt, endAt, adjustmentBasisPoints: 8000 });
  assert.equal(overlap.status, 409);
  assert.equal(overlap.json.code, 'OVERLAP');

  // نمای مشتری بدون اطلاعات تماس
  const list = await request(server, { method: 'GET', pathname: '/api/offers', token: customer.token });
  assert.equal(list.status, 200);
  assert.equal(list.json.offers.length, 1);
  assert.equal(JSON.stringify(list.json).includes('09120000212'), false);
  assert.equal((await request(server, { method: 'GET', pathname: '/api/offers', token: workerLogin.token })).status, 403);

  // نقل‌قول با پیشنهاد: سه ساعت داخل بازهٔ ۴ ساعته، ۷۰٪ تعرفه
  const quote = await request(server, {
    method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly', quantity: 3, options: { offerId } },
  });
  assert.equal(quote.status, 200);
  assert.equal(quote.json.quote.total, 2100);
  const q = quote.json.quote;

  const place = (token, body) => request(server, { method: 'POST', pathname: '/api/orders', token, body });
  const orderBody = (extra = {}) => ({
    serviceTitle: 'خدمت', address: 'آدرس آزمایشی', date: '1405-01-01', time: '10:00',
    serviceId: 'hourly', quantity: 3, durationHours: 3, options: { offerId },
    quoteToken: q.quoteToken, confirmedTotal: 2100, expectedStartAt: startAt, ...extra,
  });

  // بیرون از بازه
  const outside = await place(customer.token, orderBody({ expectedStartAt: new Date(Date.now() + 50 * HOUR).toISOString() }));
  assert.equal(outside.status, 409);
  assert.equal(outside.json.code, 'OFFER_WINDOW_MISMATCH');
  // دست‌کاری مبلغ
  const cheat = await place(customer.token, orderBody({ confirmedTotal: 1 }));
  assert.equal(cheat.status, 400);
  // حذف offerId از انتخاب با توکن همان پیشنهاد
  const stripped = await place(customer.token, orderBody({ options: {} }));
  assert.notEqual(stripped.status, 200);

  const booked = await place(customer.token, orderBody({ clientRequestId: 'offerreq01' }));
  assert.equal(booked.status, 200);
  assert.equal(booked.json.order.price, 2100);
  assert.equal(booked.json.order.status, 'ACCEPTED');
  assert.equal(booked.json.order.cleanerId, workerLogin.user.id);

  // رزرو دوم همان پیشنهاد (مشتری دیگر) ناموفق و بدون سفارش اضافی
  const quote2 = await request(server, {
    method: 'POST', pathname: '/api/pricing/quote', token: other.token,
    body: { serviceId: 'hourly', quantity: 3, options: { offerId } },
  });
  assert.equal(quote2.status, 409);
  const orderCount = harness.store.getOrders({ cleanerId: workerLogin.user.id }).length;
  assert.equal(orderCount, 1);

  // لغو پیشنهاد رزروشده ممکن نیست؛ فهرست مشتری خالی می‌شود
  assert.equal((await wreq('DELETE', `/api/workers/me/offers/${offerId}`)).status, 409);
  const after = await request(server, { method: 'GET', pathname: '/api/offers', token: customer.token });
  assert.equal(after.json.offers.length, 0);

  // لغو پیشنهاد باز
  const second = await wreq('POST', '/api/workers/me/offers', {
    serviceId: 'hourly', startAt: new Date(Date.now() + 72 * HOUR).toISOString(), endAt: new Date(Date.now() + 75 * HOUR).toISOString(), adjustmentBasisPoints: 5000,
  });
  assert.equal(second.status, 201);
  assert.equal((await wreq('DELETE', `/api/workers/me/offers/${second.json.offer.id}`)).status, 200);
  const cancelledQuote = await request(server, {
    method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hourly', quantity: 1, options: { offerId: second.json.offer.id } },
  });
  assert.equal(cancelledQuote.status, 409);
  assert.equal(cancelledQuote.json.code, 'OFFER_UNAVAILABLE');
});
