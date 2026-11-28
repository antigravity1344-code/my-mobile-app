'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_RATES: rates, calculateStaircase: calculate, BASE_BUILDING } = require('./staircase');
test('staircase boundaries, optional extras and elevator percentage excluding the supplies pack', () => {
  for (const [changes, total] of [
    [{}, 1070000], [{ floors: 1, unitsPerFloor: 1 }, 1070000], [{ floors: 3, noLift: true }, 1070000],
    [{ floors: 4, noLift: true, detergent: true }, 1327000], [{ floors: 5 }, 1115000],
    [{ unitsPerFloor: 3 }, 1088000], [{ unitsPerFloor: 4 }, 1106000], [{ unitsPerFloor: 8 }, 1106000],
    [{ parkingFloors: 2 }, 1250000],
    [{ floors: 5, unitsPerFloor: 3, parkingFloors: 1, glass: true, yard: true, roof: true, mats: true, noLift: true, detergent: true }, 1819800],
  ]) {
    const bill = calculate(rates, { ...BASE_BUILDING, ...changes });
    assert.equal(bill.total, total);
    assert.equal(bill.base + bill.lines.reduce((n, item) => n + item.amount, 0), total);
  }
  for (const invalid of [{ floors: 0 }, { unitsPerFloor: 2.5 }, { parkingFloors: -1 }, { noLift: 'false' }, { floors: Number.MAX_SAFE_INTEGER }]) {
    assert.equal(calculate(rates, { ...BASE_BUILDING, ...invalid }), null);
  }
});
