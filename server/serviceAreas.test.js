const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { createServiceAreas } = require('./serviceAreas');
const { registerServiceAreaRoutes } = require('./serviceAreaRoutes');
const { request } = require('./testAuthHarness');

function fixture(filename = ':memory:') {
  const database = new DatabaseSync(filename);
  const transaction = fn => {
    database.exec('BEGIN IMMEDIATE');
    try { const result = fn(); database.exec('COMMIT'); return result; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  };
  return { database, areas: createServiceAreas({ database, transaction }) };
}
function update(catalog, extra = {}) {
  return { expectedVersion: catalog.version, defaultCityId: catalog.defaultCityId, cities: catalog.cities, ...extra };
}
test('starts with Tehran and no guessed neighborhoods; saves independent company catalogs across reopen', () => {
  // A single temporary file in the existing OS temp directory; no directory creation.
  const filename = path.join(os.tmpdir(), 'paksho-service-areas-' + randomUUID() + '.sqlite');
  let first, reopened, other;
  try {
    first = fixture(filename); other = fixture();
    const initial = first.areas.read();
    assert.deepEqual(initial, { version: 0, defaultCityId: 'tehran', cities: [{ id: 'tehran', name: 'تهران', neighborhoods: [] }] });
    assert.equal(first.areas.publish(update(initial, { defaultCityId: 'shiraz', cities: [
      ...initial.cities, { id: 'shiraz', name: ' شیراز ', neighborhoods: ['معالی‌آباد'] },
    ] })).code, 'ok');
    first.database.close(); first = null;
    reopened = fixture(filename);
    assert.equal(reopened.areas.read().defaultCityId, 'shiraz');
    assert.equal(reopened.areas.read().cities[1].name, 'شیراز');
    assert.equal(reopened.areas.read().version, 1);
    assert.deepEqual(other.areas.read(), initial);
  } finally {
    first?.database.close(); reopened?.database.close(); other?.database.close();
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }
});
test('rejects stale versions, invalid or duplicate labels, unknown fields, deletion and missing default without changing data', () => {
  const { database, areas } = fixture();
  try {
    const initial = areas.read();
    for (const input of [
      update(initial, { userId: 'someone' }), update(initial, { expectedVersion: -1 }),
      update(initial, { expectedVersion: '0' }), update(initial, { cities: [] }),
      update(initial, { defaultCityId: 'missing' }), update(initial, { cities: [{ id: 'other', name: 'یزد', neighborhoods: [] }], defaultCityId: 'other' }),
      ...['', '<script>alert(1)</script>', 'شهر\u202e', 'ا'.repeat(81)].map(name => update(initial, { cities: [{ ...initial.cities[0], name }] })),
      update(initial, { cities: [{ ...initial.cities[0], neighborhoods: ['ونک', ' ونك '] }] }),
      update(initial, { cities: [{ ...initial.cities[0], neighborhoods: [null] }] }),
      update(initial, { cities: [{ ...initial.cities[0], neighborhoods: ['محله\nپنهان'] }] }),
      update(initial, { cities: [{ ...initial.cities[0], neighborhoods: [], unauthorized: true }] }),
      update(initial, { cities: [...initial.cities, { id: 'second', name: 'تهران', neighborhoods: [] }] }),
      update(initial, { cities: [...initial.cities, { id: 'tehran', name: 'تبریز', neighborhoods: [] }] }),
      update(initial, { cities: [{ ...initial.cities[0], neighborhoods: Array.from({ length: 501 }, (_, i) => 'محله ' + i) }] }),
      update(initial, { cities: [...initial.cities, ...Array.from({ length: 100 }, (_, i) => ({ id: 'city-' + i, name: 'شهر ' + i, neighborhoods: [] }))] }),
    ]) {
      assert.equal(areas.publish(input).code, 'invalid', JSON.stringify(input));
      assert.deepEqual(areas.read(), initial);
    }
    assert.equal(areas.publish(update(initial)).code, 'ok');
    assert.equal(areas.publish(update(initial)).code, 'conflict');
    assert.equal(areas.read().version, 1);
  } finally { database.close(); }
});
test('failed database writes roll back; catalog edits leave legacy user and active order data untouched', () => {
  const { database, areas } = fixture();
  try {
    database.exec(`CREATE TABLE users (id TEXT, city TEXT, status TEXT); CREATE TABLE orders (id TEXT, status TEXT);
      INSERT INTO users VALUES ('legacy', 'شهر قدیمی', 'APPROVED'); INSERT INTO orders VALUES ('active', 'IN_PROGRESS');`);
    const users = database.prepare('SELECT * FROM users').all(), orders = database.prepare('SELECT * FROM orders').all();
    const initial = areas.read();
    database.exec("CREATE TRIGGER fail_catalog BEFORE INSERT ON service_area_catalog BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => areas.publish(update(initial)), /test failure/);
    assert.deepEqual(areas.read(), initial);
    database.exec('DROP TRIGGER fail_catalog');
    assert.equal(areas.publish(update(initial, { cities: [{ ...initial.cities[0], name: 'تهران بزرگ', neighborhoods: ['ونک'] }] })).code, 'ok');
    assert.deepEqual(database.prepare('SELECT * FROM users').all(), users);
    assert.deepEqual(database.prepare('SELECT * FROM orders').all(), orders);
  } finally { database.close(); }
});
test('HTTP: public catalog is read-only; admin guard, strict bodies, conflict and storage errors', async t => {
  const { database, areas } = fixture();
  const app = express(); app.use(express.json());
  registerServiceAreaRoutes(app, { areas, requireAdmin: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer isolated-admin') return res.status(401).json({ success: false });
    next();
  } });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); database.close(); });
  const admin = { pathname: '/api/admin/service-areas', token: 'isolated-admin' };
  const initial = (await request(server, { pathname: '/api/service-areas' })).json.catalog;
  for (const token of [undefined, 'customer-session', 'worker-session', 'invalid']) {
    assert.equal((await request(server, { pathname: admin.pathname, token })).status, 401);
    assert.equal((await request(server, { pathname: admin.pathname, method: 'PUT', token, body: update(initial) })).status, 401);
  }
  assert.equal((await request(server, { ...admin })).status, 200);
  assert.equal((await request(server, { pathname: '/api/service-areas', method: 'PUT', body: update(initial) })).status, 404);
  assert.equal((await request(server, { ...admin, pathname: admin.pathname + '?company=other' })).status, 400);
  assert.equal((await request(server, { ...admin, method: 'PUT', body: update(initial, { companyId: 'other' }) })).status, 400);
  assert.equal((await request(server, { ...admin, method: 'PUT', body: update(initial) })).status, 200);
  assert.equal((await request(server, { ...admin, method: 'PUT', body: update(initial) })).status, 409);
  database.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON service_area_catalog BEGIN SELECT RAISE(ABORT, 'failure'); END");
  assert.equal((await request(server, { ...admin, method: 'PUT', body: update(areas.read()) })).status, 500);
  assert.equal(areas.read().version, 1);
});

test('integrates with the real in-memory data store without changing approved profiles, customer addresses or an active order', () => {
  const previous = process.env.PAKSHO_DATA_ENCRYPTION_KEY;
  process.env.PAKSHO_DATA_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('hex');
  let store;
  try {
    store = require('./dataStore').createDataStore(':memory:');
    const worker = store.createUser({ id: 'w', phone: '09120000001', role: 'WORKER', status: 'APPROVED', isProfileComplete: true,
      name: 'متخصص آزمایشی', city: 'شهر قدیمی', address: 'نشانی قبلی', skills: ['نظافت'], bankSheba: 'IR000000000000000000000000', createdAt: '2026-10-26T00:00:00.000Z' });
    const customer = store.createUser({ id: 'c', phone: '09120000002', role: 'CUSTOMER', status: 'ACTIVE', city: 'شهر دیگر',
      address: 'نشانی مشتری', savedAddresses: [{ id: 'old-address', district: 'محله قبلی' }], createdAt: '2026-10-26T00:00:00.000Z' });
    const order = store.createOrder({ id: 'o', customerId: customer.id, customerName: 'مشتری', customerPhone: customer.phone,
      cleanerId: worker.id, serviceTitle: 'نظافت', date: '2026-10-26', time: '10:00', price: 100000,
      status: 'IN_PROGRESS', address: 'محل کار قبلی', createdAt: '2026-10-26T00:00:00.000Z' });
    const commission = store.commissionPolicy.read(), payment = store.paymentSettings.read();
    const current = store.serviceAreas.read();
    assert.equal(store.serviceAreas.publish(update(current, { defaultCityId: 'yazd', cities: [
      ...current.cities, { id: 'yazd', name: 'یزد', neighborhoods: ['صفائیه'] },
    ] })).code, 'ok');
    assert.deepEqual(store.getUser(worker.id), worker);
    assert.deepEqual(store.getUser(customer.id), customer);
    assert.deepEqual(store.getOrder(order.id), order);
    assert.deepEqual(store.commissionPolicy.read(), commission);
    assert.deepEqual(store.paymentSettings.read(), payment);
  } finally {
    store?.close();
    if (previous === undefined) delete process.env.PAKSHO_DATA_ENCRYPTION_KEY;
    else process.env.PAKSHO_DATA_ENCRYPTION_KEY = previous;
  }
});
