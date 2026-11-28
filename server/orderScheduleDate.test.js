const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderScheduleDate } = require('./orderScheduleDate');

test('Gregorian and Jalali civil dates produce the same Persian weekday and date', () => {
  const date = { dateKey: '1405-09-05', dateLabel: 'پنجشنبه ۵ آذر ۱۴۰۵' };
  assert.deepEqual(orderScheduleDate({ date: '2026-11-26' }), date);
  assert.deepEqual(orderScheduleDate({ date: '۱۴۰۵/۰۹/۰۵' }), date);
});

test('stored relative dates use the Tehran date at order creation', () => {
  const createdAt = '2026-11-25T20:45:00.000Z';
  assert.equal(orderScheduleDate({ date: 'امروز', createdAt }).dateKey, '1405-09-05');
  assert.equal(orderScheduleDate({ date: 'فردا', createdAt }).dateKey, '1405-09-06');
  assert.equal(orderScheduleDate({ date: 'پس‌فردا', createdAt }).dateKey, '1405-09-07');
});

test('ambiguous and invalid dates are not guessed', () => {
  const unknown = { dateLabel: 'تاریخ دقیق ثبت نشده', dateKey: null };
  assert.deepEqual(orderScheduleDate({ date: 'هفته آینده', createdAt: '2026-11-26T12:00:00Z' }), unknown);
  assert.deepEqual(orderScheduleDate({ date: '2026-02-30' }), unknown);
});
