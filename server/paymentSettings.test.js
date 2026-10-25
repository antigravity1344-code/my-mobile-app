'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const fieldCrypto = require('./fieldCrypto');
const { createCommissionPolicy } = require('./commissionPolicy');
const { createWorkerWallet } = require('./workerWallet');
const { createPaymentSettings } = require('./paymentSettings');
const { IMPLEMENTED_PAYMENT_PROVIDERS } = require('./paymentProviders');

const SECRET = 'fixture-connection-secret-d80-alpha';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-payment-settings-'));
process.env.NODE_ENV = 'test';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 29).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'payment-settings-test-admin';
process.env.PAKSHO_SMS_MODE = 'fake';
const exists = fs.existsSync;
const envPaths = new Set([
  path.join(__dirname, '.env'), path.join(__dirname, '..', '.env'),
  path.join(__dirname, '.env.local'), path.join(__dirname, '..', '.env.local'),
]);
let app;
let store;
try {
  fs.existsSync = (file) => envPaths.has(String(file)) ? false : exists(file);
  ({ app, store } = require('./index'));
} finally {
  fs.existsSync = exists;
}
const db = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
after(() => {
  db.close();
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function memory(users = new Map()) {
  const database = new DatabaseSync(':memory:');
  let depth = 0;
  const transaction = (fn) => {
    if (depth > 0) return fn();
    database.exec('BEGIN IMMEDIATE');
    depth += 1;
    try {
      const result = fn();
      depth -= 1;
      database.exec('COMMIT');
      return result;
    } catch (error) {
      depth = 0;
      try { database.exec('ROLLBACK'); } catch { /* The original error is the one that matters. */ }
      throw error;
    }
  };
  const commissionPolicy = createCommissionPolicy({ database, transaction });
  const wallet = createWorkerWallet({ database, transaction, commissionPolicy });
  const provider = {
    id: 'fixture-gateway',
    verifyPayment(notice) {
      if (!notice || notice.proof !== 'provider-server') return { ok: false };
      if (notice.explode) throw new Error('provider transport failed');
      return {
        ok: true,
        workerId: notice.workerId,
        amount: notice.serverAmount,
        currencyUnit: 'تومان',
        idempotencyKey: notice.eventId,
        providerReference: `ref-${notice.eventId}`,
      };
    },
  };
  const settings = createPaymentSettings({ database, transaction, providers: [provider], wallet, getUser: (id) => users.get(id) || null });
  return { database, wallet, settings, provider };
}

function savedBody(expectedVersion, extra = {}) {
  return {
    expectedVersion,
    providerId: 'fixture-gateway',
    merchantId: 'merchant-d80',
    settlementLabel: 'حساب اعلام‌شده',
    settlementReference: 'ACCT-DECLARED-1',
    connectionSecret: SECRET,
    ...extra,
  };
}

test('versioned settings keep secrets encrypted, reject an unbuilt gateway, and do not rewrite history', () => {
  const users = new Map([['worker-1', { id: 'worker-1', role: 'WORKER' }]]);
  const { database, wallet, settings } = memory(users);
  try {
    assert.equal(settings.publish({ expectedVersion: 0, providerId: 'zarinpal', merchantId: null, settlementLabel: null, settlementReference: null }).code, 'provider_unavailable');
    assert.equal(settings.read().version, 0);
    assert.equal(settings.publish({ ...savedBody(0), companyId: 'other', verified: true }).code, 'invalid');
    const saved = settings.publish(savedBody(0));
    assert.equal(saved.code, 'ok');
    assert.equal(saved.settings.version, 1);
    assert.equal(saved.settings.settlementAccount.verified, false);
    assert.equal(saved.settings.topupEnabled, false);
    assert.equal(JSON.stringify(saved.settings).includes(SECRET), false);
    const stored = database.prepare('SELECT secretCiphertext FROM company_payment_settings WHERE version = 1').get();
    assert.equal(fieldCrypto.isEncrypted(stored.secretCiphertext), true);
    assert.equal(stored.secretCiphertext.includes(SECRET), false);
    assert.equal(settings.readConnectionSecret(1), SECRET);
    const second = settings.publish({
      expectedVersion: 1,
      providerId: 'fixture-gateway',
      merchantId: 'merchant-d80',
      settlementLabel: 'عنوان تازه',
      settlementReference: 'ACCT-DECLARED-1',
    });
    assert.equal(second.code, 'ok');
    assert.equal(second.settings.hasConnectionSecret, true);
    const rows = database.prepare('SELECT version, merchantId, settlementLabel, secretCiphertext FROM company_payment_settings ORDER BY version').all();
    assert.equal(rows[0].settlementLabel, 'حساب اعلام‌شده');
    assert.equal(rows[1].secretCiphertext, rows[0].secretCiphertext);
    assert.equal(settings.readConnectionSecret(2), SECRET);
    assert.equal(settings.publish(savedBody(0)).code, 'conflict');
    assert.throws(() => database.exec('UPDATE company_payment_settings SET merchantId = merchantId'));
    assert.throws(() => database.exec('DELETE FROM company_payment_settings'));
    assert.equal(settings.markSettlementVerified(2).code, 'ok');
    assert.equal(settings.read().topupEnabled, true);
    assert.equal(settings.read().settlementAccount.verified, true);
    const changed = settings.publish({
      expectedVersion: 2,
      providerId: 'fixture-gateway',
      merchantId: 'merchant-d80',
      settlementLabel: 'عنوان تازه',
      settlementReference: 'ACCT-DECLARED-2',
    });
    assert.equal(changed.settings.settlementAccount.verified, false);
    assert.equal(changed.settings.topupEnabled, false);
    assert.equal(database.prepare('SELECT settlementReference FROM company_payment_settings WHERE version = 2').get().settlementReference, 'ACCT-DECLARED-1');
    assert.equal(wallet.read('worker-1').balances.length, 0);
  } finally {
    database.close();
  }
});

test('one global default is stored; requesters without their own settings fall back to it', () => {
  const users = new Map([['worker-1', { id: 'worker-1', role: 'WORKER' }]]);
  const { database, settings } = memory(users);
  try {
    assert.equal(settings.resolve('worker-1').code, 'not_configured');
    assert.equal(settings.resolve().code, 'not_configured');
    const unpublished = settings.publish({ ...savedBody(0), isDefault: false });
    assert.equal(unpublished.code, 'ok');
    assert.equal(unpublished.settings.isDefault, false);
    assert.equal(unpublished.settings.defaultVersion, null);
    assert.equal(settings.resolve('worker-1').code, 'not_configured');
    const promoted = settings.publish({ expectedVersion: 1, defaultVersion: 1 });
    assert.equal(promoted.code, 'ok');
    assert.equal(promoted.settings.isDefault, true);
    assert.equal(promoted.settings.defaultVersion, 1);
    const fallback = settings.resolve('worker-1');
    assert.equal(fallback.code, 'ok');
    assert.equal(fallback.source, 'default');
    assert.equal(fallback.settings.version, 1);
    assert.equal(fallback.settings.merchantId, 'merchant-d80');
    assert.equal(JSON.stringify(fallback.settings).includes(SECRET), false);
    const second = settings.publish({ ...savedBody(1), settlementLabel: 'نسخه دوم', isDefault: true });
    assert.equal(second.code, 'ok');
    assert.equal(second.settings.version, 2);
    assert.equal(second.settings.isDefault, true);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM company_payment_settings WHERE is_default = 1').get().n, 1);
    assert.equal(database.prepare('SELECT version FROM company_payment_settings WHERE is_default = 1').get().version, 2);
    assert.equal(settings.resolve().settings.version, 2);
    assert.equal(settings.publish({ expectedVersion: 2, defaultVersion: 1 }).settings.defaultVersion, 1);
    assert.equal(settings.read().version, 2);
    assert.equal(settings.read().isDefault, false);
    assert.equal(settings.resolve('missing-requester').settings.version, 1);
    assert.equal(JSON.stringify(settings.read()).includes(SECRET), false);
    assert.throws(() => database.exec("UPDATE company_payment_settings SET is_default = 1 WHERE version = 2"));
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM company_payment_settings WHERE is_default = 1').get().n, 1);
    assert.throws(() => database.exec('UPDATE company_payment_settings SET merchantId = merchantId'));
  } finally {
    database.close();
  }
});

test('server-verified top-ups credit once, ignore browser claims, and stay tied to the settings version', () => {
  const users = new Map([
    ['worker-1', { id: 'worker-1', role: 'WORKER' }],
    ['customer-1', { id: 'customer-1', role: 'CUSTOMER' }],
  ]);
  const { database, wallet, settings } = memory(users);
  try {
    settings.publish(savedBody(0));
    const notice = { proof: 'provider-server', workerId: 'worker-1', eventId: 'evt-1', serverAmount: 500, amount: 1, verified: true };
    assert.equal(settings.confirmVerifiedPayment(notice).code, 'not_configured');
    assert.equal(settings.markSettlementVerified(1).code, 'ok');
    wallet.chargeCompletion(
      { id: 'job-1', cleanerId: 'worker-1', pricing: { currencyUnit: 'تومان' } },
      { id: 'request:job-1', workerId: 'worker-1', finalAmount: 1000, actualHours: 2 }
    );
    assert.equal(wallet.read('worker-1').balances[0].balance, -250);
    assert.equal(settings.confirmVerifiedPayment({ verified: true, amount: 999999, workerId: 'worker-1' }).code, 'unverified');
    assert.equal(settings.confirmVerifiedPayment({ proof: 'provider-server', explode: true, workerId: 'worker-1', eventId: 'evt-x', serverAmount: 500 }).code, 'unverified');
    assert.equal(settings.confirmVerifiedPayment({ ...notice, workerId: 'customer-1' }).code, 'unverified');
    const credited = settings.confirmVerifiedPayment(notice);
    assert.equal(credited.code, 'ok');
    assert.equal(credited.receipt.settingsVersion, 1);
    assert.equal(credited.receipt.amount, 500);
    assert.equal(wallet.read('worker-1').balances[0].balance, 250);
    assert.equal(wallet.read('worker-1').canAcceptNewOrders, true);
    const ledger = database.prepare('SELECT id, amount, sourceKey FROM worker_wallet_entries ORDER BY rowid').all();
    const replay = settings.confirmVerifiedPayment(notice);
    assert.equal(replay.code, 'duplicate');
    assert.equal(replay.receipt.id, credited.receipt.id);
    assert.deepEqual(database.prepare('SELECT id, amount, sourceKey FROM worker_wallet_entries ORDER BY rowid').all(), ledger);
    const conflict = settings.confirmVerifiedPayment({ ...notice, serverAmount: 700 });
    assert.equal(conflict.code, 'conflict');
    assert.equal(wallet.read('worker-1').balances[0].balance, 250);
    settings.publish({
      expectedVersion: 1,
      providerId: 'fixture-gateway',
      merchantId: 'merchant-d80',
      settlementLabel: 'بعد از پرداخت',
      settlementReference: 'ACCT-DECLARED-2',
    });
    assert.equal(settings.read().topupEnabled, false);
    assert.equal(settings.confirmVerifiedPayment(notice).code, 'duplicate');
    assert.equal(database.prepare('SELECT settingsVersion FROM worker_topup_receipts').get().settingsVersion, 1);
    assert.deepEqual(database.prepare('SELECT id, amount, sourceKey FROM worker_wallet_entries ORDER BY rowid').all(), ledger);
    settings.publish({
      expectedVersion: 2,
      providerId: null,
      merchantId: 'merchant-d80',
      settlementLabel: 'بعد از پرداخت',
      settlementReference: 'ACCT-DECLARED-2',
      isDefault: true,
    });
    assert.equal(settings.confirmVerifiedPayment(notice).code, 'not_configured');
    assert.equal(wallet.read('worker-1').balances[0].balance, 250);
    assert.equal(JSON.stringify(settings.read()).includes(SECRET), false);
  } finally {
    database.close();
  }
});

function request(server, pathname, token, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: pathname,
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const json = (res.headers['content-type'] || '').includes('json');
        if (!json) return resolve({ status: res.statusCode, body: {}, text: data, headers: res.headers });
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {}, text: data, headers: res.headers }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

test('admin payment settings are session-protected and cannot activate a browser top-up', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  let phone = 40;
  const fixture = (id, role) => {
    store.createUser({
      id, role, status: 'APPROVED', phone: `091200000${phone++}`, name: id,
      isProfileComplete: false, createdAt: '2026-10-25T00:00:00.000Z',
    });
    const token = `payment-test-${id}`;
    store.createSession(token, { userId: id, role, expires: Date.now() + 600000 });
    return token;
  };
  const worker = fixture('pay-worker', 'WORKER');
  const customer = fixture('pay-customer', 'CUSTOMER');
  const login = await request(server, '/api/admin/login', null, 'POST', { password: process.env.PAKSHO_ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  const admin = login.body.token;
  const adminPath = '/api/admin/payment-settings';
  const noSecret = (payload) => assert.equal(JSON.stringify(payload).includes(SECRET), false);

  await t.test('only an admin session can read or save settings', async () => {
    for (const token of [worker, customer, 'fake', null]) {
      assert.equal((await request(server, adminPath, token)).status, 401);
      assert.equal((await request(server, adminPath, token, 'PUT', savedBody(0, { providerId: null }))).status, 401);
    }
    assert.deepEqual(IMPLEMENTED_PAYMENT_PROVIDERS, []);
    const read = await request(server, adminPath, admin);
    assert.equal(read.status, 200);
    assert.equal(read.headers['cache-control'], 'no-store');
    assert.equal(read.body.settings.version, 0);
    assert.equal(read.body.settings.providerId, null);
    assert.deepEqual(read.body.settings.availableProviders, []);
    assert.equal(read.body.settings.merchantId, null);
    assert.deepEqual(read.body.settings.settlementAccount, { label: null, reference: null, verified: false });
    assert.equal(read.body.settings.hasConnectionSecret, false);
    assert.equal(read.body.settings.connectionReady, false);
    assert.equal(read.body.settings.topupEnabled, false);
    assert.equal(read.body.settings.isDefault, false);
    assert.equal(read.body.settings.defaultVersion, null);
    assert.equal(read.body.resolved, null);
    assert.equal(read.body.resolution, 'not_configured');
    noSecret(read.body);
  });

  await t.test('declared account and encrypted secret do not enable charging or reveal the secret', async () => {
    const beforeWallets = db.prepare('SELECT COUNT(*) AS n FROM worker_wallet_entries').get().n;
    const beforeCustomer = db.prepare('SELECT COUNT(*) AS n FROM wallet_transactions').get().n;
    const saved = await request(server, adminPath, admin, 'PUT', {
      expectedVersion: 0,
      providerId: null,
      merchantId: 'merchant-d80',
      settlementLabel: 'حساب اعلام‌شده',
      settlementReference: 'ACCT-DECLARED-1',
      connectionSecret: SECRET,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.version, 1);
    assert.equal(saved.body.settings.hasConnectionSecret, true);
    assert.equal(saved.body.settings.settlementAccount.verified, false);
    assert.equal(saved.body.settings.topupEnabled, false);
    assert.equal(saved.body.settings.isDefault, true);
    assert.equal(saved.body.settings.defaultVersion, 1);
    noSecret(saved.body);
    const stored = db.prepare('SELECT secretCiphertext FROM company_payment_settings WHERE version = 1').get();
    assert.equal(fieldCrypto.isEncrypted(stored.secretCiphertext), true);
    assert.equal(stored.secretCiphertext.includes(SECRET), false);
    assert.equal(store.paymentSettings.readConnectionSecret(1), SECRET);
    const again = await request(server, adminPath, admin);
    noSecret(again.body);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM worker_wallet_entries').get().n, beforeWallets);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM wallet_transactions').get().n, beforeCustomer);
  });

  await t.test('stale writes, unknown gateways, extra fields and queries do not publish a version', async () => {
    const count = () => db.prepare('SELECT COUNT(*) AS n FROM company_payment_settings').get().n;
    const before = count();
    assert.equal((await request(server, adminPath, admin, 'PUT', {
      expectedVersion: 0, providerId: null, merchantId: null, settlementLabel: null, settlementReference: null,
    })).status, 409);
    const unavailable = await request(server, adminPath, admin, 'PUT', {
      expectedVersion: 1, providerId: 'zarinpal', merchantId: 'merchant-d80', settlementLabel: null, settlementReference: null,
    });
    assert.equal(unavailable.status, 400);
    assert.equal(unavailable.body.code, 'PROVIDER_NOT_IMPLEMENTED');
    noSecret(unavailable.body);
    for (const body of [
      { expectedVersion: 1, providerId: null, merchantId: 'merchant-d80', settlementLabel: null, settlementReference: null, companyId: 'other' },
      { expectedVersion: 1, providerId: null, merchantId: 'merchant-d80', settlementLabel: null, settlementReference: null, verified: true },
      { expectedVersion: 1, providerId: null, merchantId: 'merchant-d80', settlementLabel: null, settlementReference: null, connectionSecret: '' },
      { expectedVersion: 1, providerId: 'Not A Gateway', merchantId: null, settlementLabel: null, settlementReference: null },
    ]) {
      assert.equal((await request(server, adminPath, admin, 'PUT', body)).status, 400);
    }
    assert.equal((await request(server, `${adminPath}?companyId=other`, admin)).status, 400);
    assert.equal(count(), before);
    assert.equal(store.paymentSettings.read().version, 1);
  });

  await t.test('omitted secret is kept and an explicit clear removes it only from the new version', async () => {
    const kept = await request(server, adminPath, admin, 'PUT', {
      expectedVersion: 1, providerId: null, merchantId: 'merchant-d80', settlementLabel: 'عنوان تازه', settlementReference: 'ACCT-DECLARED-1',
    });
    assert.equal(kept.status, 200);
    assert.equal(kept.body.settings.hasConnectionSecret, true);
    const ciphertexts = db.prepare('SELECT version, secretCiphertext FROM company_payment_settings ORDER BY version').all();
    assert.equal(ciphertexts[1].secretCiphertext, ciphertexts[0].secretCiphertext);
    const cleared = await request(server, adminPath, admin, 'PUT', {
      expectedVersion: 2, providerId: null, merchantId: 'merchant-d80', settlementLabel: 'عنوان تازه',
      settlementReference: 'ACCT-DECLARED-1', connectionSecret: null,
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.settings.hasConnectionSecret, false);
    assert.equal(db.prepare('SELECT secretCiphertext FROM company_payment_settings WHERE version = 1').get().secretCiphertext.includes(SECRET), false);
    assert.equal(store.paymentSettings.readConnectionSecret(1), SECRET);
    assert.equal(store.paymentSettings.readConnectionSecret(3), null);
    noSecret(cleared.body);
  });

  await t.test('GET falls back to the global default and never returns the connection secret', async () => {
    const latest = await request(server, adminPath, admin);
    assert.equal(latest.status, 200);
    assert.equal(latest.body.settings.version, 3);
    assert.equal(latest.body.settings.isDefault, false);
    assert.equal(latest.body.resolution, 'ok');
    assert.equal(latest.body.resolved.version, 1);
    assert.equal(latest.body.resolved.isDefault, true);
    noSecret(latest.body);
    const moved = await request(server, adminPath, admin, 'PUT', { expectedVersion: 3, defaultVersion: 3 });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.settings.version, 3);
    assert.equal(moved.body.settings.isDefault, true);
    assert.equal(moved.body.settings.defaultVersion, 3);
    const restored = await request(server, adminPath, admin, 'PUT', { expectedVersion: 3, defaultVersion: 1 });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.settings.defaultVersion, 1);
    assert.equal(restored.body.settings.isDefault, false);
    const after = await request(server, adminPath, admin);
    assert.equal(after.body.resolved.version, 1);
    noSecret(after.body);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM company_payment_settings WHERE is_default = 1').get().n, 1);
  });

  await t.test('worker and customer browser top-up requests still change nothing', async () => {
    const workerBefore = store.workerWallet.read('pay-worker');
    const customerBefore = db.prepare('SELECT COUNT(*) AS n FROM wallet_transactions').get().n;
    const topup = await request(server, '/api/workers/me/wallet/topup', worker, 'POST', {
      amount: 500000, verified: true, connectionSecret: SECRET, proof: 'provider-server',
    });
    assert.equal(topup.status, 501);
    assert.equal(topup.body.code, 'PAYMENT_NOT_CONFIGURED');
    noSecret(topup.body);
    assert.deepEqual(store.workerWallet.read('pay-worker'), workerBefore);
    const customerTopup = await request(server, '/api/wallet/topup', customer, 'POST', { amount: 500000, verified: true });
    assert.equal(customerTopup.status, 501);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM wallet_transactions').get().n, customerBefore);
    assert.equal(store.paymentSettings.confirmVerifiedPayment({ verified: true, amount: 500000 }).code, 'not_configured');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM worker_topup_receipts').get().n, 0);
  });

  await t.test('admin page offers the payment tab without a built-in gateway or account', async () => {
    const page = await request(server, '/admin');
    const script = await request(server, '/admin/payment.js');
    assert.equal(page.status, 200);
    assert.equal(script.status, 200);
    assert.equal(page.text.includes('id="tabPayment"'), true);
    assert.equal(page.text.includes('مقصد تسویه بانکی را عوض نمی‌کند'), true);
    assert.equal(page.text.includes('id="paymentIsDefault"'), true);
    assert.equal(script.text.includes('loadAdminPayment'), true);
    assert.equal(/IR\d{24}/.test(page.text + script.text), false);
    assert.equal((page.text + script.text).includes(SECRET), false);
  });

  await t.test('a database failure returns a generic error and keeps the previous version', async () => {
    db.exec("CREATE TRIGGER fail_payment BEFORE INSERT ON company_payment_settings BEGIN SELECT RAISE(ABORT, 'private database detail'); END");
    try {
      const result = await request(server, adminPath, admin, 'PUT', {
        expectedVersion: 3, providerId: null, merchantId: 'other-merchant', settlementLabel: null, settlementReference: null,
      });
      assert.equal(result.status, 500);
      assert.equal(result.text.includes('private database detail'), false);
      noSecret(result.body);
      assert.equal(store.paymentSettings.read().version, 3);
      assert.equal(store.paymentSettings.read().merchantId, 'merchant-d80');
    } finally {
      db.exec('DROP TRIGGER fail_payment');
    }
  });
});
