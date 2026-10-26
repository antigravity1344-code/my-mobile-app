const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { request, installTestSmsCapture } = require('./testAuthHarness');
let store, server, sms;
const previous = new Map();
before(async () => {
  const env = { NODE_ENV: 'test', PAKSHO_DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), PAKSHO_ADMIN_PASSWORD: 'isolated-area-admin' };
  for (const [key, value] of Object.entries(env)) { previous.set(key, process.env[key]); process.env[key] = value; }
  sms = installTestSmsCapture();
  const data = require('./dataStore'), originalCreate = data.createDataStore, originalExists = fs.existsSync;
  const envPaths = new Set([path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]);
  try {
    // Exercise the real HTTP app and auth middleware without reading env files or opening a real database.
    data.createDataStore = () => originalCreate(':memory:');
    fs.existsSync = file => envPaths.has(String(file)) ? false : originalExists(file);
    const runtime = require('./index'); store = runtime.store;
    server = await new Promise(resolve => { const instance = runtime.app.listen(0, '127.0.0.1', () => resolve(instance)); });
  } finally { data.createDataStore = originalCreate; fs.existsSync = originalExists; }
  for (const [id, role, status] of [['w1', 'WORKER', 'APPROVED'], ['w2', 'WORKER', 'APPROVED'], ['c1', 'CUSTOMER', 'ACTIVE'], ['blocked', 'WORKER', 'BLOCKED']]) {
    store.createUser({ id, role, status, phone: '0912111111' + ({ w1: 1, w2: 3, c1: 2, blocked: 4 }[id]), isProfileComplete: true,
      name: id, nationalId: '1234567890', address: 'نشانی قبلی', city: 'شهر قدیمی', bankSheba: 'IR000000000000000000000000',
      skills: ['home_unit_cleaning'], idDoc: 'unchanged-document', createdAt: '2026-10-26T00:00:00.000Z' });
    store.createSession('token-' + id, { userId: id, role, expires: Date.now() + 60000 });
  }
  const catalog = store.serviceAreas.read();
  assert.equal(store.serviceAreas.publish({ expectedVersion: 0, defaultCityId: 'tehran', cities: [
    { ...catalog.cities[0], neighborhoods: ['ونک', 'پونک'] }, { id: 'yazd', name: 'یزد', neighborhoods: ['صفائیه'] },
  ] }).code, 'ok');
});
after(async () => {
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  store?.close(); sms?.restore();
  for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
const endpoint = '/api/workers/me/service-area';
const put = (body, token = 'token-w1') => request(server, { method: 'PUT', pathname: endpoint, token, body });
const body = (extra = {}) => ({ cityId: 'tehran', neighborhoods: ['ونک'], catalogVersion: store.serviceAreas.read().version,
  expectedVersion: store.workerServiceArea.read('w1')?.version || 0, ...extra });

test('real sessions deny unauthenticated, customer and blocked accounts; reject target IDs and query impersonation', async () => {
  for (const token of [undefined, 'invalid', 'token-c1', 'token-blocked']) {
    const expected = !token || token === 'invalid' ? 401 : 403;
    assert.equal((await request(server, { pathname: endpoint, token })).status, expected);
    assert.equal((await request(server, { method: 'PUT', pathname: endpoint, token, body: body() })).status, expected);
  }
  assert.equal((await put(body({ userId: 'w2' }))).status, 400);
  assert.equal((await put(body({ workerId: 'w2' }))).status, 400);
  assert.equal((await request(server, { pathname: endpoint + '?userId=w2', token: 'token-w1' })).status, 400);
  assert.equal(store.workerServiceArea.read('w2'), null);
});
test('saves and reads one city/multiple neighborhoods during an active job without touching profile, documents or order', async () => {
  const user = store.getUser('w1');
  const order = store.createOrder({ id: 'active', customerId: 'c1', customerName: 'مشتری', customerPhone: '09121111112',
    serviceTitle: 'نظافت', address: 'نشانی کار', date: '2026-10-26', time: '10:00', price: 100000,
    cleanerId: 'w1', status: 'IN_PROGRESS', createdAt: '2026-10-26T00:00:00.000Z' });
  const result = await put(body({ neighborhoods: ['ونک', 'پونک'] }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.area.neighborhoods, ['ونک', 'پونک']);
  assert.equal(result.json.area.cityName, 'تهران');
  assert.deepEqual((await request(server, { pathname: endpoint, token: 'token-w1' })).json.area, result.json.area);
  assert.deepEqual(store.getUser('w1'), user);
  assert.deepEqual(store.getOrder('active'), order);
  assert.equal((await request(server, { pathname: endpoint, token: 'token-w2' })).json.area, null);
  store.deleteSession('token-w1');
  assert.equal((await request(server, { pathname: endpoint, token: 'token-w1' })).status, 401);
  store.createSession('token-w1', { userId: 'w1', role: 'WORKER', expires: Date.now() + 60000 });
  assert.deepEqual((await request(server, { pathname: endpoint, token: 'token-w1' })).json.area, result.json.area);
});
test('invalid selection and stale profile/catalog versions leave saved area intact', async () => {
  const saved = store.workerServiceArea.read('w1');
  for (const input of [body({ cityId: 'missing' }), body({ neighborhoods: [] }), body({ neighborhoods: ['صفائیه'] }),
    body({ neighborhoods: ['ونک', 'ونک'] }), body({ neighborhoods: [null] }), body({ address: 'must not change' })]) {
    assert.equal((await put(input)).status, 400); assert.deepEqual(store.workerServiceArea.read('w1'), saved);
  }
  assert.equal((await put(body({ expectedVersion: 0 }))).status, 409);
  assert.equal((await put(body({ catalogVersion: 0 }))).status, 409);
  assert.deepEqual(store.workerServiceArea.read('w1'), saved);
});
test('customer city fields survive saved-address round-trip; old addresses do not acquire a guessed city', async () => {
  const old = { id: 'legacy', title: 'قدیمی', district: 'محله قبلی', fullAddress: 'خیابان قبلی', isDefault: true };
  const fresh = { id: 'new', title: 'جدید', cityId: 'yazd', city: 'یزد', district: 'صفائیه', fullAddress: 'خیابان تازه' };
  assert.equal((await request(server, { method: 'PUT', pathname: '/api/users/addresses', token: 'token-c1', body: { addresses: [old, fresh] } })).status, 200);
  const list = (await request(server, { pathname: '/api/users/addresses', token: 'token-c1' })).json.addresses;
  assert.equal(Object.hasOwn(list[0], 'city'), false);
  assert.equal(list[1].city, 'یزد'); assert.equal(list[1].cityId, 'yazd');
});
test('new account uses company default; returning accounts retain their original city and verification status', async () => {
  const catalog = store.serviceAreas.read();
  store.serviceAreas.publish({ expectedVersion: catalog.version, defaultCityId: 'yazd', cities: catalog.cities });
  const phone = '09123334444';
  await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone } });
  const result = await request(server, { method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code: sms.codeFor(phone), role: 'WORKER' } });
  assert.equal(result.status, 200);
  assert.equal(store.getUserByPhone(phone, 'WORKER').city, 'یزد');
  assert.equal(store.getUser('w1').city, 'شهر قدیمی'); assert.equal(store.getUser('w1').status, 'APPROVED');
  assert.equal(store.workerServiceArea.read('w1').cityName, 'تهران');
  const returningPhone = store.getUser('w1').phone;
  await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone: returningPhone } });
  const returning = await request(server, { method: 'POST', pathname: '/api/auth/verify-otp',
    body: { phone: returningPhone, code: sms.codeFor(returningPhone), role: 'WORKER' } });
  assert.equal(returning.status, 200);
  assert.equal(store.getUser('w1').city, 'شهر قدیمی'); assert.equal(store.getUser('w1').status, 'APPROVED');
});
test('admin neighborhood changes preserve stored worker history and reject saving removed neighborhoods', async () => {
  const saved = store.workerServiceArea.read('w1'), catalog = store.serviceAreas.read();
  store.serviceAreas.publish({ expectedVersion: catalog.version, defaultCityId: catalog.defaultCityId,
    cities: catalog.cities.map(city => city.id === 'tehran' ? { ...city, neighborhoods: ['پونک'] } : city) });
  assert.deepEqual((await request(server, { pathname: endpoint, token: 'token-w1' })).json.area, saved);
  assert.equal((await put(body({ neighborhoods: ['ونک'] }))).status, 400);
  assert.deepEqual(store.workerServiceArea.read('w1'), saved);
});
test('worker area survives database close/reopen; failed save preserves the previous selection', () => {
  const filename = path.join(os.tmpdir(), 'paksho-worker-area-' + crypto.randomUUID() + '.sqlite');
  const { createDataStore } = require('./dataStore');
  let local;
  try {
    local = createDataStore(filename);
    local.createUser({ id: 'disk-worker', phone: '09120000001', role: 'WORKER', status: 'APPROVED', createdAt: '2026-10-26T00:00:00.000Z' });
    local.serviceAreas.publish({ expectedVersion: 0, defaultCityId: 'tehran', cities: [{ id: 'tehran', name: 'تهران', neighborhoods: ['ونک'] }] });
    const result = local.workerServiceArea.save('disk-worker', { cityId: 'tehran', neighborhoods: ['ونک'], catalogVersion: 1, expectedVersion: 0 });
    assert.equal(result.code, 'ok');
    local.close(); local = createDataStore(filename);
    assert.deepEqual(local.workerServiceArea.read('disk-worker'), result.area);
    assert.equal(local.workerServiceArea.save('disk-worker', { cityId: 'tehran', neighborhoods: ['نامعتبر'], catalogVersion: 1, expectedVersion: 1 }).code, 'invalid');
    assert.deepEqual(local.workerServiceArea.read('disk-worker'), result.area);
    const raw = new (require('node:sqlite').DatabaseSync)(filename);
    try { raw.exec("CREATE TRIGGER fail_area BEFORE UPDATE ON worker_service_areas BEGIN SELECT RAISE(ABORT, 'isolated save failure'); END"); }
    finally { raw.close(); }
    assert.throws(() => local.workerServiceArea.save('disk-worker', { cityId: 'tehran', neighborhoods: ['ونک'], catalogVersion: 1, expectedVersion: 1 }), /isolated save failure/);
    assert.deepEqual(local.workerServiceArea.read('disk-worker'), result.area);
  } finally { local?.close(); if (fs.existsSync(filename)) fs.unlinkSync(filename); }
});
