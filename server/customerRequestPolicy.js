'use strict';
// حدود قیمت درخواست ساعت دلخواه مشتری (تبصرهٔ مصوب ۸ نوامبر ۲۰۲۶). جدا از حدود متخصص.
// نسخه‌دار و تغییرناپذیر: انتشار نسخهٔ تازه، درخواست‌های ثبت‌شده را عوض نمی‌کند.
// بدون نسخه، پیش‌فرض ۷۰٪ تا ۱۳۰٪ تعرفه است.
const DEFAULTS = Object.freeze({ minBps: 7000, maxBps: 13000 });
const MAX_PERCENT = 300;

function toBps(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_PERCENT ? value * 100 : null;
}

function createCustomerRequestPolicy({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_request_policy_versions (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      minBps INTEGER NOT NULL, maxBps INTEGER NOT NULL,
      createdAt TEXT NOT NULL, actor TEXT NOT NULL,
      CHECK (minBps >= 100 AND minBps <= maxBps AND maxBps <= ${MAX_PERCENT * 100})
    );
    CREATE TRIGGER IF NOT EXISTS customer_request_policy_no_update
    BEFORE UPDATE ON customer_request_policy_versions
    BEGIN SELECT RAISE(ABORT, 'customer request policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS customer_request_policy_no_delete
    BEFORE DELETE ON customer_request_policy_versions
    BEGIN SELECT RAISE(ABORT, 'customer request policy history is immutable'); END;
  `);
  const latest = database.prepare('SELECT * FROM customer_request_policy_versions ORDER BY version DESC LIMIT 1');
  const insert = database.prepare('INSERT INTO customer_request_policy_versions (version, minBps, maxBps, createdAt, actor) VALUES (?, ?, ?, ?, ?)');

  /** حدود داخلی بر حسب basis points؛ برای اعتبارسنجی درخواست. */
  function bounds() {
    const row = latest.get();
    return row ? { minBps: row.minBps, maxBps: row.maxBps } : { ...DEFAULTS };
  }
  function read() {
    const row = latest.get();
    const b = row ? { minBps: row.minBps, maxBps: row.maxBps } : DEFAULTS;
    return {
      version: row ? row.version : 0,
      minPercent: b.minBps / 100,
      maxPercent: b.maxBps / 100,
      effectiveAt: row ? row.createdAt : null,
    };
  }
  function publish(input) {
    const keys = ['minPercent', 'maxPercent', 'expectedVersion'];
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== keys.length || !keys.every((key) => Object.hasOwn(input, key)) ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    const minBps = toBps(input.minPercent);
    const maxBps = toBps(input.maxPercent);
    if (minBps === null || maxBps === null || minBps > maxBps) return { code: 'invalid' };
    return transaction(() => {
      const current = read();
      if (current.version !== input.expectedVersion) return { code: 'conflict', policy: current };
      insert.run(current.version + 1, minBps, maxBps, new Date().toISOString(), 'admin');
      return { code: 'ok', policy: read() };
    });
  }
  return { read, publish, bounds };
}

module.exports = { createCustomerRequestPolicy, CUSTOMER_REQUEST_POLICY_DEFAULTS: DEFAULTS };
