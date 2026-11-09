'use strict';
// D-81: حدود قیمت پیشنهاد متخصص برای هر استقرار (هر شرکت یک پایگاه‌داده). نسخه‌دار و تغییرناپذیر؛
// انتشار نسخهٔ تازه پیشنهادهای ثبت‌شدهٔ قبلی را عوض نمی‌کند.
// بدون نسخه، پیش‌فرض ۷۰٪ / خاکستری ۱۰۰٪ / نقره‌ای ۱۱۰٪ / طلایی ۱۳۰٪ است.
const DEFAULTS = Object.freeze({ minBps: 7000, maxBps: 10000, silverMaxBps: 11000, goldMaxBps: 13000 });
const MAX_PERCENT = 300;

function toBps(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_PERCENT ? value * 100 : null;
}

function createOfferPolicy({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS offer_policy_versions (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      minBps INTEGER NOT NULL, maxBps INTEGER NOT NULL, silverMaxBps INTEGER NOT NULL, goldMaxBps INTEGER NOT NULL,
      createdAt TEXT NOT NULL, actor TEXT NOT NULL,
      CHECK (minBps >= 100 AND minBps <= maxBps AND maxBps <= silverMaxBps AND silverMaxBps <= goldMaxBps AND goldMaxBps <= ${MAX_PERCENT * 100})
    );
    CREATE TRIGGER IF NOT EXISTS offer_policy_no_update
    BEFORE UPDATE ON offer_policy_versions
    BEGIN SELECT RAISE(ABORT, 'offer policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS offer_policy_no_delete
    BEFORE DELETE ON offer_policy_versions
    BEGIN SELECT RAISE(ABORT, 'offer policy history is immutable'); END;
  `);
  const columns = new Set(database.prepare('PRAGMA table_info(offer_policy_versions)').all().map((column) => column.name));
  if (!columns.has('silverMaxBps')) {
    database.exec('ALTER TABLE offer_policy_versions ADD COLUMN silverMaxBps INTEGER NOT NULL DEFAULT 11000');
  }
  const latest = database.prepare('SELECT * FROM offer_policy_versions ORDER BY version DESC LIMIT 1');
  const insert = database.prepare('INSERT INTO offer_policy_versions (version, minBps, maxBps, silverMaxBps, goldMaxBps, createdAt, actor) VALUES (?, ?, ?, ?, ?, ?, ?)');

  function fromRow(row) {
    if (!row) return { ...DEFAULTS };
    // نسخه‌های قدیمی ستون نقره‌ای نداشتند. اگر سقف خاکستری بالاتر از پیش‌فرض نقره‌ای مانده، نقره‌ای به همان سقف می‌رسد تا از خاکستری پایین‌تر نشود.
    let silverMaxBps = Number.isSafeInteger(row.silverMaxBps) ? row.silverMaxBps : DEFAULTS.silverMaxBps;
    if (silverMaxBps < row.maxBps) silverMaxBps = row.maxBps;
    if (silverMaxBps > row.goldMaxBps) silverMaxBps = row.goldMaxBps;
    return { minBps: row.minBps, maxBps: row.maxBps, silverMaxBps, goldMaxBps: row.goldMaxBps };
  }

  /** نمای داخلی بر حسب basis points (برای اعتبارسنجی پیشنهاد). */
  function bounds() {
    return fromRow(latest.get());
  }
  function read() {
    const row = latest.get();
    const b = fromRow(row);
    return {
      version: row ? row.version : 0,
      minPercent: b.minBps / 100,
      maxPercent: b.maxBps / 100,
      silverMaxPercent: b.silverMaxBps / 100,
      goldMaxPercent: b.goldMaxBps / 100,
      effectiveAt: row ? row.createdAt : null,
    };
  }
  function publish(input) {
    const keys = ['minPercent', 'maxPercent', 'silverMaxPercent', 'goldMaxPercent', 'expectedVersion'];
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== keys.length || !keys.every((key) => Object.hasOwn(input, key)) ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    const minBps = toBps(input.minPercent);
    const maxBps = toBps(input.maxPercent);
    const silverMaxBps = toBps(input.silverMaxPercent);
    const goldMaxBps = toBps(input.goldMaxPercent);
    if (minBps === null || maxBps === null || silverMaxBps === null || goldMaxBps === null ||
        minBps > maxBps || maxBps > silverMaxBps || silverMaxBps > goldMaxBps) return { code: 'invalid' };
    return transaction(() => {
      const current = read();
      if (current.version !== input.expectedVersion) return { code: 'conflict', policy: current };
      insert.run(current.version + 1, minBps, maxBps, silverMaxBps, goldMaxBps, new Date().toISOString(), 'admin');
      return { code: 'ok', policy: read() };
    });
  }
  return { read, publish, bounds };
}

module.exports = { createOfferPolicy, DEFAULTS, MAX_PERCENT };
