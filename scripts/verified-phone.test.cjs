'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, validateSource, packageFromBadging, installedHash, deviceApkPath,
  checkForeground, verifyInstalledWorkflow, buildInstallWorkflow, buildInvocation, LAB_API_URL } = require('./verified-phone.cjs');
const commit = 'a'.repeat(40);
const opts = { branch: 'agent/work', commit, role: 'customer', serial: 'R83X900E9CB', 'api-url': LAB_API_URL };
const good = { root: 'repo', expectedRoot: 'repo', remote: 'antigravity1344-code/my-mobile-app',
  branch: opts.branch, commit, status: '' };
const buildArgs = ['build-install', '--commit', commit, '--branch', opts.branch,
  '--role', 'customer', '--serial', opts.serial];
test('requires an explicit full SHA and rejects missing expected source', () => {
  assert.throws(() => parse(['check', '--branch', opts.branch, '--role', 'customer']), /commit/);
  assert.throws(() => parse(['check', '--commit', 'b74dd66', '--branch', opts.branch, '--role', 'customer']), /commit/);
});
test('only own customer and worker role keys are accepted', () => {
  for (const role of ['constructor', 'toString', '__proto__', 'admin', '']) {
    assert.throws(() => parse(['check', '--commit', commit, '--branch', opts.branch, '--role', role]), /role/);
  }
  assert.equal(parse(['check', '--commit', commit, '--branch', opts.branch, '--role', 'worker']).role, 'worker');
});
test('build requires explicit exact loopback lab API, never an implicit .env default', () => {
  for (const value of [undefined, 'http://192.168.1.2:3000/api', 'https://production.example/api', LAB_API_URL + '/']) {
    const args = value === undefined ? buildArgs : [...buildArgs, '--api-url', value];
    assert.throws(() => parse([...args]), /api-url/);
  }
  assert.equal(parse([...buildArgs, '--api-url', LAB_API_URL])['api-url'], LAB_API_URL);
});
test('explicit phone, valid switches and unique arguments are required', () => {
  assert.throws(() => parse(buildArgs.slice(0, -2)), /serial/);
  assert.throws(() => parse([...buildArgs, '--force']), /Unknown/);
  assert.throws(() => parse([...buildArgs, '--role', 'worker']), /Duplicate/);
});
test('verify-installed requires an artifact and device but no current Git source', () => {
  const args = ['verify-installed', '--role', 'customer', '--serial', opts.serial, '--apk', 'old.apk'];
  assert.equal(parse([...args]).apk, 'old.apk');
  assert.throws(() => parse([...args, '--commit', commit]), /Unknown/);
  assert.throws(() => parse(args.slice(0, -2)), /apk/);
});
for (const [field, value] of Object.entries({
  root: 'other', remote: 'other/repo', branch: 'old-branch', commit: 'b'.repeat(40),
  status: ' M src/changed.ts',
})) {
  test('rejects source mismatch: ' + field, () => {
    assert.throws(() => validateSource({ ...good, [field]: value }, opts));
  });
}
test('rejects untracked work without deleting or stashing it', () => {
  assert.throws(() => validateSource({ ...good, status: '?? new-file.ts' }, opts), /Uncommitted/);
  assert.doesNotThrow(() => validateSource(good, opts));
});
test('APK package is parsed from metadata, not filename', () => {
  assert.equal(packageFromBadging("package: name='com.paksho.worker' versionCode='1'"), 'com.paksho.worker');
  assert.throws(() => packageFromBadging('app-worker-debug.apk'), /Cannot/);
});
test('installed path requires a single base APK and rejects unexpected shell content', () => {
  assert.equal(deviceApkPath('package:/data/app/~~abc==/pkg-xyz==/base.apk\n'), '/data/app/~~abc==/pkg-xyz==/base.apk');
  for (const value of ['package:/data/app/base.apk;bad', 'package:/data/app/base.apk\npackage:/data/app/split.apk', 'denied']) {
    assert.throws(() => deviceApkPath(value));
  }
});
test('artifact hash mismatch and missing hash fail', () => {
  const hash = 'c'.repeat(64);
  assert.doesNotThrow(() => installedHash(hash + ' /data/app/base.apk', hash));
  assert.throws(() => installedHash('d'.repeat(64) + ' base.apk', hash), /does not match/);
  assert.throws(() => installedHash('Permission denied', hash), /Cannot/);
});
test('foreground must be the exact role package under user 0', () => {
  assert.doesNotThrow(() => checkForeground('customer', 'mResumedActivity: ActivityRecord{abc u0 com.paksho.customer/.MainActivity}'));
  for (const value of ['mResumedActivity: u150 com.paksho.customer/.MainActivity',
    'mResumedActivity: u0 com.paksho.customer.uxpreview/.MainActivity',
    'mResumedActivity: u0 com.paksho.worker/.MainActivity', 'com.paksho.customer/.MainActivity']) {
    assert.throws(() => checkForeground('customer', value), /foreground/);
  }
});
test('Windows invocation rebuilds only JS task and pins lab API in child environment', () => {
  const env = { ComSpec: 'C:\\Windows\\System32\\cmd.exe', EXPO_PUBLIC_API_URL: 'http://old/api',
    GIT_WORK_TREE: 'other', KEEP: 'yes' };
  const result = buildInvocation(opts, 'C:\\project with spaces', env);
  assert.equal(result.exe, env.ComSpec);
  assert.deepEqual(result.args, ['/d', '/c', 'gradlew.bat',
    ':app:createBundleCustomerDebugJsAndAssets', '--rerun', ':app:assembleCustomerDebug',
    '-PreactNativeArchitectures=arm64-v8a']);
  assert.equal(result.options.env.EXPO_PUBLIC_API_URL, LAB_API_URL);
  assert.equal(result.options.env.EXPO_NO_CACHE, '1');
  assert.equal(result.options.env.GIT_WORK_TREE, undefined);
  assert.equal(result.options.env.KEEP, 'yes');
  assert.equal(env.EXPO_PUBLIC_API_URL, 'http://old/api');
  assert.throws(() => buildInvocation({ ...opts, 'api-url': 'http://other/api' }, 'repo', env), /API/);
});
function fixture(overrides = {}) {
  const calls = [];
  const records = [];
  const hash = 'c'.repeat(64);
  const fn = (name, result) => (...args) => {
    calls.push(name);
    if (Object.hasOwn(overrides, name)) {
      if (overrides[name] instanceof Error) throw overrides[name];
      return typeof overrides[name] === 'function' ? overrides[name](...args) : overrides[name];
    }
    return result;
  };
  const ops = {
    source: fn('source'), build: fn('build'), fresh: fn('fresh'),
    badging: fn('badging', "package: name='com.paksho.customer'"),
    certificate: fn('certificate', 'certificate SHA-256 digest: ' + 'f'.repeat(64)),
    artifactHash: fn('artifactHash', hash),
    install: fn('install', 'Performing Streamed Install\nSuccess\n'),
    installedPaths: fn('installedPaths', 'package:/data/app/~~abc==/pkg-xyz==/base.apk'),
    installedHash: fn('installedHash', hash + ' /data/app/~~abc==/pkg-xyz==/base.apk'),
    launch: fn('launch', 'com.paksho.customer/.MainActivity'),
    foreground: fn('foreground', 'mResumedActivity: ActivityRecord{abc u0 com.paksho.customer/.MainActivity}'),
    record: value => { calls.push('record'); records.push(value); },
  };
  return { ops, calls, records };
}
test('verify-only never builds, installs, launches, checks current Git or writes evidence', () => {
  const f = fixture();
  const result = verifyInstalledWorkflow(opts, f.ops);
  assert.deepEqual(f.calls, ['badging', 'certificate', 'artifactHash', 'installedPaths', 'installedHash', 'foreground']);
  assert.equal(result.artifactAcceptance, 'matched');
  assert.equal(result.foregroundAcceptance, 'matched');
  assert.equal(result.sourceAcceptance, 'not-checked');
  assert.equal(result.commit, undefined);
  assert.equal(f.records.length, 0);
});
for (const [phase, value] of [
  ['source', new Error('dirty')], ['build', new Error('build failed')],
  ['fresh', new Error('stale')], ['badging', "package: name='com.paksho.worker'"],
  ['certificate', new Error('bad signature')], ['certificate', 'no signer'],
]) {
  test('build workflow halts before install on ' + phase + ' failure: ' + String(value), () => {
    const f = fixture({ [phase]: value });
    assert.throws(() => buildInstallWorkflow(opts, f.ops));
    assert.equal(f.calls.includes('install'), false);
    assert.equal(f.calls.includes('launch'), false);
  });
}
test('post-build source change prevents package inspection and install', () => {
  let count = 0;
  const f = fixture({ source: () => { if (++count === 2) throw new Error('source changed'); } });
  assert.throws(() => buildInstallWorkflow(opts, f.ops), /source changed/);
  assert.equal(f.calls.includes('install'), false);
  assert.equal(f.calls.includes('badging'), false);
});
test('artifact mutation immediately before install prevents installation', () => {
  let count = 0;
  const f = fixture({ artifactHash: () => (++count === 1 ? 'c' : 'd').repeat(64) });
  assert.throws(() => buildInstallWorkflow(opts, f.ops), /Artifact changed/);
  assert.equal(f.calls.includes('install'), false);
});
test('install failure prevents launch and acceptance', () => {
  const f = fixture({ install: 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]' });
  assert.throws(() => buildInstallWorkflow(opts, f.ops), /Install/);
  assert.equal(f.calls.includes('launch'), false);
  assert.equal(f.records.at(-1).status, 'built-not-installed');
});
test('installed hash mismatch prevents launching an unverified artifact', () => {
  const f = fixture({ installedHash: 'd'.repeat(64) });
  assert.throws(() => buildInstallWorkflow(opts, f.ops), /does not match/);
  assert.equal(f.calls.includes('launch'), false);
  assert.equal(f.records.at(-1).status, 'installed-not-verified');
});
test('wrong foreground cannot receive final acceptance', () => {
  const f = fixture({ foreground: 'mResumedActivity: u0 com.paksho.worker/.MainActivity' });
  assert.throws(() => buildInstallWorkflow(opts, f.ops), /foreground/);
  assert.equal(f.records.at(-1).status, 'installed-hash-matched');
});
test('successful build separates expected source from artifact and foreground acceptance', () => {
  const f = fixture();
  const result = buildInstallWorkflow(opts, f.ops);
  assert.equal(result.status, 'artifact-and-foreground-matched');
  assert.equal(result.sourceAcceptance, 'not-checked');
  assert.equal(result.commit, undefined);
  assert.equal(f.records.at(-1).sourceAcceptance, 'not-checked');
  assert.ok(f.calls.indexOf('build') < f.calls.indexOf('install'));
  assert.ok(f.calls.indexOf('installedHash') < f.calls.indexOf('launch'));
});
