'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readSourceIdentity, sourceIdentityCacheKey, sourceIdentityScriptJson } = require('../tools/sourceIdentity.cjs');

test('source identity uses actual Git and includes dirty, untracked and detached states in its cache key', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-source-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git('init', '-q', '-b', 'fixture-branch');
  fs.writeFileSync(path.join(root, 'source.txt'), 'committed');
  git('add', 'source.txt');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const clean = readSourceIdentity(root);
  assert.deepEqual(clean, { commit: git('rev-parse', 'HEAD'), branch: 'fixture-branch', detached: false, dirty: false });
  fs.writeFileSync(path.join(root, 'source.txt'), 'edited');
  const dirty = readSourceIdentity(root);
  assert.equal(dirty.dirty, true);
  assert.notEqual(sourceIdentityCacheKey(dirty), sourceIdentityCacheKey(clean));
  git('checkout', '--', 'source.txt');
  fs.writeFileSync(path.join(root, 'untracked.txt'), 'not committed');
  assert.equal(readSourceIdentity(root).dirty, true);
  fs.rmSync(path.join(root, 'untracked.txt'));
  git('checkout', '-q', '--detach');
  const detached = readSourceIdentity(root);
  assert.equal(detached.commit, clean.commit);
  assert.equal(detached.branch, null);
  assert.equal(detached.detached, true);
  assert.notEqual(sourceIdentityCacheKey(detached), sourceIdentityCacheKey(clean));
});

test('missing or broken Git stays unknown even with claimed environment metadata', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-source-unknown-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previous = process.env.EXPO_PUBLIC_SOURCE_SHA;
  process.env.EXPO_PUBLIC_SOURCE_SHA = 'a'.repeat(40);
  t.after(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_SOURCE_SHA;
    else process.env.EXPO_PUBLIC_SOURCE_SHA = previous;
  });
  const unknown = { commit: null, branch: null, detached: null, dirty: null };
  assert.deepEqual(readSourceIdentity(root), unknown);
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: nonexistent-fixture');
  assert.deepEqual(readSourceIdentity(root), unknown);
});

test('Babel embeds the actual source identity literal and Metro includes the same cache identity', () => {
  const babel = require('@babel/core');
  const root = path.join(__dirname, '..');
  const result = babel.transformFileSync(path.join(root, 'src/config/buildIdentity.ts'), {
    configFile: path.join(root, 'babel.config.js'), ast: true,
    caller: { name: 'metro', platform: 'android', supportsStaticESM: true },
  });
  let embedded;
  babel.traverse(result.ast, {
    VariableDeclarator(nodePath) {
      if (nodePath.node.id.name !== 'BUILD_IDENTITY') return;
      embedded = Object.fromEntries(nodePath.node.init.properties.map((item) => [item.key.name, item.value.value ?? null]));
    },
  });
  const actual = readSourceIdentity(root);
  assert.deepEqual(embedded, actual);
  assert.equal(result.code.includes('node:child_process'), false);
  assert.equal(result.code.includes(root), false);
  const metro = require('../metro.config');
  assert.equal(metro.cacheVersion.endsWith(`paksho-source:${sourceIdentityCacheKey(actual)}`), true);
});

test('admin identity JSON cannot break out of an inline script and retains the original branch as text', () => {
  const identity = { commit: 'a'.repeat(40), branch: '</script><img src=x onerror=alert(1)>&\u2028\u2029', detached: false, dirty: false };
  const encoded = sourceIdentityScriptJson(identity);
  assert.equal(/[<>&\u2028\u2029]/.test(encoded), false);
  assert.deepEqual(JSON.parse(encoded), identity);
});
