'use strict';
// D-81: حدود قیمت پیشنهاد متخصص برای هر استقرار (هر شرکت یک پایگاه‌داده). نسخه‌دار و تغییرناپذیر؛
// انتشار نسخهٔ تازه پیشنهادهای ثبت‌شدهٔ قبلی را عوض نمی‌کند. بدون نسخه، پیش‌فرض ۵۰٪ / ۱۰۰٪ / ۱۳۰٪ است.
const DEFAULTS = Object.freeze({ minBps: 5000, maxBps: 10000, goldMaxBps: 13000 });
const MAX_PERCENT = 300;

function toBps(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_PERCENT ? value * 100 : null;
}

function createOfferPolicy({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS offer_policy_versions (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      minBps INTEGER NOT NULL, maxBps INTEGER NOT NULL, goldMaxBps INTEGER NOT NULL,
      createdAt TEXT NOT NULL, actor TEXT NOT NULL,
      CHECK (minBps >= 100 AND minBps <= maxBps AND maxBps <= goldMaxBps AND goldMaxBps <= ${MAX_PERCENT * 100})
    );
    CREATE TRIGGER IF NOT EXISTS offer_policy_no_update
    BEFORE UPDATE ON offer_policy_versions
    BEGIN SELECT RAISE(ABORT, 'offer policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS offer_policy_no_delete
    BEFORE DELETE ON offer_policy_versions
    BEGIN SELECT RAISE(ABORT, 'offer policy history is immutable'); END;
  `);
  const latest = database.prepare('SELECT * FROM offer_policy_versions ORDER BY version DESC LIMIT 1');
  const insert = database.prepare('INSERT INTO offer_policy_versions (version, minBps, maxBps, goldMaxBps, createdAt, actor) VALUES (?, ?, ?, ?, ?, ?)');

  /** نمای داخلی بر حسب basis points (برای اعتبارسنجی پیشنهاد). */
  function bounds() {
    const row = latest.get();
    return row ? { minBps: row.minBps, maxBps: row.maxBps, goldMaxBps: row.goldMaxBps } : { ...DEFAULTS };
  }
  function read() {
    const row = latest.get();
    const b = row ? { minBps: row.minBps, maxBps: row.maxBps, goldMaxBps: row.goldMaxBps } : DEFAULTS;
    return {
      version: row ? row.version : 0,
      minPercent: b.minBps / 100, maxPercent: b.maxBps / 100, goldMaxPercent: b.goldMaxBps / 100,
      effectiveAt: row ? row.createdAt : null,
    };
  }
  function publish(input) {
    const keys = ['minPercent', 'maxPercent', 'goldMaxPercent', 'expectedVersion'];
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== keys.length || !keys.every((key) => Object.hasOwn(input, key)) ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    const minBps = toBps(input.minPercent);
    const maxBps = toBps(input.maxPercent);
    const goldMaxBps = toBps(input.goldMaxPercent);
    if (minBps === null || maxBps === null || goldMaxBps === null || minBps > maxBps || maxBps > goldMaxBps) return { code: 'invalid' };
    return transaction(() => {
      const current = read();
      if (current.version !== input.expectedVersion) return { code: 'conflict', policy: current };
      insert.run(current.version + 1, minBps, maxBps, goldMaxBps, new Date().toISOString(), 'admin');
      return { code: 'ok', policy: read() };
    });
  }
  return { read, publish, bounds };
}

module.exports = { createOfferPolicy, DEFAULTS, MAX_PERCENT };
