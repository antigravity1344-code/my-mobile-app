'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

test('worker order currency comes from the stored order before and after accept, without leaking pricing', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-worker-currency-'));
  const fixtureEnv = {
    NODE_ENV: 'test', PAKSHO_PRICING_MODE: 'server',
    PAKSHO_QUOTE_SECRET: 'isolated-worker-currency-fixture',
    PAKSHO_TARIFF_FILE: path.join(tmp, 'tariff.json'),
  };
  const previous = new Map(Object.keys(fixtureEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, fixtureEnv);
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  assert.equal(seedCommittedPolicy(process.env, {
    companyId: 'isolated-worker-currency', currencyUnit: 'minor',
    versions: [{
      id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00Z', validTo: '2099-01-01T00:00:00Z',
      services: { fixed: { model: 'fixed', rate: 945 } },
    }],
  }).ok, true);
  const { createTestHarness, request } = require('./testAuthHarness');
  const harness = createTestHarness('paksho-worker-currency-http-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120001991');
  const worker = await harness.login(server, '09120001992', 'WORKER');
  harness.store.updateUser({ ...harness.store.getUser(worker.user.id), status: 'APPROVED' });
  const quoted = await request(server, {
    method: 'POST', pathname: '/api/pricing/quote', token: customer.token, body: { serviceId: 'fixed' },
  });
  assert.equal(quoted.status, 200);
  const created = await request(server, {
    method: 'POST', pathname: '/api/orders', token: customer.token,
    body: {
      serviceId: 'fixed', serviceTitle: 'Synthetic', customerName: 'Fixture customer', customerPhone: '09120001991',
      address: 'تهران، خیابان ساختگی پلاک ۳', addressNotes: 'private-address-note', notes: 'private-customer-note',
      date: '1405-08-01', time: '10:00', quoteToken: quoted.json.quote.quoteToken,
      confirmedTotal: quoted.json.quote.total, clientRequestId: 'worker-currency-01',
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.order.pricing.currencyUnit, 'minor');
  const saved = harness.store.getOrder(created.json.order.id);
  const cases = [
    { order: saved, unit: 'minor' },
    { order: harness.store.createOrder({ ...saved, id: 'legacy-pricing-null', clientRequestId: null, price: 150000, pricing: null }), unit: undefined },
    { order: harness.store.createOrder({ ...saved, id: 'legacy-unit-missing', clientRequestId: null, price: 175000, pricing: { total: 175000 } }), unit: undefined },
  ];
  // An unavailable current tariff cannot affect already stored order amounts or units.
  process.env.PAKSHO_TARIFF_FILE = path.join(tmp, 'missing-current-tariff.json');
  const available = await request(server, { pathname: '/api/orders/available', token: worker.token });
  assert.equal(available.status, 200);

  function assertVisibleMoney(order, expected) {
    assert.equal(order.price, expected.order.price);
    assert.equal(order.currencyUnit, expected.unit);
    assert.equal(Object.hasOwn(order, 'currencyUnit'), expected.unit !== undefined);
    for (const field of ['pricing', 'pricingJson', 'breakdown', 'quoteToken', 'customerId', 'notes']) {
      assert.equal(Object.hasOwn(order, field), false, `${field} must stay private`);
    }
    assert.equal(JSON.stringify(order).includes(quoted.json.quote.quoteToken), false);
    assert.equal(JSON.stringify(order).includes('private-customer-note'), false);
  }

  for (const expected of cases) {
    const listed = available.json.orders.find((order) => order.id === expected.order.id);
    assert.ok(listed);
    assertVisibleMoney(listed, expected);
    assert.equal(listed.customerPhone, '');
    assert.equal(listed.address, 'تهران');
    assert.equal(listed.addressNotes, null);
    const accepted = await request(server, {
      method: 'PUT', pathname: `/api/orders/${expected.order.id}/accept`, token: worker.token, body: {},
    });
    assert.equal(accepted.status, 200);
    assertVisibleMoney(accepted.json.order, expected);
    const mine = await request(server, { pathname: '/api/orders', token: worker.token });
    assert.equal(mine.status, 200);
    assertVisibleMoney(mine.json.orders.find((order) => order.id === expected.order.id), expected);
    const after = harness.store.getOrder(expected.order.id);
    assert.equal(after.price, expected.order.price);
    assert.deepEqual(after.pricing, expected.order.pricing);
  }
});
