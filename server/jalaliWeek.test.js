'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { jalaliDayFromIso, saturdayWeekRange, isJalaliDayInWeek } = require('./jalaliWeek');

test('Tehran Saturday week includes Friday night UTC that is still Friday in Tehran', () => {
  const now = Date.parse('2026-10-25T10:00:00.000Z'); // یکشنبه ۲ آبان ۱۴۰۵ در تهران
  const week = saturdayWeekRange(now);
  assert.deepEqual(week.start, { year: 1405, month: 8, day: 2 });
  assert.deepEqual(week.end, { year: 1405, month: 8, day: 8 });
  assert.equal(isJalaliDayInWeek(jalaliDayFromIso('2026-10-23T20:30:00.000Z'), week), true, 'Saturday 00:00 Tehran');
  assert.equal(isJalaliDayInWeek(jalaliDayFromIso('2026-10-23T20:29:00.000Z'), week), false, 'previous Friday Tehran');
  assert.equal(isJalaliDayInWeek(jalaliDayFromIso('2026-10-30T20:29:00.000Z'), week), true, 'Friday 23:59 Tehran');
  assert.equal(isJalaliDayInWeek(jalaliDayFromIso('2026-10-30T20:30:00.000Z'), week), false, 'next Saturday Tehran');
});
