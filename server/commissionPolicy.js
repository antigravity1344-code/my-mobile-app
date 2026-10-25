// D-77: one company per existing deployment/SQLite database. This stores rates,
// not payments; publishing a rate never rewrites a completed order.
const DEFAULT_COMMISSION_BPS = 2500;

function rateToBasisPoints(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-9 ? rounded : null;
}

function createCommissionPolicy({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS commission_policy_versions (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      rateBps INTEGER NOT NULL CHECK (rateBps BETWEEN 0 AND 10000),
      createdAt TEXT NOT NULL,
      actor TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS commission_policy_no_update
    BEFORE UPDATE ON commission_policy_versions
    BEGIN SELECT RAISE(ABORT, 'commission policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS commission_policy_no_delete
    BEFORE DELETE ON commission_policy_versions
    BEGIN SELECT RAISE(ABORT, 'commission policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS commission_policy_no_replace
    BEFORE INSERT ON commission_policy_versions
    WHEN EXISTS (SELECT 1 FROM commission_policy_versions WHERE version = NEW.version)
    BEGIN SELECT RAISE(ABORT, 'commission policy history is immutable'); END;
  `);
  const latest = database.prepare('SELECT version, rateBps, createdAt FROM commission_policy_versions ORDER BY version DESC LIMIT 1');
  const insert = database.prepare('INSERT INTO commission_policy_versions (version, rateBps, createdAt, actor) VALUES (?, ?, ?, ?)');
  function read() {
    const row = latest.get();
    return row ? { version: row.version, ratePercent: row.rateBps / 100, effectiveAt: row.createdAt }
      : { version: 0, ratePercent: DEFAULT_COMMISSION_BPS / 100, effectiveAt: null };
  }
  function publish(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== 2 || !Object.hasOwn(input, 'ratePercent') || !Object.hasOwn(input, 'expectedVersion') ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    const bps = rateToBasisPoints(input.ratePercent);
    if (bps === null) return { code: 'invalid' };
    return transaction(() => {
      const current = read();
      if (current.version !== input.expectedVersion) return { code: 'conflict', policy: current };
      insert.run(current.version + 1, bps, new Date().toISOString(), 'admin');
      return { code: 'ok', policy: read() };
    });
  }
  return { read, publish };
}

module.exports = { createCommissionPolicy, rateToBasisPoints };
