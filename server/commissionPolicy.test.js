const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createCommissionPolicy } = require('./commissionPolicy');

function open(file = ':memory:') {
  const database = new DatabaseSync(file);
  const policy = createCommissionPolicy({ database, transaction(fn) {
    database.exec('BEGIN IMMEDIATE');
    try { const result = fn(); database.exec('COMMIT'); return result; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  } });
  return { database, policy };
}
test('approved default is 25%, read-only, and each deployment is isolated', () => {
  const a = open(), b = open();
  try {
    assert.deepEqual(a.policy.read(), { version: 0, ratePercent: 25, effectiveAt: null });
    assert.equal(a.database.prepare('SELECT COUNT(*) AS n FROM commission_policy_versions').get().n, 0);
    a.policy.publish({ ratePercent: 18.25, expectedVersion: 0 });
    assert.equal(a.policy.read().ratePercent, 18.25);
    assert.equal(b.policy.read().ratePercent, 25);
  } finally { a.database.close(); b.database.close(); }
});
test('rejects invalid rates, selectors and unknown fields without writing', () => {
  const { database, policy } = open();
  try {
    for (const value of [-1, 101, 12.345, NaN, Infinity, '25', null, true]) {
      assert.equal(policy.publish({ ratePercent: value, expectedVersion: 0 }).code, 'invalid');
    }
    for (const value of [null, [], {}, { ratePercent: 25 }, { ratePercent: 25, expectedVersion: '0' },
      { ratePercent: 25, expectedVersion: 0, companyId: 'other' }]) assert.equal(policy.publish(value).code, 'invalid');
    assert.equal(policy.read().version, 0);
    for (const ratePercent of [0, 100, 12.34]) {
      assert.equal(policy.publish({ ratePercent, expectedVersion: policy.read().version }).code, 'ok');
      assert.equal(policy.read().ratePercent, ratePercent);
    }
  } finally { database.close(); }
});
test('stale writers cannot overwrite newer policy, history cannot be edited or replaced', () => {
  const { database, policy } = open();
  try {
    assert.equal(policy.publish({ ratePercent: 20, expectedVersion: 0 }).code, 'ok');
    assert.equal(policy.publish({ ratePercent: 30, expectedVersion: 0 }).code, 'conflict');
    assert.equal(policy.publish({ ratePercent: 22, expectedVersion: 1 }).code, 'ok');
    for (const sql of [
      'UPDATE commission_policy_versions SET rateBps = 1 WHERE version = 1',
      'DELETE FROM commission_policy_versions WHERE version = 1',
      "INSERT OR REPLACE INTO commission_policy_versions VALUES (1, 1, 'now', 'admin')",
    ]) assert.throws(() => database.exec(sql), /immutable/);
    assert.deepEqual(database.prepare('SELECT rateBps FROM commission_policy_versions ORDER BY version').all().map(r => r.rateBps), [2000, 2200]);
  } finally { database.close(); }
});
test('persists across reconnect and failed SQLite insert preserves previous policy', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'paksho-commission-'));
  let current;
  try {
    const file = path.join(dir, 'test.sqlite');
    current = open(file);
    current.policy.publish({ ratePercent: 19.5, expectedVersion: 0 });
    const saved = current.policy.read();
    current.database.close(); current = open(file);
    assert.deepEqual(current.policy.read(), saved);
    current.database.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON commission_policy_versions BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => current.policy.publish({ ratePercent: 10, expectedVersion: 1 }), /test failure/);
    assert.deepEqual(current.policy.read(), saved);
  } finally {
    current?.database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
