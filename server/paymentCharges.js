'use strict';
const crypto = require('node:crypto');
const { implementedProviders } = require('./paymentProviders');

const START_KEYS = new Set(['amount', 'currencyUnit']);
const CONFIRM_KEYS = new Set(['intentId']);

function createPaymentCharges({ database, transaction, paymentSettings, workerWallet, providers = implementedProviders() }) {
  const catalog = new Map((providers || []).filter(item => item && item.id).map(item => [item.id, item]));
  database.exec(`
    CREATE TABLE IF NOT EXISTS worker_wallet_topup_intents (
      id TEXT PRIMARY KEY,
      workerId TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0),
      currencyUnit TEXT NOT NULL,
      providerId TEXT NOT NULL,
      settingsVersion INTEGER NOT NULL,
      providerRef TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('PENDING','CREDITED')),
      createdAt TEXT NOT NULL,
      creditedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS worker_topup_intents_by_worker ON worker_wallet_topup_intents(workerId);
  `);
  const insertIntent = database.prepare(`INSERT INTO worker_wallet_topup_intents
    (id,workerId,amount,currencyUnit,providerId,settingsVersion,providerRef,status,createdAt,creditedAt)
    VALUES (?,?,?,?,?,?,?,'PENDING',?,NULL)`);
  const getIntent = database.prepare('SELECT * FROM worker_wallet_topup_intents WHERE id=?');
  const markCredited = database.prepare("UPDATE worker_wallet_topup_intents SET status='CREDITED', creditedAt=? WHERE id=? AND status='PENDING'");

  function publicIntent(row) {
    return {
      id: row.id, amount: row.amount, currencyUnit: row.currencyUnit,
      providerId: row.providerId, providerRef: row.providerRef, status: row.status,
    };
  }
  async function startTopup(workerId, input) {
    if (!workerId || typeof workerId !== 'string') return { code: 'invalid' };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { code: 'invalid' };
    const keys = Object.keys(input);
    if (keys.length !== 2 || keys.some(key => !START_KEYS.has(key))) return { code: 'invalid' };
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return { code: 'invalid' };
    if (typeof input.currencyUnit !== 'string' || !input.currencyUnit.trim() || input.currencyUnit.trim().length > 64) return { code: 'invalid' };
    const settings = paymentSettings.read();
    if (!settings.chargeEnabled) return { code: 'not_configured' };
    const snapshot = paymentSettings.connection(settings.version);
    if (!snapshot || !snapshot.secret || !snapshot.merchantId) return { code: 'not_configured' };
    const provider = catalog.get(snapshot.providerId) || snapshot.provider;
    if (!provider || typeof provider.start !== 'function') return { code: 'not_configured' };
    let started;
    try {
      started = await provider.start({
        amount: input.amount,
        currencyUnit: input.currencyUnit.trim(),
        merchantId: snapshot.merchantId,
        secret: snapshot.secret,
      });
    } catch {
      return { code: 'provider_error' };
    }
    if (!started || typeof started.providerRef !== 'string' || !started.providerRef || started.providerRef.length > 128) {
      return { code: 'provider_error' };
    }
    const id = crypto.randomUUID();
    try {
      insertIntent.run(id, workerId, input.amount, input.currencyUnit.trim(), snapshot.providerId, snapshot.version,
        started.providerRef, new Date().toISOString());
    } catch {
      return { code: 'provider_error' };
    }
    return { code: 'ok', intent: publicIntent(getIntent.get(id)) };
  }
  async function confirmTopup(workerId, input) {
    if (!workerId || typeof workerId !== 'string') return { code: 'invalid' };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { code: 'invalid' };
    const keys = Object.keys(input);
    if (keys.length !== 1 || keys.some(key => !CONFIRM_KEYS.has(key)) || typeof input.intentId !== 'string' || !input.intentId) {
      return { code: 'invalid' };
    }
    const intent = getIntent.get(input.intentId);
    if (!intent || intent.workerId !== workerId) return { code: 'not_found' };
    const snapshot = paymentSettings.connection(intent.settingsVersion);
    if (!snapshot || snapshot.providerId !== intent.providerId) return { code: 'unverified' };
    const provider = catalog.get(intent.providerId) || snapshot.provider;
    if (!provider || typeof provider.verify !== 'function') return { code: 'unverified' };
    let verified;
    try {
      verified = await provider.verify({
        providerRef: intent.providerRef,
        amount: intent.amount,
        currencyUnit: intent.currencyUnit,
        merchantId: snapshot.merchantId,
        secret: snapshot.secret,
      });
    } catch {
      return { code: 'provider_error' };
    }
    if (!verified || verified.ok !== true || verified.amount !== intent.amount || verified.currencyUnit !== intent.currencyUnit) {
      return { code: 'unverified' };
    }
    return transaction(() => {
      const current = getIntent.get(intent.id);
      if (!current || current.workerId !== workerId) return { code: 'not_found' };
      workerWallet.creditVerifiedTopup({
        workerId, amount: current.amount, currencyUnit: current.currencyUnit, sourceKey: 'topup:' + current.id,
      });
      if (current.status === 'PENDING') markCredited.run(new Date().toISOString(), current.id);
      return { code: 'ok', intent: publicIntent(getIntent.get(current.id)), wallet: workerWallet.read(workerId) };
    });
  }
  return { startTopup, confirmTopup };
}
module.exports = { createPaymentCharges };
