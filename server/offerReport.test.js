'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOfferReport } = require('./offerReport');

const orders = new Map();
const offers = [];
function book(id, workerId, customerId, bps, status = 'COMPLETED') {
  orders.set('o' + id, { status, customerId });
  offers.push({ id: 'f' + id, workerId, adjustmentBasisPoints: bps, bookedOrderId: 'o' + id });
}
const users = { w1: { name: 'الف', phone: '0911' }, w2: { name: 'ب', phone: '0912' }, w3: { name: 'ج', phone: '0913' } };
const run = () => buildOfferReport({ offers, getOrder: (id) => orders.get(id), getUser: (id) => users[id], minBps: 7000 });

test('flags near-minimum pricing and low-price repeat bookings; never flags a loyal customer at normal price', () => {
  book(1, 'w1', 'c1', 7000); book(2, 'w1', 'c2', 7500); book(3, 'w1', 'c3', 8000);        // نزدیک حداقل
  book(4, 'w2', 'c9', 8000); book(5, 'w2', 'c9', 8000); book(6, 'w2', 'c9', 8500);          // مشتری تکراری، قیمت پایین
  book(7, 'w3', 'c9', 10000); book(8, 'w3', 'c9', 10000); book(9, 'w3', 'c9', 9500);        // وفادار با قیمت عادی
  book(10, 'w3', 'c8', 7000, 'CANCELLED');                                                  // لغوشده شمرده نمی‌شود
  const rows = run();
  assert.deepEqual(rows.map((r) => r.workerId).sort(), ['w1', 'w2']);
  assert.deepEqual(rows.find((r) => r.workerId === 'w1').flags, ['NEAR_MINIMUM_PRICE']);
  assert.deepEqual(rows.find((r) => r.workerId === 'w2').flags, ['REPEAT_CUSTOMER_LOW_PRICE']);
  assert.equal(rows.find((r) => r.workerId === 'w1').averagePercent, 75);
});

test('fewer than three bookings are never flagged', () => {
  orders.clear(); offers.length = 0;
  book(1, 'w1', 'c1', 7000); book(2, 'w1', 'c1', 7000);
  assert.deepEqual(run(), []);
});
