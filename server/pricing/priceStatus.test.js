const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_TARIFF_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-price-status-')), 'tariff.json');

const seeded = seedCommittedPolicy(process.env, {
  companyId: 'company-price-status',
  currencyUnit: 'toman',
  versions: [{
    id: 'v1',
    status: 'published',
    validFrom: '2020-01-01T00:00:00.000Z',
    validTo: '2099-01-01T00:00:00.000Z',
    services: {
      fixed_job: { model: 'fixed', rate: 1000000 },
      hourly_job: { model: 'hourly', rate: 1000, minQuantity: 1 },
      exempt_hourly: { model: 'hourly', rate: 1000, minQuantity: 1, exemptFromTierLock: true },
    },
  }],
});
if (!seeded.ok) throw new Error(seeded.code);

const { orderPriceStatus, currentPricingRules } = require('./priceStatus');

test('a tariff fixed model locks the stored amount, whatever the service id is', () => {
  assert.deepEqual(orderPriceStatus({ serviceId: 'fixed_job', price: 1000000 }), { status: 'locked', lockedAmount: 1000000 });
});

test('a name that used to be hardcoded does not lock the price unless the tariff model is fixed', () => {
  assert.deepEqual(orderPriceStatus({ serviceId: 'staircase_common_areas', price: 1000000 }), { status: 'hourly_pending' });
});

test('a golden request locks an hourly service', () => {
  assert.deepEqual(
    orderPriceStatus({ serviceId: 'hourly_job', price: 2275000, directRequestWorkerId: 'w1' }),
    { status: 'locked', lockedAmount: 2275000 },
  );
});

test('an ordinary hourly service, even when exempt from tier lock, stays pending', () => {
  assert.deepEqual(orderPriceStatus({ serviceId: 'hourly_job', price: 1750000 }), { status: 'hourly_pending' });
  assert.deepEqual(orderPriceStatus({ serviceId: 'exempt_hourly', price: 1750000 }), { status: 'hourly_pending' });
});

test('an invalid or zero amount is unknown', () => {
  assert.deepEqual(orderPriceStatus({ serviceId: 'fixed_job', price: 0 }), { status: 'unknown' });
  assert.deepEqual(orderPriceStatus({ serviceId: 'hourly_job', price: null }), { status: 'unknown' });
  assert.deepEqual(orderPriceStatus(null), { status: 'unknown' });
});

test('pricing rules expose the tariff model and exemption flag without a rate', () => {
  const rules = currentPricingRules();
  const fixed = rules.find((rule) => rule.serviceId === 'fixed_job');
  const exempt = rules.find((rule) => rule.serviceId === 'exempt_hourly');
  assert.deepEqual(fixed, { serviceId: 'fixed_job', model: 'fixed', exemptFromTierLock: false });
  assert.equal(exempt.exemptFromTierLock, true);
  assert.equal(exempt.model, 'hourly');
  assert.equal(Object.hasOwn(fixed, 'rate'), false);
});
