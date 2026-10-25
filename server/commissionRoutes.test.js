const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-commission-api-'));
process.env.NODE_ENV = 'test';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'commission-test-admin';
// Do not load workstation secrets into this isolated HTTP test process.
const exists = fs.existsSync;
const envPaths = new Set([path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]);
let app, store;
try {
  fs.existsSync = file => envPaths.has(String(file)) ? false : exists(file);
  ({ app, store } = require('./index'));
} finally { fs.existsSync = exists; }
const db = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
after(() => { db.close(); store.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

function request(server, pathname, token, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: pathname, method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); } catch (error) { reject(error); } });
    });
    req.on('error', reject); req.end(payload);
  });
}
let phoneSequence = 10;
function fixture(id, role, status, expires = Date.now() + 600000) {
  store.createUser({ id, role, status, phone: `091200000${phoneSequence++}`, name: id, isProfileComplete: false, createdAt: '2026-10-25T00:00:00Z' });
  const token = `commission-test-${id}`;
  store.createSession(token, { userId: id, role, expires });
  return token;
}
test('commission endpoints use real sessions, protect changes, and preserve account/order data', async t => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const worker = fixture('worker', 'WORKER', 'PENDING');
  const customer = fixture('customer', 'CUSTOMER', 'ACTIVE');
  const blocked = fixture('blocked', 'WORKER', 'BLOCKED');
  const expired = fixture('expired', 'WORKER', 'PENDING', Date.now() - 1000);
  const workerPath = '/api/workers/me/commission-policy', adminPath = '/api/admin/commission-policy';
  store.createOrder({ id: 'historical-order', customerId: 'customer', customerName: 'مشتری', customerPhone: '09120000011',
    serviceTitle: 'نظافت', address: 'آدرس سفارش', date: '1405/08/01', time: '10:00', price: 100000,
    notes: '', status: 'COMPLETED', paymentStatus: 'UNPAID', paymentMethod: 'CASH', cleanerId: 'worker',
    cleanerName: 'متخصص', createdAt: '2026-10-23T00:00:00Z', completedAt: '2026-10-24T12:00:00Z' });
  const snapshot = () => JSON.stringify({ users: db.prepare('SELECT * FROM users ORDER BY id').all(), orders: db.prepare('SELECT * FROM orders ORDER BY id').all() });
  const before = snapshot();
  const login = await request(server, '/api/admin/login', null, 'POST', { password: process.env.PAKSHO_ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  const admin = login.body.token;

  await t.test('pending worker can see default before registration; customer/blocked/expired cannot', async () => {
    const result = await request(server, workerPath, worker);
    assert.equal(result.status, 200);
    assert.equal(result.body.policy.ratePercent, 25);
    assert.equal(result.headers['cache-control'], 'no-store');
    for (const [token, status] of [[customer, 403], [blocked, 403], [expired, 401], ['fake', 401], [null, 401]]) {
      assert.equal((await request(server, workerPath, token)).status, status);
    }
    assert.equal((await request(server, workerPath + '?userId=other', worker)).status, 400);
  });
  await t.test('only actual admin session may read or publish settings', async () => {
    for (const token of [worker, customer, 'fake', null]) {
      assert.equal((await request(server, adminPath, token)).status, 401);
      assert.equal((await request(server, adminPath, token, 'PUT', { ratePercent: 10, expectedVersion: 0 })).status, 401);
    }
    assert.equal((await request(server, adminPath, admin)).body.policy.ratePercent, 25);
  });
  await t.test('admin changes are visible to worker; stale concurrent update is rejected', async () => {
    const changed = await request(server, adminPath, admin, 'PUT', { ratePercent: 18.5, expectedVersion: 0 });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.policy.version, 1);
    assert.equal((await request(server, workerPath, worker)).body.policy.ratePercent, 18.5);
    assert.equal((await request(server, adminPath, admin, 'PUT', { ratePercent: 20, expectedVersion: 0 })).status, 409);
  });
  await t.test('extra fields/invalid rate/query cannot change policy', async () => {
    for (const body of [{ ratePercent: '25', expectedVersion: 1 }, { ratePercent: 101, expectedVersion: 1 },
      { ratePercent: 25, expectedVersion: 1, companyId: 'other' }, { ratePercent: 25, expectedVersion: 1, actor: 'other' }]) {
      assert.equal((await request(server, adminPath, admin, 'PUT', body)).status, 400);
    }
    assert.equal((await request(server, adminPath + '?companyId=other', admin, 'PUT', { ratePercent: 10, expectedVersion: 1 })).status, 400);
    assert.equal((await request(server, adminPath, admin)).body.policy.ratePercent, 18.5);
  });
  await t.test('real SQLite failure leaves previous value and gives a generic error', async () => {
    db.exec("CREATE TRIGGER fail_commission BEFORE INSERT ON commission_policy_versions BEGIN SELECT RAISE(ABORT, 'private database detail'); END");
    const result = await request(server, adminPath, admin, 'PUT', { ratePercent: 10, expectedVersion: 1 });
    assert.equal(result.status, 500);
    assert.equal(JSON.stringify(result.body).includes('private database detail'), false);
    assert.equal((await request(server, workerPath, worker)).body.policy.ratePercent, 18.5);
    db.exec('DROP TRIGGER fail_commission');
  });
  assert.equal(snapshot(), before);
});
