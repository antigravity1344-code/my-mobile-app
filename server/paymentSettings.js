'use strict';

const crypto = require('node:crypto');
const fieldCrypto = require('./fieldCrypto');
const { providerById } = require('./paymentProviders');

// One company per deployment. Versions are immutable. Connection secrets are encrypted
// with the deployment data key and are never part of the public settings view.
function createPaymentSettings({ database, transaction, providers, wallet, getUser }) {
  const catalog = Array.isArray(providers) ? providers : [];
  database.exec(`
    CREATE TABLE IF NOT EXISTS company_payment_settings (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      providerId TEXT,
      merchantId TEXT,
      settlementLabel TEXT,
      settlementReference TEXT,
      secretCiphertext TEXT,
      createdAt TEXT NOT NULL,
      actor TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS company_payment_verifications (
      settingsVersion INTEGER PRIMARY KEY CHECK (settingsVersion > 0),
      providerId TEXT NOT NULL,
      verifiedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS worker_topup_receipts (
      id TEXT PRIMARY KEY,
      workerId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      settingsVersion INTEGER NOT NULL CHECK (settingsVersion > 0),
      idempotencyKey TEXT NOT NULL,
      providerReference TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      currencyUnit TEXT NOT NULL,
      sourceKey TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      UNIQUE (providerId, idempotencyKey)
    );
    CREATE TABLE IF NOT EXISTS worker_topup_intents (
      id TEXT PRIMARY KEY,
      workerId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      settingsVersion INTEGER NOT NULL CHECK (settingsVersion > 0),
      amount INTEGER NOT NULL CHECK (amount > 0),
      currencyUnit TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
  const settingColumns = new Set(database.prepare('PRAGMA table_info(company_payment_settings)').all().map((column) => column.name));
  if (!settingColumns.has('is_default')) {
    database.exec('ALTER TABLE company_payment_settings ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0');
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS company_payment_one_default
    ON company_payment_settings(is_default) WHERE is_default = 1;
  `);
  for (const table of ['company_payment_settings', 'company_payment_verifications', 'worker_topup_receipts', 'worker_topup_intents']) {
    for (const operation of ['UPDATE', 'DELETE']) {
      database.exec(`
        CREATE TRIGGER IF NOT EXISTS ${table}_no_${operation.toLowerCase()}
        BEFORE ${operation} ON ${table}
        BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
      `);
    }
  }
  // Secrets and settlement fields stay immutable. Only the default pointer may move.
  database.exec('DROP TRIGGER IF EXISTS company_payment_settings_no_update');
  database.exec(`
    CREATE TRIGGER company_payment_settings_no_update
    BEFORE UPDATE ON company_payment_settings
    WHEN NEW.version IS NOT OLD.version
      OR NEW.providerId IS NOT OLD.providerId
      OR NEW.merchantId IS NOT OLD.merchantId
      OR NEW.settlementLabel IS NOT OLD.settlementLabel
      OR NEW.settlementReference IS NOT OLD.settlementReference
      OR NEW.secretCiphertext IS NOT OLD.secretCiphertext
      OR NEW.createdAt IS NOT OLD.createdAt
      OR NEW.actor IS NOT OLD.actor
      OR NEW.is_default IS OLD.is_default
    BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
  `);
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS company_payment_settings_no_replace
    BEFORE INSERT ON company_payment_settings
    WHEN EXISTS (SELECT 1 FROM company_payment_settings WHERE version = NEW.version)
    BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS company_payment_verifications_no_replace
    BEFORE INSERT ON company_payment_verifications
    WHEN EXISTS (SELECT 1 FROM company_payment_verifications WHERE settingsVersion = NEW.settingsVersion)
    BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS worker_topup_receipts_no_replace
    BEFORE INSERT ON worker_topup_receipts
    WHEN EXISTS (
      SELECT 1 FROM worker_topup_receipts
      WHERE id = NEW.id OR sourceKey = NEW.sourceKey OR (providerId = NEW.providerId AND idempotencyKey = NEW.idempotencyKey)
    )
    BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS worker_topup_intents_no_replace
    BEFORE INSERT ON worker_topup_intents
    WHEN EXISTS (SELECT 1 FROM worker_topup_intents WHERE id = NEW.id)
    BEGIN SELECT RAISE(ABORT, 'payment settings history is immutable'); END;
  `);

  const latest = database.prepare('SELECT * FROM company_payment_settings ORDER BY version DESC LIMIT 1');
  const byVersion = database.prepare('SELECT * FROM company_payment_settings WHERE version = ?');
  const defaultRow = database.prepare('SELECT * FROM company_payment_settings WHERE is_default = 1');
  const clearDefault = database.prepare('UPDATE company_payment_settings SET is_default = 0 WHERE is_default = 1');
  const markDefault = database.prepare('UPDATE company_payment_settings SET is_default = 1 WHERE version = ?');
  const verificationOf = database.prepare('SELECT * FROM company_payment_verifications WHERE settingsVersion = ?');
  const insertSettings = database.prepare(`INSERT INTO company_payment_settings
    (version, providerId, merchantId, settlementLabel, settlementReference, secretCiphertext, createdAt, actor, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', ?)`);
  const current = latest.get();
  if (current && !defaultRow.get()) markDefault.run(current.version);
  const insertVerification = database.prepare(`INSERT INTO company_payment_verifications
    (settingsVersion, providerId, verifiedAt) VALUES (?, ?, ?)`);
  const receiptByKey = database.prepare('SELECT * FROM worker_topup_receipts WHERE providerId = ? AND idempotencyKey = ?');
  const insertReceipt = database.prepare(`INSERT INTO worker_topup_receipts
    (id, workerId, providerId, settingsVersion, idempotencyKey, providerReference, amount, currencyUnit, sourceKey, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const intentById = database.prepare('SELECT * FROM worker_topup_intents WHERE id = ?');
  const insertIntent = database.prepare(`INSERT INTO worker_topup_intents
    (id, workerId, providerId, settingsVersion, amount, currencyUnit, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  function availableProviders() {
    return catalog.filter((provider) => provider && typeof provider.id === 'string').map((provider) => ({ id: provider.id }));
  }

  function viewOf(row) {
    const fallback = defaultRow.get();
    const base = {
      version: 0,
      providerId: null,
      availableProviders: availableProviders(),
      merchantId: null,
      settlementAccount: { label: null, reference: null, verified: false },
      hasConnectionSecret: false,
      connectionReady: false,
      topupEnabled: false,
      isDefault: false,
      defaultVersion: fallback ? fallback.version : null,
    };
    if (!row) return base;
    const verification = verificationOf.get(row.version);
    const provider = providerById(catalog, row.providerId);
    const verified = Boolean(verification && row.providerId && verification.providerId === row.providerId);
    const ready = Boolean(
      verified
      && row.merchantId
      && row.settlementReference
      && row.secretCiphertext
      && provider
      && typeof provider.verifyPayment === 'function'
    );
    return {
      version: row.version,
      providerId: row.providerId,
      availableProviders: base.availableProviders,
      merchantId: row.merchantId,
      settlementAccount: {
        label: row.settlementLabel,
        reference: row.settlementReference,
        verified,
      },
      hasConnectionSecret: Boolean(row.secretCiphertext),
      connectionReady: ready,
      topupEnabled: ready,
      isDefault: row.is_default === 1,
      defaultVersion: fallback ? fallback.version : null,
    };
  }

  function read() {
    return viewOf(latest.get());
  }

  // D-80 keeps one company per SQLite. There is no per-requester payment row, so a
  // caller without specific settings falls back to the single is_default record.
  function resolve(requesterId) {
    if (requesterId != null && requesterId !== '') {
      // Reserved: a future owner-approved per-requester map would be read here.
    }
    const fallback = defaultRow.get();
    if (fallback) return { code: 'ok', settings: viewOf(fallback), source: 'default' };
    return { code: 'not_configured' };
  }

  function assignDefault(version) {
    const row = byVersion.get(version);
    if (!row) return { code: 'invalid' };
    if (row.is_default === 1) return { code: 'ok', settings: read() };
    clearDefault.run();
    markDefault.run(version);
    return { code: 'ok', settings: read() };
  }

  function optionalToken(value, pattern) {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== 'string') return { ok: false };
    const trimmed = value.trim();
    if (!trimmed) return { ok: true, value: null };
    if (!pattern.test(trimmed)) return { ok: false };
    return { ok: true, value: trimmed };
  }

  function optionalLabel(value) {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== 'string') return { ok: false };
    const trimmed = value.trim();
    if (!trimmed) return { ok: true, value: null };
    if (trimmed.length > 80 || /[\u0000-\u001f\u007f]/.test(trimmed)) return { ok: false };
    return { ok: true, value: trimmed };
  }

  function parseProvider(value) {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(value)) return { ok: false };
    if (!providerById(catalog, value)) return { ok: true, unavailable: true, value };
    return { ok: true, value };
  }

  function parsePublish(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { code: 'invalid' };
    const keys = Object.keys(input);
    if (keys.length === 2 && Object.hasOwn(input, 'expectedVersion') && Object.hasOwn(input, 'defaultVersion')) {
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
        || !Number.isSafeInteger(input.defaultVersion) || input.defaultVersion < 1) return { code: 'invalid' };
      return { defaultOnly: true, expectedVersion: input.expectedVersion, defaultVersion: input.defaultVersion };
    }
    const allowed = new Set(['expectedVersion', 'providerId', 'merchantId', 'settlementLabel', 'settlementReference', 'connectionSecret', 'isDefault']);
    const required = ['expectedVersion', 'providerId', 'merchantId', 'settlementLabel', 'settlementReference'];
    if (keys.some((key) => !allowed.has(key)) || required.some((key) => !Object.hasOwn(input, key))) return { code: 'invalid' };
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    if (Object.hasOwn(input, 'isDefault') && typeof input.isDefault !== 'boolean') return { code: 'invalid' };
    const provider = parseProvider(input.providerId);
    if (!provider.ok) return { code: 'invalid' };
    const merchant = optionalToken(input.merchantId, /^[A-Za-z0-9_-]{1,64}$/);
    const reference = optionalToken(input.settlementReference, /^[A-Za-z0-9-]{1,40}$/);
    const label = optionalLabel(input.settlementLabel);
    if (!merchant.ok || !reference.ok || !label.ok) return { code: 'invalid' };
    const parsed = {
      expectedVersion: input.expectedVersion,
      providerId: provider.value,
      unavailable: Boolean(provider.unavailable),
      merchantId: merchant.value,
      settlementLabel: label.value,
      settlementReference: reference.value,
      isDefault: Object.hasOwn(input, 'isDefault') ? input.isDefault : undefined,
    };
    if (Object.hasOwn(input, 'connectionSecret')) {
      if (input.connectionSecret === null) parsed.connectionSecret = null;
      else if (typeof input.connectionSecret !== 'string' || input.connectionSecret.length < 1
        || input.connectionSecret.length > 4096 || input.connectionSecret.includes('\u0000')
        || input.connectionSecret.startsWith('enc:v1:') || input.connectionSecret.startsWith('hmac:v1:')) return { code: 'invalid' };
      else parsed.connectionSecret = input.connectionSecret;
    }
    return { value: parsed };
  }

  function publish(input) {
    const parsed = parsePublish(input);
    if (parsed.code) return parsed;
    return transaction(() => {
      const current = latest.get() || null;
      const currentVersion = current ? current.version : 0;
      if (parsed.defaultOnly) {
        if (currentVersion !== parsed.expectedVersion) return { code: 'conflict', settings: viewOf(current) };
        return assignDefault(parsed.defaultVersion);
      }
      const next = parsed.value;
      if (currentVersion !== next.expectedVersion) return { code: 'conflict', settings: viewOf(current) };
      if (next.unavailable) return { code: 'provider_unavailable', settings: viewOf(current) };
      const secretCiphertext = Object.hasOwn(next, 'connectionSecret')
        ? (next.connectionSecret === null ? null : fieldCrypto.encryptString(next.connectionSecret))
        : (current ? current.secretCiphertext : null);
      if (secretCiphertext && !fieldCrypto.isEncrypted(secretCiphertext)) {
        throw new Error('PLAINTEXT_PAYMENT_SECRET');
      }
      const makeDefault = next.isDefault === true || (!defaultRow.get() && next.isDefault !== false);
      if (makeDefault) clearDefault.run();
      insertSettings.run(
        currentVersion + 1,
        next.providerId,
        next.merchantId,
        next.settlementLabel,
        next.settlementReference,
        secretCiphertext,
        new Date().toISOString(),
        makeDefault ? 1 : 0
      );
      return { code: 'ok', settings: read() };
    });
  }

  // Only a server-side provider adapter may call this. Saving an account field does not verify it.
  function markSettlementVerified(settingsVersion) {
    if (!Number.isSafeInteger(settingsVersion) || settingsVersion < 1) return { code: 'invalid' };
    return transaction(() => {
      const row = byVersion.get(settingsVersion);
      if (!row) return { code: 'invalid' };
      const provider = providerById(catalog, row.providerId);
      if (!provider || typeof provider.verifyPayment !== 'function') return { code: 'provider_unavailable', settings: viewOf(row) };
      if (!row.merchantId || !row.settlementReference || !row.secretCiphertext) return { code: 'not_configured', settings: viewOf(row) };
      const existing = verificationOf.get(settingsVersion);
      if (existing && existing.providerId !== row.providerId) return { code: 'conflict', settings: viewOf(row) };
      if (!existing) insertVerification.run(settingsVersion, row.providerId, new Date().toISOString());
      return { code: 'ok', settings: viewOf(byVersion.get(settingsVersion)) };
    });
  }

  function readConnectionSecret(version) {
    if (!Number.isSafeInteger(version) || version < 1) return null;
    const row = byVersion.get(version);
    if (!row || !row.secretCiphertext) return null;
    return fieldCrypto.decryptString(row.secretCiphertext);
  }

  function publicReceipt(row) {
    return {
      id: row.id,
      workerId: row.workerId,
      providerId: row.providerId,
      settingsVersion: row.settingsVersion,
      amount: row.amount,
      currencyUnit: row.currencyUnit,
      providerReference: row.providerReference,
      createdAt: row.createdAt,
    };
  }

  function matchingReceipt(row, intent, providerReference) {
    return row.workerId === intent.workerId
      && row.providerId === intent.providerId
      && row.settingsVersion === intent.settingsVersion
      && row.idempotencyKey === intent.id
      && row.amount === intent.amount
      && row.currencyUnit === intent.currencyUnit
      && (providerReference == null || row.providerReference === providerReference);
  }

  function parseProof(proof) {
    if (!proof || proof.ok !== true || typeof proof.workerId !== 'string' || proof.workerId.length < 1 || proof.workerId.length > 80
      || /[\u0000-\u001f\u007f]/.test(proof.workerId) || !Number.isSafeInteger(proof.amount) || proof.amount < 1
      || typeof proof.currencyUnit !== 'string' || proof.currencyUnit.trim().length < 1 || proof.currencyUnit.trim().length > 64
      || typeof proof.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(proof.idempotencyKey)
      || typeof proof.providerReference !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(proof.providerReference)) return null;
    return {
      workerId: proof.workerId,
      amount: proof.amount,
      currencyUnit: proof.currencyUnit.trim(),
      idempotencyKey: proof.idempotencyKey,
      providerReference: proof.providerReference,
    };
  }

  function parsePaymentId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
  }

  function publicIntent(row) {
    return {
      id: row.id,
      workerId: row.workerId,
      providerId: row.providerId,
      settingsVersion: row.settingsVersion,
      amount: row.amount,
      currencyUnit: row.currencyUnit,
      createdAt: row.createdAt,
    };
  }

  function parseStart(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { code: 'invalid' };
    const allowed = new Set(['id', 'workerId', 'amount', 'currencyUnit']);
    if (Object.keys(input).some((key) => !allowed.has(key))) return { code: 'invalid' };
    if (typeof input.workerId !== 'string' || input.workerId.length < 1 || input.workerId.length > 80
      || /[\u0000-\u001f\u007f]/.test(input.workerId)
      || !Number.isSafeInteger(input.amount) || input.amount < 1
      || typeof input.currencyUnit !== 'string' || input.currencyUnit.trim().length < 1 || input.currencyUnit.trim().length > 64) {
      return { code: 'invalid' };
    }
    const id = Object.hasOwn(input, 'id') ? parsePaymentId(input.id) : crypto.randomUUID();
    if (!id) return { code: 'invalid' };
    return { value: { id, workerId: input.workerId, amount: input.amount, currencyUnit: input.currencyUnit.trim() } };
  }

  function sameIntent(row, start) {
    return row.workerId === start.workerId
      && row.providerId === start.providerId
      && row.settingsVersion === start.settingsVersion
      && row.amount === start.amount
      && row.currencyUnit === start.currencyUnit;
  }

  // Snapshot the current default settings. Later default changes do not retarget this payment.
  function startVerifiedPayment(input) {
    const parsed = parseStart(input);
    if (parsed.code) return parsed;
    const user = typeof getUser === 'function' ? getUser(parsed.value.workerId) : null;
    if (!user || user.role !== 'WORKER') return { code: 'unverified' };
    try {
      return transaction(() => {
        const resolved = resolve();
        if (resolved.code !== 'ok') return { code: 'not_configured' };
        const row = defaultRow.get();
        const bound = viewOf(row);
        if (!bound.topupEnabled || !row || !row.providerId) return { code: 'not_configured' };
        const existing = intentById.get(parsed.value.id);
        const next = {
          ...parsed.value,
          providerId: row.providerId,
          settingsVersion: row.version,
        };
        if (existing) return sameIntent(existing, next)
          ? { code: 'duplicate', payment: publicIntent(existing) }
          : { code: 'conflict' };
        insertIntent.run(
          next.id,
          next.workerId,
          next.providerId,
          next.settingsVersion,
          next.amount,
          next.currencyUnit,
          new Date().toISOString()
        );
        return { code: 'ok', payment: publicIntent(intentById.get(next.id)) };
      });
    } catch (error) {
      const message = String(error && error.message);
      if (!/UNIQUE|immutable/i.test(message)) throw error;
      const existing = intentById.get(parsed.value.id);
      if (existing && existing.workerId === parsed.value.workerId
        && existing.amount === parsed.value.amount
        && existing.currencyUnit === parsed.value.currencyUnit) {
        return { code: 'duplicate', payment: publicIntent(existing) };
      }
      return { code: 'conflict' };
    }
  }

  function boundSettingsContext(row) {
    return {
      settingsVersion: row.version,
      providerId: row.providerId,
      merchantId: row.merchantId,
      settlementReference: row.settlementReference,
      connectionSecret: row.secretCiphertext ? fieldCrypto.decryptString(row.secretCiphertext) : null,
    };
  }

  function proofMatchesIntent(proof, intent) {
    return proof.workerId === intent.workerId
      && proof.amount === intent.amount
      && proof.currencyUnit === intent.currencyUnit
      && proof.idempotencyKey === intent.id;
  }

  // Browser payloads are not payment proof. Confirm against the settings version captured at start.
  function confirmVerifiedPayment(notice) {
    const paymentId = parsePaymentId(notice && notice.paymentId);
    if (!paymentId) return { code: 'unverified' };
    const intent = intentById.get(paymentId);
    if (!intent) return { code: 'unverified' };
    const settingsRow = byVersion.get(intent.settingsVersion);
    if (!settingsRow || settingsRow.providerId !== intent.providerId) return { code: 'unverified' };
    const existingReceipt = receiptByKey.get(intent.providerId, intent.id);
    const boundView = viewOf(settingsRow);
    const provider = providerById(catalog, intent.providerId);
    if (!provider || typeof provider.verifyPayment !== 'function' || (!boundView.topupEnabled && !existingReceipt)) {
      return { code: 'not_configured' };
    }
    let proof;
    try {
      proof = provider.verifyPayment(notice, boundSettingsContext(settingsRow));
    } catch {
      return { code: 'unverified' };
    }
    // Real gateway verification may be asynchronous; never hold a SQLite
    // transaction open while waiting on the provider.
    if (proof && typeof proof.then === 'function') {
      return Promise.resolve(proof).then(finalizeProof, () => ({ code: 'unverified' }));
    }
    return finalizeProof(proof);

    function finalizeProof(proof) {
      const parsed = parseProof(proof);
      if (!parsed || !proofMatchesIntent(parsed, intent)) return { code: parsed ? 'conflict' : 'unverified' };
      if (existingReceipt) {
        return matchingReceipt(existingReceipt, intent, parsed.providerReference)
          ? { code: 'duplicate', receipt: publicReceipt(existingReceipt) }
          : { code: 'conflict' };
      }
      const user = typeof getUser === 'function' ? getUser(intent.workerId) : null;
      if (!user || user.role !== 'WORKER') return { code: 'unverified' };
      try {
        return transaction(() => {
          const freshIntent = intentById.get(paymentId);
          const freshSettings = freshIntent ? byVersion.get(freshIntent.settingsVersion) : null;
          if (!freshIntent || !freshSettings || freshSettings.providerId !== freshIntent.providerId) return { code: 'unverified' };
          const existing = receiptByKey.get(freshIntent.providerId, freshIntent.id);
          if (existing) return matchingReceipt(existing, freshIntent, parsed.providerReference)
            ? { code: 'duplicate', receipt: publicReceipt(existing) }
            : { code: 'conflict' };
          const sourceKey = `topup:${freshIntent.providerId}:${freshIntent.id}`;
          const credit = wallet.creditVerifiedTopup({
            workerId: freshIntent.workerId,
            amount: freshIntent.amount,
            currencyUnit: freshIntent.currencyUnit,
            sourceKey,
          });
          if (credit.code !== 'ok' && credit.code !== 'duplicate') return { code: credit.code };
          insertReceipt.run(
            crypto.randomUUID(),
            freshIntent.workerId,
            freshIntent.providerId,
            freshIntent.settingsVersion,
            freshIntent.id,
            parsed.providerReference,
            freshIntent.amount,
            freshIntent.currencyUnit,
            sourceKey,
            new Date().toISOString()
          );
          return {
            code: credit.code === 'duplicate' ? 'duplicate' : 'ok',
            receipt: publicReceipt(receiptByKey.get(freshIntent.providerId, freshIntent.id)),
          };
        });
      } catch (error) {
        const message = String(error && error.message);
        if (!/UNIQUE|immutable/i.test(message)) throw error;
        const existing = receiptByKey.get(intent.providerId, intent.id);
        if (existing && matchingReceipt(existing, intent)) return { code: 'duplicate', receipt: publicReceipt(existing) };
        return { code: 'conflict' };
      }
    }
  }

  return { read, resolve, publish, markSettlementVerified, readConnectionSecret, startVerifiedPayment, confirmVerifiedPayment };
}

module.exports = { createPaymentSettings };
