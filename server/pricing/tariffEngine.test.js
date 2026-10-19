'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  TariffError,
  validatePolicy,
  quote,
  loadDeploymentTariff,
} = require('./tariffEngine');

const at = '2026-10-19T00:00:00.000Z';

function policy(services, versions) {
  return validatePolicy({
    companyId: 'deployment-under-test',
    currencyUnit: 'minor',
    versions: versions || [{
      id: 'v-published',
      status: 'published',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: null,
      services,
    }],
  });
}

function line(model, extra = {}) {
  return { model, rate: 3, surcharges: [], factors: [], discounts: [], ...extra };
}

test('hourly, fixed, count and area quotes come only from the supplied tariff', () => {
  const loaded = policy({
    hour: line('hourly', { minQuantity: 2, surcharges: [{ id: 'extra', optionId: 'addon', amount: 5 }] }),
    flat: line('fixed', { rate: 11 }),
    pieces: line('count', { rate: 4 }),
    space: line('area', { rate: 4, factors: [{ id: 'place', optionId: 'place', equals: 'outer', basisPoints: 15000 }] }),
  });
  assert.equal(quote(loaded, { at, serviceId: 'hour', quantity: 2, options: { addon: true } }).total, 11);
  assert.equal(quote(loaded, { at, serviceId: 'flat' }).total, 11);
  assert.equal(quote(loaded, { at, serviceId: 'pieces', quantity: 5 }).total, 20);
  const area = quote(loaded, { at, serviceId: 'space', quantity: 1, options: { place: 'outer' } });
  assert.equal(area.total, 6);
  assert.equal(area.tariffVersionId, 'v-published');
  assert.equal(area.currencyUnit, 'minor');
  assert.equal(area.companyId, 'deployment-under-test');
});

test('half-up integer rounding does not use binary floating point', () => {
  const loaded = policy({
    hour: line('hourly', { rate: 1, discounts: [{ id: 'half', basisPoints: 5000 }] }),
  });
  const result = quote(loaded, { at, serviceId: 'hour', quantity: 1 });
  assert.equal(result.discountTotal, 1);
  assert.equal(result.total, 0);
});

test('missing, draft-only and expired tariffs do not become a zero price', () => {
  const empty = policy({}, []);
  assert.throws(() => quote(empty, { at, serviceId: 'hour', quantity: 1 }), (error) => error.code === 'TARIFF_VERSION_NOT_FOUND');
  const draft = policy({ hour: line('hourly') }, [{
    id: 'v-draft', status: 'draft', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    services: { hour: line('hourly', { rate: 9 }) },
  }]);
  assert.throws(() => quote(draft, { at, serviceId: 'hour', quantity: 1 }), (error) => error.code === 'TARIFF_VERSION_NOT_FOUND');
  const expired = policy({ hour: line('hourly', { rate: 9 }) }, [{
    id: 'v-old', status: 'published', validFrom: '2025-01-01T00:00:00.000Z', validTo: '2025-02-01T00:00:00.000Z',
    services: { hour: line('hourly', { rate: 9 }) },
  }]);
  assert.throws(() => quote(expired, { at, serviceId: 'hour', quantity: 1 }), (error) => error.code === 'TARIFF_VERSION_NOT_FOUND');
});

test('the published version active at the requested time is selected', () => {
  const loaded = policy({}, [
    {
      id: 'v1', status: 'published', validFrom: '2026-01-01T00:00:00.000Z', validTo: '2026-06-01T00:00:00.000Z',
      services: { hour: line('hourly', { rate: 2 }) },
    },
    {
      id: 'v2', status: 'published', validFrom: '2026-06-01T00:00:00.000Z', validTo: null,
      services: { hour: line('hourly', { rate: 8 }) },
    },
  ]);
  assert.equal(quote(loaded, { at: '2026-03-01T00:00:00.000Z', serviceId: 'hour', quantity: 1 }).tariffVersionId, 'v1');
  assert.equal(quote(loaded, { at, serviceId: 'hour', quantity: 1 }).tariffVersionId, 'v2');
});

test('invalid input, unknown service and client authority are rejected', () => {
  const loaded = policy({
    hour: line('hourly', { minQuantity: 2 }),
    flat: line('fixed'),
  });
  assert.throws(() => quote(loaded, { at, serviceId: 'missing', quantity: 2 }), (error) => error.code === 'SERVICE_NOT_IN_TARIFF');
  assert.throws(() => quote(loaded, { at, serviceId: 'hour', quantity: 1 }), (error) => error.code === 'INPUT_INVALID');
  assert.throws(() => quote(loaded, { at, serviceId: 'hour', quantity: 2, companyId: 'other' }), (error) => error.code === 'INPUT_INVALID');
  assert.throws(() => quote(loaded, { at, serviceId: 'hour', quantity: 2, price: 1 }), (error) => error.code === 'INPUT_INVALID');
  assert.throws(() => quote(loaded, { at, serviceId: 'hour', quantity: 2, options: { unknown: true } }), (error) => error.code === 'INPUT_INVALID');
  assert.throws(() => quote(loaded, { at, serviceId: 'flat', quantity: 4 }), (error) => error.code === 'INPUT_INVALID');
});

test('inherited service ids return SERVICE_NOT_IN_TARIFF', () => {
  const loaded = policy({ hour: line('hourly', { rate: 4 }) });
  for (const serviceId of ['toString', 'constructor', '__proto__']) {
    assert.throws(
      () => quote(loaded, { at, serviceId, quantity: 1 }),
      (error) => error instanceof TariffError && error.code === 'SERVICE_NOT_IN_TARIFF',
    );
  }
  assert.equal(quote(loaded, { at, serviceId: 'hour', quantity: 2 }).total, 8);
});

test('special catalog keys stay own service records', () => {
  const services = { hour: line('hourly', { rate: 4 }) };
  Object.defineProperty(services, '__proto__', {
    value: line('fixed', { rate: 9 }),
    enumerable: true,
    configurable: true,
  });
  services.toString = line('fixed', { rate: 7 });
  const loaded = validatePolicy({
    companyId: 'deployment-under-test',
    currencyUnit: 'minor',
    versions: [{
      id: 'v-special',
      status: 'published',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: null,
      services,
    }],
  });
  const stored = loaded.versions[0].services;
  assert.equal(Object.getPrototypeOf(stored), null);
  assert.equal(Object.hasOwn(stored, 'toString'), true);
  assert.equal(Object.hasOwn(stored, '__proto__'), true);
  assert.equal(Object.hasOwn(stored, 'constructor'), false);
  assert.equal(quote(loaded, { at, serviceId: 'hour', quantity: 2 }).total, 8);
  assert.equal(quote(loaded, { at, serviceId: 'toString' }).total, 7);
  assert.equal(quote(loaded, { at, serviceId: '__proto__' }).total, 9);
  assert.throws(
    () => quote(loaded, { at, serviceId: 'constructor', quantity: 1 }),
    (error) => error instanceof TariffError && error.code === 'SERVICE_NOT_IN_TARIFF',
  );
});

test('overlapping published versions and a missing trusted file are controlled errors', () => {
  assert.throws(() => policy({}, [
    { id: 'a', status: 'published', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, services: {} },
    { id: 'b', status: 'published', validFrom: '2026-02-01T00:00:00.000Z', validTo: null, services: {} },
  ]), (error) => error instanceof TariffError && error.code === 'TARIFF_INVALID');
  assert.throws(() => loadDeploymentTariff({}), (error) => error.code === 'TARIFF_NOT_CONFIGURED');
});

test('a published policy loaded from the deployment file is frozen and quoted', () => {
  const file = path.join(os.tmpdir(), `paksho-tariff-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify({
    companyId: 'deployment-under-test',
    currencyUnit: 'minor',
    versions: [{
      id: 'v-file', status: 'published', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
      services: { pieces: { model: 'count', rate: 6, surcharges: [], factors: [], discounts: [] } },
    }],
  }));
  try {
    const loaded = loadDeploymentTariff({ PAKSHO_TARIFF_FILE: file });
    assert.equal(Object.isFrozen(loaded), true);
    assert.throws(() => { loaded.companyId = 'changed'; });
    const result = quote(loaded, { at, serviceId: 'pieces', quantity: 2 });
    assert.deepEqual(
      { total: result.total, version: result.tariffVersionId, company: result.companyId },
      { total: 12, version: 'v-file', company: 'deployment-under-test' },
    );
  } finally {
    fs.rmSync(file, { force: true });
  }
});
