const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderPriceStatus } = require('./priceStatus');

test('راه‌پله (قیمت ثابت) مبلغ قفل‌شده دارد', () => {
  assert.deepEqual(orderPriceStatus({ serviceId: 'staircase_common_areas', price: 1000000 }), { status: 'locked', lockedAmount: 1000000 });
});

test('درخواست طلایی حتی برای خدمت ساعتی مبلغ قفل‌شده دارد', () => {
  assert.deepEqual(
    orderPriceStatus({ serviceId: 'home_cleaning', price: 2275000, directRequestWorkerId: 'w1' }),
    { status: 'locked', lockedAmount: 2275000 },
  );
});

test('خدمت ساعتی بدون درخواست طلایی در انتظار مبلغ نهایی است', () => {
  assert.deepEqual(orderPriceStatus({ serviceId: 'home_cleaning', price: 1750000 }), { status: 'hourly_pending' });
});

test('مبلغ نامعتبر یا صفر وضعیت نامشخص می‌دهد', () => {
  assert.deepEqual(orderPriceStatus({ serviceId: 'staircase_common_areas', price: 0 }), { status: 'unknown' });
  assert.deepEqual(orderPriceStatus({ serviceId: 'home_cleaning', price: null }), { status: 'unknown' });
  assert.deepEqual(orderPriceStatus(null), { status: 'unknown' });
});
