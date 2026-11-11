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

const { quote } = require('./tariffEngine');

function frozen(service) {
  const policy = policyWith(service);
  return policy;
}

test('mattress_seat: 7-seat factor 1.0 gives rate × mattresses', () => {
  const result = quote(frozen(modeB), { at, serviceId: 's', quantity: 2, options: { seatSize: '7' } });
  assert.equal(result.total, 700000);
});

test('mattress_seat: 9-seat factor 1.3 scales the rate', () => {
  const result = quote(frozen(modeB), { at, serviceId: 's', quantity: 2, options: { seatSize: '9' } });
  assert.equal(result.total, 910000);
});

test('mattress_seat: seat size is required', () => {
  assert.throws(() => quote(frozen(modeB), { at, serviceId: 's', quantity: 2 }), /نوع نشیمن/);
});

test('mattress_seat: seat size other than 7 or 9 is rejected', () => {
  assert.throws(() => quote(frozen(modeB), { at, serviceId: 's', quantity: 2, options: { seatSize: '5' } }), /نوع نشیمن/);
});

test('units: quantity × rate with no seat factor', () => {
  const units = { model: 'count', rate: 350000, pricingMode: 'units' };
  assert.equal(quote(frozen(units), { at, serviceId: 's', quantity: 3 }).total, 1050000);
});

test('seatSize is rejected for a service without mattress_seat mode', () => {
  const plain = { model: 'count', rate: 350000 };
  assert.throws(() => quote(frozen(plain), { at, serviceId: 's', quantity: 1, options: { seatSize: '7' } }), /نوع نشیمن فقط/);
});
