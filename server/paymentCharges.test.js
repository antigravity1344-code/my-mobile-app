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

function testProvider() {
  const paid = new Map();
  return {
    id: 'testpay',
    label: 'آزمایش',
    async start({ amount, currencyUnit, merchantId, secret }) {
      if (merchantId !== 'MID-1' || secret !== 'gateway-secret') throw new Error('bad credentials');
      const providerRef = 'ref-' + cryptoRandom();
      paid.set(providerRef, { amount, currencyUnit, paid: false });
      return { providerRef };
    },
    markPaid(providerRef) { paid.get(providerRef).paid = true; },
    async verify({ providerRef, amount, currencyUnit, merchantId, secret }) {
      const row = paid.get(providerRef);
      if (!row || !row.paid || merchantId !== 'MID-1' || secret !== 'gateway-secret') return { ok: false };
      return { ok: true, amount: row.amount, currencyUnit: row.currencyUnit };
    },
  };
}
function cryptoRandom() { return Math.random().toString(16).slice(2); }
function memory(provider) {
  const database = new DatabaseSync(':memory:');
  let depth = 0;
  const transaction = fn => {
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
      try { database.exec('ROLLBACK'); } catch {}
      throw error;
    }
  };
  const providers = provider ? [provider] : [];
  const commissionPolicy = createCommissionPolicy({ database, transaction });
  const workerWallet = createWorkerWallet({ database, transaction, commissionPolicy });
  const paymentSettings = createPaymentSettings({ database, transaction, providers });
  const paymentCharges = createPaymentCharges({ database, transaction, paymentSettings, workerWallet, providers });
  return { database, workerWallet, paymentSettings, paymentCharges, provider };
}

test('unconfigured start does not credit; verified confirm credits once even if repeated', async t => {
  const provider = testProvider();
  const { database, workerWallet, paymentSettings, paymentCharges } = memory(provider);
  t.after(() => database.close());
  assert.equal((await paymentCharges.startTopup('worker', { amount: 500, currencyUnit: 'تومان' })).code, 'not_configured');
  assert.deepEqual(workerWallet.read('worker').balances, []);
  assert.equal(paymentSettings.publish({
    expectedVersion: 0, providerId: 'testpay', merchantId: 'MID-1', settlementAccount: 'IR1',
    settlementConfirmed: true, secret: 'gateway-secret',
  }).code, 'ok');
  const started = await paymentCharges.startTopup('worker', { amount: 500, currencyUnit: 'تومان' });
  assert.equal(started.code, 'ok');
  assert.deepEqual(workerWallet.read('worker').balances, []);
  const early = await paymentCharges.confirmTopup('worker', { intentId: started.intent.id });
  assert.equal(early.code, 'unverified');
  assert.deepEqual(workerWallet.read('worker').balances, []);
  provider.markPaid(started.intent.providerRef);
  const first = await paymentCharges.confirmTopup('worker', { intentId: started.intent.id });
  const second = await paymentCharges.confirmTopup('worker', { intentId: started.intent.id });
  assert.equal(first.code, 'ok');
  assert.equal(second.code, 'ok');
  assert.equal(workerWallet.read('worker').balances[0].balance, 500);
  assert.equal(workerWallet.read('worker').transactions.filter(row => row.type === 'TOPUP').length, 1);
  assert.equal((await paymentCharges.confirmTopup('other', { intentId: started.intent.id })).code, 'not_found');
});

test('later settings changes do not rewrite prior charges and pending payments keep their snapshot', async t => {
  const provider = testProvider();
  const { database, workerWallet, paymentSettings, paymentCharges } = memory(provider);
  t.after(() => database.close());
  paymentSettings.publish({
    expectedVersion: 0, providerId: 'testpay', merchantId: 'MID-1', settlementAccount: 'old',
    settlementConfirmed: true, secret: 'gateway-secret',
  });
  const started = await paymentCharges.startTopup('worker', { amount: 250, currencyUnit: 'تومان' });
  paymentSettings.publish({
    expectedVersion: 1, providerId: 'testpay', merchantId: 'MID-1', settlementAccount: 'new',
    settlementConfirmed: true, secret: 'gateway-secret',
  });
  provider.markPaid(started.intent.providerRef);
  const credited = await paymentCharges.confirmTopup('worker', { intentId: started.intent.id });
  assert.equal(credited.code, 'ok');
  assert.equal(workerWallet.read('worker').balances[0].balance, 250);
  paymentSettings.publish({
    expectedVersion: 2, providerId: '', merchantId: '', settlementAccount: 'new', settlementConfirmed: false,
  });
  assert.equal(paymentSettings.read().chargeEnabled, false);
  assert.equal(workerWallet.read('worker').balances[0].balance, 250);
  assert.equal((await paymentCharges.startTopup('worker', { amount: 100, currencyUnit: 'تومان' })).code, 'not_configured');
});
