'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePricingMode } = require('./pricingMode');

test('production stays on server pricing even if legacy is requested', () => {
  assert.equal(resolvePricingMode({ NODE_ENV: 'production', PAKSHO_PRICING_MODE: 'legacy' }), 'server');
  assert.equal(resolvePricingMode({ NODE_ENV: 'production' }), 'server');
  assert.equal(resolvePricingMode({ NODE_ENV: 'production', PAKSHO_PRICING_MODE: 'unknown' }), 'server');
});

test('explicit legacy is limited to test and development', () => {
  assert.equal(resolvePricingMode({ NODE_ENV: 'test', PAKSHO_PRICING_MODE: 'legacy' }), 'legacy');
  assert.equal(resolvePricingMode({ NODE_ENV: 'development', PAKSHO_PRICING_MODE: 'legacy' }), 'legacy');
  assert.equal(resolvePricingMode({ NODE_ENV: 'test' }), 'legacy');
});

test('missing or unknown mode fails closed outside the test default', () => {
  assert.equal(resolvePricingMode({ NODE_ENV: 'development' }), 'server');
  assert.equal(resolvePricingMode({ NODE_ENV: 'test', PAKSHO_PRICING_MODE: 'maybe' }), 'server');
  assert.equal(resolvePricingMode({}), 'server');
});
