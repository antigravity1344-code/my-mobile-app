'use strict';
process.env.NODE_ENV = 'test';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString('base64');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createCommissionPolicy } = require('./commissionPolicy');
const { createWorkerWallet } = require('./workerWallet');
const { createPaymentSettings } = require('./paymentSettings');
const { createPaymentCharges } = require('./paymentCharges');

function gateway(id = 'testpay') {
  const payments = new Map();
  return {
    id, payments, starts: 0, verifications: 0, rejectStart: false, rejectVerify: false,
    async startPayment(payment, context) {
      this.starts++;
      if (this.rejectStart) throw new Error('fixture provider unavailable');
      payments.set(payment.id, { ...payment, context: { ...context }, paid: false });
      return { providerReference: 'ref-' + payment.id, redirectUrl: 'https://gateway.invalid/pay/' + payment.id };
    },
    async verifyPayment(notice, context) {
      this.verifications++;
      if (this.rejectVerify) throw new Error('fixture verification unavailable');
      const row = payments.get(notice.paymentId);
      if (!row || !row.paid || notice.providerReference !== 'ref-' + row.id) return { ok: false };
      assert.deepEqual(context, row.context, 'must use the settings captured at start');
      return { ok: true, workerId: row.workerId, amount: row.amount, currencyUnit: row.currencyUnit,
        idempotencyKey: row.id, providerReference: 'ref-' + row.id };
    },
  };
}
function memory(t, providers = [gateway()]) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  let depth = 0;
  const transaction = fn => {
    if (depth) return fn();
    database.exec('BEGIN IMMEDIATE'); depth++;
    try { const result = fn(); database.exec('COMMIT'); return result; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
    finally { depth--; }
  };
  const commissionPolicy = createCommissionPolicy({ database, transaction });
  const wallet = createWorkerWallet({ database, transaction, commissionPolicy });
  const users = new Map([['worker', { id: 'worker', role: 'WORKER' }], ['other', { id: 'other', role: 'WORKER' }]]);
  const settings = createPaymentSettings({ database, transaction, providers, wallet, getUser: id => users.get(id) });
  const service = () => createPaymentCharges({ database, paymentSettings: settings, workerWallet: wallet, providers });
  function configure(provider = providers[0], extra = {}) {
    const result = settings.publish({ expectedVersion: settings.read().version, providerId: provider.id,
      merchantId: 'MID-1', settlementLabel: 'fixture account', settlementReference: 'ACCOUNT-1',
      connectionSecret: 'fixture-secret', isDefault: true, ...extra });
    assert.equal(result.code, 'ok');
    assert.equal(settings.markSettlementVerified(result.settings.version).code, 'ok');
  }
  return { database, wallet, settings, charges: service(), service, configure, providers };
}
const input = { amount: 500, currencyUnit: 'تومان' };

test('unconfigured start does not credit; verified confirm credits once even if repeated', async t => {
  const { database, wallet, charges, configure, providers: [provider] } = memory(t);
  assert.equal((await charges.startTopup('worker', input)).code, 'not_configured');
  configure();
  const started = await charges.startTopup('worker', input);
  assert.equal(started.code, 'ok');
  assert.equal(started.intent.status, 'PENDING');
  assert.match(started.redirectUrl, /^https:/);
  assert.equal(JSON.stringify(started).includes('fixture-secret'), false);
  assert.deepEqual(wallet.read('worker').balances, []);
  const confirm = { intentId: started.intent.id };
  assert.equal((await charges.confirmTopup('worker', confirm)).code, 'unverified');
  provider.payments.get(started.intent.id).paid = true;
  assert.equal((await charges.confirmTopup('worker', confirm)).intent.status, 'CREDITED');
  assert.equal((await charges.confirmTopup('worker', confirm)).code, 'ok');
  assert.equal(wallet.read('worker').balances[0].balance, 500);
  assert.equal(wallet.read('worker').transactions.filter(row => row.type === 'TOPUP').length, 1);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM worker_topup_receipts').get().n, 1);
});

test('later provider/default and credential changes keep the original payment snapshot', async t => {
  const a = gateway('gateway-a'), b = gateway('gateway-b');
  const { charges, configure, wallet } = memory(t, [a, b]);
  configure(a);
  const first = await charges.startTopup('worker', input);
  configure(b, { merchantId: 'MID-B', connectionSecret: 'secret-b' });
  a.payments.get(first.intent.id).paid = true;
  assert.equal((await charges.confirmTopup('worker', { intentId: first.intent.id })).code, 'ok');
  assert.equal(b.verifications, 0);
  const second = await charges.startTopup('worker', input);
  configure(b, { merchantId: 'MID-NEW', connectionSecret: 'secret-new' });
  b.payments.get(second.intent.id).paid = true;
  assert.equal((await charges.confirmTopup('worker', { intentId: second.intent.id })).code, 'ok');
  assert.equal(wallet.read('worker').balances[0].balance, 1000);
});

test('strict bodies, ownership, and provider proof reject forged browser values', async t => {
  const { charges, configure, wallet, providers: [provider] } = memory(t);
  configure();
  for (const body of [{ ...input, workerId: 'other' }, { ...input, verified: true },
    { ...input, amount: -1 }, { ...input, amount: 1.5 }, { ...input, currencyUnit: '' }, null]) {
    assert.equal((await charges.startTopup('worker', body)).code, 'invalid');
  }
  const start = await charges.startTopup('worker', input);
  const id = start.intent.id;
  assert.equal((await charges.confirmTopup('other', { intentId: id })).code, 'not_found');
  for (const field of ['amount', 'workerId', 'providerReference', 'verified', 'settingsVersion']) {
    assert.equal((await charges.confirmTopup('worker', { intentId: id, [field]: 'forged' })).code, 'invalid');
  }
  const proof = provider.payments.get(id);
  proof.paid = true;
  proof.amount++;
  assert.equal((await charges.confirmTopup('worker', { intentId: id })).code, 'conflict');
  assert.deepEqual(wallet.read('worker').balances, []);
});

test('concurrent async confirmations credit once and survive service recreation', async t => {
  const { service, charges, configure, wallet, providers: [provider] } = memory(t);
  configure();
  const { intent } = await charges.startTopup('worker', input);
  provider.payments.get(intent.id).paid = true;
  const results = await Promise.all([
    charges.confirmTopup('worker', { intentId: intent.id }),
    service().confirmTopup('worker', { intentId: intent.id }),
  ]);
  assert.equal(results.every(result => result.code === 'ok'), true);
  assert.equal(wallet.read('worker').transactions.length, 1);
});

test('receipt insertion failure rolls back the wallet and a retry remains safe', async t => {
  const { database, charges, configure, wallet, providers: [provider] } = memory(t);
  configure();
  const { intent } = await charges.startTopup('worker', input);
  provider.payments.get(intent.id).paid = true;
  database.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON worker_topup_receipts BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(charges.confirmTopup('worker', { intentId: intent.id }), /fixture failure/);
  assert.deepEqual(wallet.read('worker').balances, []);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM worker_topup_receipts').get().n, 0);
  database.exec('DROP TRIGGER fail_receipt');
  assert.equal((await charges.confirmTopup('worker', { intentId: intent.id })).code, 'ok');
  assert.equal(wallet.read('worker').balances[0].balance, 500);
});

test('a refused wallet credit never produces a receipt or successful confirmation', async t => {
  const { database, charges, configure, wallet, providers: [provider] } = memory(t);
  configure();
  const { intent } = await charges.startTopup('worker', input);
  provider.payments.get(intent.id).paid = true;
  wallet.creditVerifiedTopup = () => ({ code: 'conflict' });
  assert.equal((await charges.confirmTopup('worker', { intentId: intent.id })).code, 'conflict');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM worker_topup_receipts').get().n, 0);
  assert.deepEqual(wallet.read('worker').balances, []);
});

test('provider failures and orphaned legacy dispatch rows never credit', async t => {
  const { database, charges, configure, wallet, providers: [provider] } = memory(t);
  configure();
  provider.rejectStart = true;
  assert.equal((await charges.startTopup('worker', input)).code, 'provider_error');
  assert.deepEqual(wallet.read('worker').balances, []);
  provider.rejectStart = false;
  const { intent } = await charges.startTopup('worker', input);
  provider.rejectVerify = true;
  assert.equal((await charges.confirmTopup('worker', { intentId: intent.id })).code, 'unverified');
  database.prepare("INSERT INTO worker_wallet_topup_intents VALUES ('legacy','worker',500,'toman','testpay',1,'old-ref','PENDING','old',NULL)").run();
  assert.equal((await charges.confirmTopup('worker', { intentId: 'legacy' })).code, 'not_found');
  assert.deepEqual(wallet.read('worker').balances, []);
});

test('verified topup clears commission debt without changing work income', async t => {
  const { wallet, charges, configure, providers: [provider] } = memory(t);
  configure();
  wallet.chargeCompletion({ id: 'completed-job', cleanerId: 'worker', pricing: { currencyUnit: 'تومان' } },
    { id: 'completion-job', workerId: 'worker', finalAmount: 2000, actualHours: 2 });
  const income = wallet.readWeeklyIncome('worker');
  assert.equal(wallet.read('worker').balances[0].balance, -500);
  assert.equal(wallet.read('worker').canAcceptNewOrders, false);
  const { intent } = await charges.startTopup('worker', input);
  provider.payments.get(intent.id).paid = true;
  assert.equal((await charges.confirmTopup('worker', { intentId: intent.id })).code, 'ok');
  assert.equal(wallet.read('worker').balances[0].balance, 0);
  assert.equal(wallet.read('worker').canAcceptNewOrders, true);
  assert.deepEqual(wallet.readWeeklyIncome('worker'), income);
});
