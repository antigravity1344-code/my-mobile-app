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
const envPaths = new Set(['.env', '.env.local'].flatMap(name => [path.join(__dirname, name), path.join(__dirname, '..', name)]));
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
  assert.equal(read.body.settings.topupEnabled, false);
  assert.deepEqual(read.body.settings.availableProviders, []);
  assert.equal(Object.hasOwn(read.body.settings, 'connectionSecret'), false);
  assert.equal(JSON.stringify(read.body).includes('enc:v1:'), false);
  assert.equal(read.headers['cache-control'], 'no-store');
  for (const token of [worker, customer, 'fake', null]) {
    assert.equal((await request(server, pathName, token)).status, 401);
  }
  assert.equal((await request(server, pathName, admin, 'PUT', {
    expectedVersion: 0, providerId: 'zarinpal', merchantId: 'x', settlementLabel: 'test', settlementReference: 'IR1', connectionSecret: 'nope',
  })).status, 400);
  const saved = await request(server, pathName, admin, 'PUT', {
    expectedVersion: 0, providerId: null, merchantId: '', settlementLabel: 'fixture account', settlementReference: 'IR990000000000000000000001', connectionSecret: 'fixture-route-secret',
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.settings.settlementAccount.reference, 'IR990000000000000000000001');
  assert.equal(saved.body.settings.settlementAccount.verified, false);
  assert.equal(saved.body.settings.topupEnabled, false);
  assert.equal(JSON.stringify(saved.body).includes('fixture-route-secret'), false);
  assert.equal(JSON.stringify(saved.body).includes('enc:v1:'), false);
  assert.equal((await request(server, pathName, admin, 'PUT', {
    expectedVersion: 0, providerId: null, merchantId: '', settlementLabel: 'test', settlementReference: 'IR1',
  })).status, 409);
  const extra = await request(server, pathName, admin, 'PUT', {
    expectedVersion: 1, providerId: null, merchantId: '', settlementLabel: 'test', settlementReference: 'IR1', companyId: 'other',
  });
  assert.equal(extra.status, 400);
  const wallet = await request(server, '/api/workers/me/wallet', worker);
  assert.equal(wallet.body.wallet.topUpAvailable, false);
  const topup = await request(server, '/api/workers/me/wallet/topup', worker, 'POST', { amount: 1000, currencyUnit: 'تومان' });
  assert.equal(topup.status, 501);
  assert.equal(topup.body.code, 'PAYMENT_NOT_CONFIGURED');
  assert.deepEqual(store.workerWallet.read('pay-worker').balances, []);
  const row = db.prepare('SELECT * FROM company_payment_settings ORDER BY version DESC LIMIT 1').get();
  assert.match(row.secretCiphertext, /^enc:v1:/);
  assert.equal(row.secretCiphertext.includes('fixture-route-secret'), false);
});

test('real worker routes use the session owner, verify server-side, and never credit twice', async t => {
  const { createPaymentSettings } = require('./paymentSettings');
  const { createPaymentCharges } = require('./paymentCharges');
  const { createWorkerWallet } = require('./workerWallet');
  const { createCommissionPolicy } = require('./commissionPolicy');
  const paymentDb = new DatabaseSync(':memory:');
  let depth = 0;
  const transaction = fn => {
    if (depth) return fn();
    paymentDb.exec('BEGIN IMMEDIATE'); depth++;
    try { const result = fn(); paymentDb.exec('COMMIT'); return result; }
    catch (error) { paymentDb.exec('ROLLBACK'); throw error; }
    finally { depth--; }
  };
  const wallet = createWorkerWallet({ database: paymentDb, transaction,
    commissionPolicy: createCommissionPolicy({ database: paymentDb, transaction }) });
  const payments = new Map();
  const provider = {
    id: 'http-fixture',
    async startPayment(payment) {
      payments.set(payment.id, { ...payment, paid: false });
      return { providerReference: 'ref-' + payment.id, redirectUrl: 'https://fixture.invalid/pay/' + payment.id };
    },
    async verifyPayment(notice) {
      const payment = payments.get(notice.paymentId);
      if (!payment?.paid || notice.providerReference !== 'ref-' + payment.id) return { ok: false };
      return { ok: true, workerId: payment.workerId, amount: payment.amount, currencyUnit: payment.currencyUnit,
        idempotencyKey: payment.id, providerReference: 'ref-' + payment.id };
    },
  };
  const settings = createPaymentSettings({ database: paymentDb, transaction,
    providers: [provider], wallet, getUser: store.getUser });
  const published = settings.publish({ expectedVersion: settings.read().version, providerId: provider.id,
    merchantId: 'fixture-merchant', settlementLabel: 'test', settlementReference: 'TEST-ACCOUNT',
    connectionSecret: 'fixture-http-secret', isDefault: true });
  assert.equal(published.code, 'ok');
  assert.equal(settings.markSettlementVerified(published.settings.version).code, 'ok');
  const original = store.paymentCharges;
  const originalWallet = store.workerWallet;
  store.workerWallet = wallet;
  store.paymentCharges = createPaymentCharges({ database: paymentDb, paymentSettings: settings,
    workerWallet: wallet, providers: [provider] });
  t.after(() => { store.paymentCharges = original; store.workerWallet = originalWallet; paymentDb.close(); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const worker = fixture('http-worker', 'WORKER', 'APPROVED');
  const other = fixture('http-other', 'WORKER', 'APPROVED');
  const customer = fixture('http-customer', 'CUSTOMER', 'ACTIVE');
  const expired = fixture('http-expired', 'WORKER', 'APPROVED', Date.now() - 1000);
  const blocked = fixture('http-blocked', 'WORKER', 'BLOCKED');
  const startPath = '/api/workers/me/wallet/topup', confirmPath = startPath + '/confirm';
  const body = { amount: 500, currencyUnit: 'تومان' };
  for (const endpoint of [startPath, confirmPath]) {
    for (const token of [null, 'forged', expired]) assert.equal((await request(server, endpoint, token, 'POST', body)).status, 401);
    for (const token of [customer, blocked]) assert.equal((await request(server, endpoint, token, 'POST', body)).status, 403);
  }
  assert.equal((await request(server, startPath, worker, 'POST', { ...body, workerId: 'http-other' })).status, 400);
  assert.equal((await request(server, startPath + '?workerId=http-other', worker, 'POST', body)).status, 400);
  assert.equal((await request(server, '/api/workers/me/wallet', worker)).body.wallet.topUpAvailable, true);
  const started = await request(server, startPath, worker, 'POST', body);
  assert.equal(started.status, 200);
  assert.equal(JSON.stringify(started.body).includes('fixture-http-secret'), false);
  const confirmation = { intentId: started.body.intent.id };
  assert.equal((await request(server, confirmPath, other, 'POST', confirmation)).status, 404);
  assert.equal((await request(server, confirmPath, worker, 'POST', { ...confirmation, verified: true })).status, 400);
  assert.equal((await request(server, confirmPath, worker, 'POST', confirmation)).status, 409);
  payments.get(confirmation.intentId).paid = true;
  for (let n = 0; n < 2; n++) {
    const response = await request(server, confirmPath, worker, 'POST', confirmation);
    assert.equal(response.status, 200);
    assert.equal(response.body.intent.status, 'CREDITED');
    assert.equal(response.body.wallet.balances[0].balance, 500);
  }
  assert.equal(store.workerWallet.read('http-worker').transactions.length, 1);
  assert.deepEqual(store.workerWallet.read('http-other').balances, []);
  const retry = await request(server, startPath, worker, 'POST', body);
  payments.get(retry.body.intent.id).paid = true;
  paymentDb.exec("CREATE TRIGGER http_fail_receipt BEFORE INSERT ON worker_topup_receipts BEGIN SELECT RAISE(ABORT,'fixture write failure'); END");
  const failed = await request(server, confirmPath, worker, 'POST', { intentId: retry.body.intent.id });
  assert.equal(failed.status, 500);
  assert.equal(failed.body.success, false);
  assert.equal(store.workerWallet.read('http-worker').balances[0].balance, 500);
  assert.equal(store.workerWallet.read('http-worker').transactions.length, 1);
});
