const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePolicy, selectVersion } = require('./tariffEngine');

const at = '2026-10-19T00:00:00.000Z';

function policyWith(service) {
  return validatePolicy({
    companyId: 'deployment-under-test',
    currencyUnit: 'minor',
    versions: [{ id: 'v1', status: 'published', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, services: { s: service } }],
  });
}

const modeB = { model: 'count', rate: 350000, pricingMode: 'mattress_seat', seatFactors: { '7': 10000, '9': 13000 } };

test('pricingMode defaults to null when the tariff does not set it', () => {
  const version = selectVersion(policyWith({ model: 'count', rate: 350000 }), at);
  assert.equal(version.services.s.pricingMode, null);
  assert.equal(version.services.s.seatFactors, null);
});

test('mattress_seat mode stores both seat factors', () => {
  const version = selectVersion(policyWith(modeB), at);
  assert.equal(version.services.s.pricingMode, 'mattress_seat');
  assert.deepEqual(version.services.s.seatFactors, { '7': 10000, '9': 13000 });
});

test('units mode is accepted without seat factors', () => {
  const version = selectVersion(policyWith({ model: 'count', rate: 350000, pricingMode: 'units' }), at);
  assert.equal(version.services.s.pricingMode, 'units');
  assert.equal(version.services.s.seatFactors, null);
});

test('an unknown pricingMode is rejected', () => {
  assert.throws(() => policyWith({ model: 'count', rate: 1, pricingMode: 'weird' }), /حالت قیمت‌گذاری/);
});

test('mattress_seat without seat factors is rejected', () => {
  assert.throws(() => policyWith({ model: 'count', rate: 1, pricingMode: 'mattress_seat' }), /ضرایب نشیمن/);
});

test('mattress_seat with a missing 9-seat factor is rejected', () => {
  assert.throws(
    () => policyWith({ model: 'count', rate: 1, pricingMode: 'mattress_seat', seatFactors: { '7': 10000 } }),
    /ضریب نشیمن ۷ یا ۹/,
  );
});

test('a non-positive seat factor is rejected', () => {
  assert.throws(
    () => policyWith({ model: 'count', rate: 1, pricingMode: 'mattress_seat', seatFactors: { '7': 10000, '9': 0 } }),
    /ضریب نشیمن باید مثبت/,
  );
});

test('seat factors are rejected outside the mattress_seat mode', () => {
  assert.throws(
    () => policyWith({ model: 'count', rate: 1, pricingMode: 'units', seatFactors: { '7': 10000, '9': 13000 } }),
    /فقط برای حالت مبل‌شویی/,
  );
});
