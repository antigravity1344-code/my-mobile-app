'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-payment-api-'));
process.env.NODE_ENV = 'test';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 43).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'payment-test-admin';
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
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); } catch (error) { reject(error); } });
    });
    req.on('error', reject); req.end(payload);
  });
}
let phoneSequence = 20;
function fixture(id, role, status, expires = Date.now() + 600000) {
  store.createUser({ id, role, status, phone: `091200000${phoneSequence++}`, name: id, isProfileComplete: false, createdAt: '2026-10-25T00:00:00Z' });
  const token = `payment-test-${id}`;
  store.createSession(token, { userId: id, role, expires });
  return token;
}

test('admin payment settings stay company-local, hide secrets, and leave topup disabled without an implemented gateway', async t => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const worker = fixture('pay-worker', 'WORKER', 'APPROVED');
  const customer = fixture('pay-customer', 'CUSTOMER', 'ACTIVE');
  const login = await request(server, '/api/admin/login', null, 'POST', { password: process.env.PAKSHO_ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  const admin = login.body.token;
  const pathName = '/api/admin/payment-settings';

  const read = await request(server, pathName, admin);
  assert.equal(read.status, 200);
  assert.equal(read.body.settings.chargeEnabled, false);
  assert.deepEqual(read.body.providers, []);
  assert.equal(Object.hasOwn(read.body.settings, 'secret'), false);
  assert.equal(JSON.stringify(read.body).includes('enc:v1:'), false);
  assert.equal(read.headers['cache-control'], 'no-store');
  for (const token of [worker, customer, 'fake', null]) {
    assert.equal((await request(server, pathName, token)).status, 401);
  }
  assert.equal((await request(server, pathName, admin, 'PUT', {
    expectedVersion: 0, providerId: 'zarinpal', merchantId: 'x', settlementAccount: 'IR1', settlementConfirmed: true, secret: 'nope',
  })).status, 400);
  const saved = await request(server, pathName, admin, 'PUT', {
    expectedVersion: 0, providerId: '', merchantId: '', settlementAccount: 'IR990000000000000000000001', settlementConfirmed: true,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.settings.settlementAccount, 'IR990000000000000000000001');
  assert.equal(saved.body.settings.chargeEnabled, false);
  assert.equal(JSON.stringify(saved.body).includes('enc:v1:'), false);
  assert.equal((await request(server, pathName, admin, 'PUT', {
    expectedVersion: 0, providerId: '', merchantId: '', settlementAccount: 'IR1', settlementConfirmed: false,
  })).status, 409);
  const extra = await request(server, pathName, admin, 'PUT', {
    expectedVersion: 1, providerId: '', merchantId: '', settlementAccount: 'IR1', settlementConfirmed: false, companyId: 'other',
  });
  assert.equal(extra.status, 400);
  const wallet = await request(server, '/api/workers/me/wallet', worker);
  assert.equal(wallet.body.wallet.topUpAvailable, false);
  const topup = await request(server, '/api/workers/me/wallet/topup', worker, 'POST', { amount: 1000, currencyUnit: 'تومان' });
  assert.equal(topup.status, 501);
  assert.equal(topup.body.code, 'PAYMENT_NOT_CONFIGURED');
  assert.deepEqual(store.workerWallet.read('pay-worker').balances, []);
  const row = db.prepare('SELECT * FROM company_payment_settings ORDER BY version DESC LIMIT 1').get();
  assert.equal(String(row.settlementCipher).includes('IR990000000000000000000001'), false);
});
