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

test('exemptFromTierLock defaults to false when the tariff does not set it', () => {
  const version = selectVersion(policyWith({ model: 'fixed', rate: 1000 }), at);
  assert.equal(version.services.s.exemptFromTierLock, false);
});

test('exemptFromTierLock true is stored as true', () => {
  const version = selectVersion(policyWith({ model: 'fixed', rate: 1000, exemptFromTierLock: true }), at);
  assert.equal(version.services.s.exemptFromTierLock, true);
});

test('a non-boolean exemptFromTierLock is rejected', () => {
  assert.throws(() => policyWith({ model: 'fixed', rate: 1000, exemptFromTierLock: 'yes' }), /پرچم معافیت/);
});
