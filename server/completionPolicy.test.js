const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createCompletionPolicy } = require('./completionPolicy');
function open(file = ':memory:') {
  const database = new DatabaseSync(file);
  const policy = createCompletionPolicy({ database, transaction(fn) {
    database.exec('BEGIN IMMEDIATE');
    try { const value = fn(); database.exec('COMMIT'); return value; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  } });
  return { database, policy };
}
test('default requires customer confirmation and reading never inserts a version', () => {
  const { database, policy } = open();
  try {
    assert.deepEqual(policy.read(), { version: 0, mode: 'customer_confirmation', effectiveAt: null });
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM completion_policy_versions').get().n, 0);
  } finally { database.close(); }
});
test('publishes both modes with version conflict protection and isolated deployments', () => {
  const a = open(), b = open();
  try {
    const prior = a.policy.read();
    assert.equal(a.policy.publish({ mode: 'worker_only', expectedVersion: 0 }).code, 'ok');
    assert.equal(a.policy.read().mode, 'worker_only');
    assert.equal(b.policy.read().mode, 'customer_confirmation');
    assert.equal(prior.mode, 'customer_confirmation');
    assert.equal(a.policy.publish({ mode: 'customer_confirmation', expectedVersion: 0 }).code, 'conflict');
    assert.equal(a.policy.publish({ mode: 'customer_confirmation', expectedVersion: 1 }).code, 'ok');
    assert.equal(a.policy.read().version, 2);
    assert.deepEqual(a.database.prepare('SELECT mode FROM completion_policy_versions ORDER BY version').all().map(r => r.mode), ['worker_only','customer_confirmation']);
  } finally { a.database.close(); b.database.close(); }
});
test('rejects unknown modes, account selectors, coercion and malformed versions', () => {
  const { database, policy } = open();
  try {
    for (const input of [null, [], {}, {mode:'admin_only',expectedVersion:0}, {mode:'worker_only',expectedVersion:'0'},
      {mode:'worker_only',expectedVersion:-1}, {mode:'worker_only',expectedVersion:0.5},
      {mode:'worker_only',expectedVersion:0,companyId:'other'}, {mode:'worker_only',expectedVersion:0,actor:'other'}]) {
      assert.equal(policy.publish(input).code, 'invalid');
    }
    assert.equal(policy.read().version, 0);
  } finally { database.close(); }
});
test('immutable history rejects update, delete and replace; failed publication rolls back', () => {
  const { database, policy } = open();
  try {
    policy.publish({mode:'worker_only',expectedVersion:0});
    const prior = policy.read();
    for (const sql of ["UPDATE completion_policy_versions SET mode='customer_confirmation'", 'DELETE FROM completion_policy_versions',
      "INSERT OR REPLACE INTO completion_policy_versions VALUES (1,'customer_confirmation','now','admin')"]) {
      assert.throws(() => database.exec(sql), /immutable/);
    }
    database.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON completion_policy_versions BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => policy.publish({mode:'customer_confirmation',expectedVersion:1}), /test failure/);
    assert.deepEqual(policy.read(), prior);
  } finally { database.close(); }
});
test('policy survives a new SQLite connection', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'paksho-completion-policy-'));
  let instance;
  try {
    const file = path.join(dir,'test.sqlite');
    instance = open(file);
    instance.policy.publish({mode:'worker_only',expectedVersion:0});
    const saved = instance.policy.read();
    instance.database.close(); instance = open(file);
    assert.deepEqual(instance.policy.read(), saved);
  } finally { instance?.database.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
