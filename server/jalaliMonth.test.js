'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gregorianToJalali, jalaliMonthFromIso } = require('./jalaliMonth');

test('Jalali month follows the Tehran calendar day, not the UTC day', () => {
  assert.deepEqual(gregorianToJalali(2026, 10, 9), [1405, 7, 17]);
  assert.deepEqual(jalaliMonthFromIso('2026-10-08T20:29:00.000Z'), { year: 1405, month: 7 });
  assert.deepEqual(jalaliMonthFromIso('2026-10-08T20:30:00.000Z'), { year: 1405, month: 7 });
  assert.deepEqual(jalaliMonthFromIso('2026-10-22T20:29:59.000Z'), { year: 1405, month: 7 });
  assert.deepEqual(jalaliMonthFromIso('2026-10-22T20:30:00.000Z'), { year: 1405, month: 8 });
  assert.equal(jalaliMonthFromIso(''), null);
  assert.equal(jalaliMonthFromIso('not-a-date'), null);
});
