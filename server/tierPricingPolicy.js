'use strict';
// D-82: ضریب سطح سفارش معمولی. جدا از offer_policy (پیشنهاد آزاد متخصص).
// خاکستری همیشه ۱۰۰٪ است و ذخیره نمی‌شود. نقره‌ای و طلایی نسخه‌دار و تغییرناپذیرند.
const DEFAULTS = Object.freeze({ silverBps: 11000, goldBps: 13000, goldenRequestBps: 13000, windowMinutes: 30 });
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
      goldenRequestBps INTEGER NOT NULL DEFAULT ${DEFAULTS.goldenRequestBps},
      windowMinutes INTEGER NOT NULL DEFAULT ${DEFAULTS.windowMinutes},
      CHECK (silverBps >= ${GRAY_BPS} AND silverBps <= goldBps AND goldBps <= ${MAX_PERCENT * 100}),
      CHECK (goldenRequestBps >= 100 AND goldenRequestBps <= ${MAX_PERCENT * 100}),
      CHECK (windowMinutes >= 1 AND windowMinutes <= 1440)
    );
    CREATE TRIGGER IF NOT EXISTS tier_pricing_policy_no_update
    BEFORE UPDATE ON tier_pricing_policy
    BEGIN SELECT RAISE(ABORT, 'tier pricing policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS tier_pricing_policy_no_delete
    BEFORE DELETE ON tier_pricing_policy
    BEGIN SELECT RAISE(ABORT, 'tier pricing policy history is immutable'); END;
  `);
  const columns = new Set(database.prepare('PRAGMA table_info(tier_pricing_policy)').all().map((column) => column.name));
  if (!columns.has('goldenRequestBps')) {
    database.exec(`ALTER TABLE tier_pricing_policy ADD COLUMN goldenRequestBps INTEGER NOT NULL DEFAULT ${DEFAULTS.goldenRequestBps}`);
  }
  if (!columns.has('windowMinutes')) {
    database.exec(`ALTER TABLE tier_pricing_policy ADD COLUMN windowMinutes INTEGER NOT NULL DEFAULT ${DEFAULTS.windowMinutes}`);
  }
  const latest = database.prepare('SELECT * FROM tier_pricing_policy ORDER BY version DESC LIMIT 1');
  const insert = database.prepare(
    'INSERT INTO tier_pricing_policy (version, silverBps, goldBps, goldenRequestBps, windowMinutes, createdAt, actor) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  function bounds() {
    const row = latest.get();
    if (!row) {
      return {
        silverBps: DEFAULTS.silverBps, goldBps: DEFAULTS.goldBps,
        goldenRequestBps: DEFAULTS.goldenRequestBps, windowMinutes: DEFAULTS.windowMinutes, version: 0,
      };
    }
    return {
      silverBps: row.silverBps,
      goldBps: row.goldBps,
      goldenRequestBps: Number.isSafeInteger(row.goldenRequestBps) ? row.goldenRequestBps : DEFAULTS.goldenRequestBps,
      windowMinutes: Number.isSafeInteger(row.windowMinutes) ? row.windowMinutes : DEFAULTS.windowMinutes,
      version: row.version,
    };
  }

  function goldenRequest() {
    const current = bounds();
    return { basisPoints: current.goldenRequestBps, version: current.version, windowMinutes: current.windowMinutes };
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
      goldenRequestPercent: current.goldenRequestBps / 100,
      windowMinutes: current.windowMinutes,
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
      const kept = bounds();
      insert.run(current.version + 1, silverBps, goldBps, kept.goldenRequestBps, kept.windowMinutes, new Date().toISOString(), 'admin');
      return { code: 'ok', policy: read() };
    });
  }

  function publishGoldenRequest(input) {
    const keys = ['percent', 'windowMinutes', 'expectedVersion'];
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== keys.length || !keys.every((key) => Object.hasOwn(input, key)) ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    const goldenRequestBps = Number.isSafeInteger(input.percent) && input.percent >= 1 && input.percent <= MAX_PERCENT ? input.percent * 100 : null;
    if (goldenRequestBps === null || !Number.isSafeInteger(input.windowMinutes) || input.windowMinutes < 1 || input.windowMinutes > 1440) {
      return { code: 'invalid' };
    }
    return transaction(() => {
      const current = read();
      if (current.version !== input.expectedVersion) return { code: 'conflict', policy: current };
      const kept = bounds();
      insert.run(current.version + 1, kept.silverBps, kept.goldBps, goldenRequestBps, input.windowMinutes, new Date().toISOString(), 'admin');
      return { code: 'ok', policy: read() };
    });
  }

  return { read, publish, publishGoldenRequest, bounds, basisPointsFor, goldenRequest };
}

function workerMeetsRequestedTier(workerTierKey, requestedTier) {
  const need = Object.hasOwn(TIER_RANK, requestedTier) ? TIER_RANK[requestedTier] : TIER_RANK.gray;
  const have = Object.hasOwn(TIER_RANK, workerTierKey) ? TIER_RANK[workerTierKey] : TIER_RANK.gray;
  return have >= need;
}

module.exports = { createTierPricingPolicy, workerMeetsRequestedTier, DEFAULTS, GRAY_BPS, MAX_PERCENT };
