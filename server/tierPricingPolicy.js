'use strict';
// D-82: ضریب سطح سفارش معمولی. جدا از offer_policy (پیشنهاد آزاد متخصص).
// خاکستری همیشه ۱۰۰٪ است و ذخیره نمی‌شود. نقره‌ای و طلایی نسخه‌دار و تغییرناپذیرند.
const DEFAULTS = Object.freeze({ silverBps: 11000, goldBps: 13000 });
const GRAY_BPS = 10000;
const MAX_PERCENT = 300;
const TIER_RANK = Object.freeze({ gray: 0, silver: 1, gold: 2, gold_plus: 3 });

function toBps(value) {
  return Number.isSafeInteger(value) && value >= 100 && value <= MAX_PERCENT ? value * 100 : null;
}

function createTierPricingPolicy({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tier_pricing_policy (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      silverBps INTEGER NOT NULL,
      goldBps INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      actor TEXT NOT NULL,
      CHECK (silverBps >= ${GRAY_BPS} AND silverBps <= goldBps AND goldBps <= ${MAX_PERCENT * 100})
    );
    CREATE TRIGGER IF NOT EXISTS tier_pricing_policy_no_update
    BEFORE UPDATE ON tier_pricing_policy
    BEGIN SELECT RAISE(ABORT, 'tier pricing policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS tier_pricing_policy_no_delete
    BEFORE DELETE ON tier_pricing_policy
    BEGIN SELECT RAISE(ABORT, 'tier pricing policy history is immutable'); END;
  `);
  const latest = database.prepare('SELECT * FROM tier_pricing_policy ORDER BY version DESC LIMIT 1');
  const insert = database.prepare(
    'INSERT INTO tier_pricing_policy (version, silverBps, goldBps, createdAt, actor) VALUES (?, ?, ?, ?, ?)'
  );

  function bounds() {
    const row = latest.get();
    if (!row) return { silverBps: DEFAULTS.silverBps, goldBps: DEFAULTS.goldBps, version: 0 };
    return { silverBps: row.silverBps, goldBps: row.goldBps, version: row.version };
  }

  function basisPointsFor(tierKey) {
    const current = bounds();
    if (tierKey === 'gold') return { basisPoints: current.goldBps, version: current.version };
    if (tierKey === 'silver') return { basisPoints: current.silverBps, version: current.version };
    return { basisPoints: GRAY_BPS, version: current.version };
  }

  function read() {
    const current = bounds();
    const row = latest.get();
    return {
      version: current.version,
      grayPercent: GRAY_BPS / 100,
      silverPercent: current.silverBps / 100,
      goldPercent: current.goldBps / 100,
      effectiveAt: row ? row.createdAt : null,
    };
  }

  function publish(input) {
    const keys = ['silverPercent', 'goldPercent', 'expectedVersion'];
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== keys.length || !keys.every((key) => Object.hasOwn(input, key)) ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    const silverBps = toBps(input.silverPercent);
    const goldBps = toBps(input.goldPercent);
    if (silverBps === null || goldBps === null || silverBps > goldBps) return { code: 'invalid' };
    return transaction(() => {
      const current = read();
      if (current.version !== input.expectedVersion) return { code: 'conflict', policy: current };
      insert.run(current.version + 1, silverBps, goldBps, new Date().toISOString(), 'admin');
      return { code: 'ok', policy: read() };
    });
  }

  return { read, publish, bounds, basisPointsFor };
}

function workerMeetsRequestedTier(workerTierKey, requestedTier) {
  const need = Object.hasOwn(TIER_RANK, requestedTier) ? TIER_RANK[requestedTier] : TIER_RANK.gray;
  const have = Object.hasOwn(TIER_RANK, workerTierKey) ? TIER_RANK[workerTierKey] : TIER_RANK.gray;
  return have >= need;
}

module.exports = { createTierPricingPolicy, workerMeetsRequestedTier, DEFAULTS, GRAY_BPS, MAX_PERCENT };
