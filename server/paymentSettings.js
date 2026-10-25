'use strict';
const fieldCrypto = require('./fieldCrypto');
const { implementedProviders } = require('./paymentProviders');

const ALLOWED = new Set(['expectedVersion', 'providerId', 'merchantId', 'secret', 'settlementAccount', 'settlementConfirmed']);

function catalogMap(providers) {
  return new Map((providers || []).filter(item => item && typeof item.id === 'string' && item.id).map(item => [item.id, item]));
}

function emptyPublic() {
  return {
    version: 0, providerId: null, merchantId: '', secretConfigured: false,
    settlementAccount: '', settlementConfirmed: false, chargeEnabled: false,
  };
}

function createPaymentSettings({ database, transaction, providers = implementedProviders() }) {
  const catalog = catalogMap(providers);
  database.exec(`
    CREATE TABLE IF NOT EXISTS company_payment_settings (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      providerId TEXT NOT NULL,
      merchantCipher TEXT NOT NULL,
      secretCipher TEXT NOT NULL,
      settlementCipher TEXT NOT NULL,
      settlementConfirmed INTEGER NOT NULL CHECK (settlementConfirmed IN (0, 1)),
      createdAt TEXT NOT NULL,
      actor TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS company_payment_settings_no_update
      BEFORE UPDATE ON company_payment_settings
      BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS company_payment_settings_no_delete
      BEFORE DELETE ON company_payment_settings
      BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS company_payment_settings_no_replace
      BEFORE INSERT ON company_payment_settings
      WHEN EXISTS (SELECT 1 FROM company_payment_settings WHERE version = NEW.version)
      BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
  `);
  const latest = database.prepare('SELECT * FROM company_payment_settings ORDER BY version DESC LIMIT 1');
  const byVersion = database.prepare('SELECT * FROM company_payment_settings WHERE version=?');
  const insert = database.prepare(`INSERT INTO company_payment_settings
    (version,providerId,merchantCipher,secretCipher,settlementCipher,settlementConfirmed,createdAt,actor)
    VALUES (?,?,?,?,?,?,?,?)`);

  function listProviders() {
    return Array.from(catalog.values(), item => ({ id: item.id, label: typeof item.label === 'string' ? item.label : item.id }));
  }
  function decryptField(stored) {
    return stored ? fieldCrypto.decryptString(stored) : '';
  }
  function publicView(row) {
    if (!row) return emptyPublic();
    const providerId = row.providerId || '';
    const merchantId = decryptField(row.merchantCipher);
    const secretConfigured = Boolean(row.secretCipher);
    const settlementConfirmed = row.settlementConfirmed === 1;
    return {
      version: row.version,
      providerId: providerId || null,
      merchantId,
      secretConfigured,
      settlementAccount: decryptField(row.settlementCipher),
      settlementConfirmed,
      chargeEnabled: Boolean(providerId && catalog.has(providerId) && merchantId && secretConfigured && settlementConfirmed),
    };
  }
  function read() { return publicView(latest.get()); }
  function chargeEnabled() { return read().chargeEnabled; }
  function connection(version) {
    const row = Number.isSafeInteger(version) && version > 0 ? byVersion.get(version) : latest.get();
    if (!row) return null;
    const provider = catalog.get(row.providerId);
    if (!provider) return null;
    return {
      version: row.version,
      providerId: row.providerId,
      provider,
      merchantId: decryptField(row.merchantCipher),
      secret: decryptField(row.secretCipher),
      settlementAccount: decryptField(row.settlementCipher),
      settlementConfirmed: row.settlementConfirmed === 1,
    };
  }
  function publish(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { code: 'invalid' };
    const keys = Object.keys(input);
    if (!keys.includes('expectedVersion') || keys.some(key => !ALLOWED.has(key))) return { code: 'invalid' };
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    if (typeof input.providerId !== 'string' || (input.providerId !== '' && !catalog.has(input.providerId))) return { code: 'invalid' };
    if (typeof input.merchantId !== 'string' || input.merchantId.length > 128) return { code: 'invalid' };
    if (typeof input.settlementAccount !== 'string' || input.settlementAccount.length > 64) return { code: 'invalid' };
    if (typeof input.settlementConfirmed !== 'boolean') return { code: 'invalid' };
    const secretProvided = Object.hasOwn(input, 'secret');
    if (secretProvided && (typeof input.secret !== 'string' || input.secret.length > 512)) return { code: 'invalid' };
    if (input.providerId && !input.merchantId.trim()) return { code: 'invalid' };
    if (!input.providerId && secretProvided && input.secret) return { code: 'invalid' };
    return transaction(() => {
      const current = latest.get();
      const currentPublic = publicView(current);
      if (currentPublic.version !== input.expectedVersion) return { code: 'conflict', settings: currentPublic };
      let secretCipher = current && current.providerId === input.providerId ? current.secretCipher : '';
      if (secretProvided && input.secret) secretCipher = fieldCrypto.encryptString(input.secret);
      if (input.providerId && !secretCipher) return { code: 'invalid' };
      insert.run(
        currentPublic.version + 1,
        input.providerId,
        input.merchantId ? fieldCrypto.encryptString(input.merchantId) : '',
        secretCipher,
        input.settlementAccount ? fieldCrypto.encryptString(input.settlementAccount) : '',
        input.settlementConfirmed ? 1 : 0,
        new Date().toISOString(),
        'admin'
      );
      return { code: 'ok', settings: read() };
    });
  }
  return { read, publish, chargeEnabled, connection, listProviders };
}
module.exports = { createPaymentSettings };
