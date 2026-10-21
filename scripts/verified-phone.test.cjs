'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, validateSource, packageFromBadging, installedHash } = require('./verified-phone.cjs');
const commit = 'a'.repeat(40);
const opts = { branch: 'agent/work', commit };
const good = { root: 'repo', expectedRoot: 'repo', remote: 'antigravity1344-code/my-mobile-app',
  branch: opts.branch, commit, status: '' };
test('requires explicit full SHA and role', () => {
  assert.throws(() => parse(['check', '--branch', opts.branch, '--role', 'customer']), /commit/);
  assert.throws(() => parse(['check', '--commit', 'b74dd66', '--branch', opts.branch, '--role', 'customer']), /commit/);
});
test('installation requires an explicit phone and rejects extra switches', () => {
  const args = ['build-install', '--commit', commit, '--branch', opts.branch, '--role', 'worker'];
  assert.throws(() => parse([...args]), /serial/);
  assert.equal(parse([...args, '--serial', 'R83X900E9CB']).serial, 'R83X900E9CB');
  assert.throws(() => parse([...args, '--force']), /Unknown/);
  assert.throws(() => parse([...args, '--role', 'customer']), /Duplicate/);
});
for (const [field, value] of Object.entries({
  root: 'other', remote: 'other/repo', branch: 'old-branch', commit: 'b'.repeat(40),
  status: ' M src/changed.ts',
})) {
  test('rejects source mismatch: ' + field, () => {
    assert.throws(() => validateSource({ ...good, [field]: value }, opts));
  });
}
test('rejects untracked changes as well as tracked changes', () => {
  assert.throws(() => validateSource({ ...good, status: '?? new-file.ts' }, opts), /Uncommitted/);
  assert.doesNotThrow(() => validateSource(good, opts));
});
test('parses the actual APK package rather than filename', () => {
  assert.equal(packageFromBadging("package: name='com.paksho.worker' versionCode='1'"), 'com.paksho.worker');
  assert.throws(() => packageFromBadging('app-worker-debug.apk'), /Cannot/);
});
test('installed APK must have the exact artifact hash', () => {
  const hash = 'c'.repeat(64);
  assert.doesNotThrow(() => installedHash(hash + '  /data/app/base.apk', hash));
  assert.throws(() => installedHash('d'.repeat(64) + ' base.apk', hash), /does not match/);
  assert.throws(() => installedHash('Permission denied', hash), /Cannot/);
});
