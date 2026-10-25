// Each deployment belongs to one company. Requests must copy this policy at
// their first successful submission; re-reading it on confirmation is unsafe.
const MODES = Object.freeze(['customer_confirmation', 'worker_only']);
function createCompletionPolicy({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS completion_policy_versions (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      mode TEXT NOT NULL CHECK (mode IN ('customer_confirmation', 'worker_only')),
      createdAt TEXT NOT NULL,
      actor TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS completion_policy_no_update
    BEFORE UPDATE ON completion_policy_versions
    BEGIN SELECT RAISE(ABORT, 'completion policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS completion_policy_no_delete
    BEFORE DELETE ON completion_policy_versions
    BEGIN SELECT RAISE(ABORT, 'completion policy history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS completion_policy_no_replace
    BEFORE INSERT ON completion_policy_versions
    WHEN EXISTS (SELECT 1 FROM completion_policy_versions WHERE version = NEW.version)
    BEGIN SELECT RAISE(ABORT, 'completion policy history is immutable'); END;
  `);
  const latest = database.prepare('SELECT version, mode, createdAt FROM completion_policy_versions ORDER BY version DESC LIMIT 1');
  const insert = database.prepare('INSERT INTO completion_policy_versions (version, mode, createdAt, actor) VALUES (?, ?, ?, ?)');
  function read() {
    const row = latest.get();
    return row ? { version: row.version, mode: row.mode, effectiveAt: row.createdAt }
      : { version: 0, mode: 'customer_confirmation', effectiveAt: null };
  }
  function publish(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== 2 || !Object.hasOwn(input, 'mode') || !Object.hasOwn(input, 'expectedVersion') ||
        !MODES.includes(input.mode) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    return transaction(() => {
      const current = read();
      if (current.version !== input.expectedVersion) return { code: 'conflict', policy: current };
      insert.run(current.version + 1, input.mode, new Date().toISOString(), 'admin');
      return { code: 'ok', policy: read() };
    });
  }
  return { read, publish };
}
module.exports = { createCompletionPolicy };
