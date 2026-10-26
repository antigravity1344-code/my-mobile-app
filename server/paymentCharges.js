'use strict';
const { IMPLEMENTED_PAYMENT_PROVIDERS, providerById } = require('./paymentProviders');

// HTTP orchestration only. Settings, verification, receipts and wallet credit
// are owned by paymentSettings; this module never writes a wallet entry.
function createPaymentCharges({ database, paymentSettings, workerWallet, providers = IMPLEMENTED_PAYMENT_PROVIDERS }) {
  // Keep the legacy dispatch table without guessing/migrating old payments.
  // An old row without a matching canonical intent cannot be confirmed.
  database.exec(`
    CREATE TABLE IF NOT EXISTS worker_wallet_topup_intents (
      id TEXT PRIMARY KEY, workerId TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
      currencyUnit TEXT NOT NULL, providerId TEXT NOT NULL, settingsVersion INTEGER NOT NULL,
      providerRef TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('PENDING','CREDITED')),
      createdAt TEXT NOT NULL, creditedAt TEXT
    );
  `);
  const dispatch = database.prepare('SELECT * FROM worker_wallet_topup_intents WHERE id=?');
  const intent = database.prepare('SELECT * FROM worker_topup_intents WHERE id=?');
  const settings = database.prepare('SELECT * FROM company_payment_settings WHERE version=?');
  const receipt = database.prepare('SELECT id FROM worker_topup_receipts WHERE providerId=? AND idempotencyKey=?');
  const insert = database.prepare(`INSERT INTO worker_wallet_topup_intents
    (id,workerId,amount,currencyUnit,providerId,settingsVersion,providerRef,status,createdAt,creditedAt)
    VALUES (?,?,?,?,?,?,?,'PENDING',?,NULL)`);

  function available() {
    const resolved = paymentSettings.resolve();
    return resolved.code === 'ok' && resolved.settings.topupEnabled
      && typeof providerById(providers, resolved.settings.providerId)?.startPayment === 'function';
  }
  function validBody(input, keys) {
    return input && typeof input === 'object' && !Array.isArray(input)
      && Object.keys(input).length === keys.length && keys.every(key => Object.hasOwn(input, key));
  }
  function publicIntent(row) {
    return { id: row.id, amount: row.amount, currencyUnit: row.currencyUnit,
      providerId: row.providerId, settingsVersion: row.settingsVersion,
      status: receipt.get(row.providerId, row.id) ? 'CREDITED' : 'PENDING' };
  }
  async function startTopup(workerId, input) {
    if (!available()) return { code: 'not_configured' };
    if (!validBody(input, ['amount', 'currencyUnit'])) return { code: 'invalid' };
    const started = paymentSettings.startVerifiedPayment({ workerId, amount: input.amount, currencyUnit: input.currencyUnit });
    if (started.code !== 'ok') return started;
    const payment = started.payment;
    const bound = settings.get(payment.settingsVersion);
    const provider = providerById(providers, payment.providerId);
    let checkout;
    try {
      checkout = await provider.startPayment(payment, {
        settingsVersion: bound.version, providerId: bound.providerId, merchantId: bound.merchantId,
        settlementReference: bound.settlementReference,
        connectionSecret: paymentSettings.readConnectionSecret(bound.version),
      });
    } catch { return { code: 'provider_error' }; }
    if (!checkout || typeof checkout.providerReference !== 'string'
      || !/^[A-Za-z0-9._:-]{1,128}$/.test(checkout.providerReference)) return { code: 'provider_error' };
    let redirect;
    try { redirect = new URL(checkout.redirectUrl); } catch { return { code: 'provider_error' }; }
    if (redirect.protocol !== 'https:' || redirect.username || redirect.password) return { code: 'provider_error' };
    insert.run(payment.id, payment.workerId, payment.amount, payment.currencyUnit, payment.providerId,
      payment.settingsVersion, checkout.providerReference, payment.createdAt);
    return { code: 'ok', intent: publicIntent(payment), redirectUrl: redirect.href };
  }
  async function confirmTopup(workerId, input) {
    if (!validBody(input, ['intentId']) || typeof input.intentId !== 'string'
      || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.intentId)) return { code: 'invalid' };
    const payment = intent.get(input.intentId);
    const link = dispatch.get(input.intentId);
    if (!payment || payment.workerId !== workerId || !link || link.workerId !== workerId) return { code: 'not_found' };
    if (link.providerId !== payment.providerId || link.settingsVersion !== payment.settingsVersion
      || link.amount !== payment.amount || link.currencyUnit !== payment.currencyUnit) return { code: 'conflict' };
    // No browser-supplied amount, owner, settings, status or proof reaches verification.
    const result = await paymentSettings.confirmVerifiedPayment({
      paymentId: payment.id, providerReference: link.providerRef,
    });
    if (result.code !== 'ok' && result.code !== 'duplicate') return result;
    return { code: 'ok', intent: publicIntent(payment), wallet: workerWallet.read(workerId) };
  }
  return { available, startTopup, confirmTopup };
}
module.exports = { createPaymentCharges };
