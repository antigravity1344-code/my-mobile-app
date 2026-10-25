'use strict';
process.env.NODE_ENV = 'test';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 41).toString('base64');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createPaymentSettings } = require('./paymentSettings');

function memory(providers = []) {
  const database = new DatabaseSync(':memory:');
  let depth = 0;
  const transaction = fn => {
    if (depth > 0) return fn();
    database.exec('BEGIN IMMEDIATE');
    depth += 1;
    try { const result = fn(); depth -= 1; database.exec('COMMIT'); return result; }
    catch (error) { depth = 0; try { database.exec('ROLLBACK'); } catch {} throw error; }
  };
  return { database, settings: createPaymentSettings({ database, transaction, providers }) };
}

test('empty catalog cannot select a made-up gateway and never returns secrets', t => {
  const { database, settings } = memory(); t.after(() => database.close());
  const first = settings.read();
  assert.equal(first.version, 0);
  assert.equal(first.chargeEnabled, false);
  assert.deepEqual(settings.listProviders(), []);
  assert.equal(settings.publish({
    expectedVersion: 0, providerId: 'zarinpal', merchantId: 'x', settlementAccount: 'IR1', settlementConfirmed: true, secret: 'leak-me',
  }).code, 'invalid');
  const saved = settings.publish({
    expectedVersion: 0, providerId: '', merchantId: '', settlementAccount: 'IR120000000000000000000001', settlementConfirmed: true,
  });
  assert.equal(saved.code, 'ok');
  assert.equal(saved.settings.settlementAccount, 'IR120000000000000000000001');
  assert.equal(saved.settings.chargeEnabled, false);
  assert.equal(JSON.stringify(saved.settings).includes('leak-me'), false);
  const row = database.prepare('SELECT * FROM company_payment_settings').get();
  assert.equal(String(row.settlementCipher).startsWith('enc:v1:'), true);
  assert.equal(JSON.stringify(row).includes('IR120000000000000000000001'), false);
});

test('only implemented providers can enable charging; history stays immutable', t => {
  const { database, settings } = memory([{ id: 'testpay', label: 'آزمایش' }]); t.after(() => database.close());
  assert.equal(settings.publish({
    expectedVersion: 0, providerId: 'testpay', merchantId: 'MID', settlementAccount: 'acc', settlementConfirmed: true,
  }).code, 'invalid');
  const enabled = settings.publish({
    expectedVersion: 0, providerId: 'testpay', merchantId: 'MID', settlementAccount: 'acc',
    settlementConfirmed: true, secret: 'gateway-secret',
  });
  assert.equal(enabled.code, 'ok');
  assert.equal(enabled.settings.chargeEnabled, true);
  assert.equal(enabled.settings.secretConfigured, true);
  assert.equal(enabled.settings.merchantId, 'MID');
  assert.equal(JSON.stringify(enabled.settings).includes('gateway-secret'), false);
  const conflict = settings.publish({
    expectedVersion: 0, providerId: 'testpay', merchantId: 'MID2', settlementAccount: 'acc',
    settlementConfirmed: true, secret: 'other',
  });
  assert.equal(conflict.code, 'conflict');
  const kept = settings.publish({
    expectedVersion: 1, providerId: 'testpay', merchantId: 'MID', settlementAccount: 'acc-2',
    settlementConfirmed: true,
  });
  assert.equal(kept.code, 'ok');
  assert.equal(settings.connection(1).secret, 'gateway-secret');
  assert.equal(settings.connection(2).settlementAccount, 'acc-2');
  assert.throws(() => database.exec('DELETE FROM company_payment_settings'));
  assert.equal(database.prepare('SELECT COUNT(*) n FROM company_payment_settings').get().n, 2);
});
