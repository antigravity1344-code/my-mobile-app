'use strict';
// Standalone phone builds only. Does not change branches, commit, push, clear data or start a server.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const PACKAGES = { customer: 'com.paksho.customer', worker: 'com.paksho.worker' };
function must(ok, message) { if (!ok) throw new Error(message); }
function parse(argv) {
  const mode = argv.shift();
  must(['check', 'build-install'].includes(mode), 'Use check or build-install; see docs/SOURCE_IDENTITY.md.');
  const opts = { mode };
  while (argv.length) {
    const key = argv.shift();
    must(['--commit', '--branch', '--serial', '--role'].includes(key), 'Unknown argument: ' + key);
    must(argv.length && !argv[0].startsWith('--'), 'Missing value for ' + key);
    must(opts[key.slice(2)] === undefined, 'Duplicate argument: ' + key);
    opts[key.slice(2)] = argv.shift();
  }
  must(/^[a-f0-9]{40}$/.test(opts.commit || ''), 'A full expected --commit is required.');
  must(opts.branch && !opts.branch.startsWith('-'), 'An expected --branch is required.');
  must(PACKAGES[opts.role], '--role must be customer or worker.');
  if (mode === 'build-install') must(/^[A-Za-z0-9._:-]+$/.test(opts.serial || ''), 'An explicit --serial is required.');
  return opts;
}
function validateSource(actual, opts) {
  must(actual.root === actual.expectedRoot, 'Wrong repository root.');
  must(actual.remote === 'antigravity1344-code/my-mobile-app', 'Wrong origin repository.');
  must(actual.branch === opts.branch, 'Wrong branch: ' + actual.branch);
  must(actual.commit === opts.commit, 'Wrong commit: ' + actual.commit);
  must(!actual.status.trim(), 'Uncommitted/untracked files exist. Preserve and review them; this command will not reset or commit them.');
}
function packageFromBadging(text) {
  const match = text.match(/^package: name='([^']+)'/m);
  must(match, 'Cannot read APK package.');
  return match[1];
}
function installedHash(text, expected) {
  const found = text.trim().split(/\s+/)[0];
  must(/^[a-f0-9]{64}$/i.test(found), 'Cannot read installed APK hash.');
  must(found.toLowerCase() === expected, 'Installed APK does not match the built artifact.');
}
function run(exe, args, options = {}) {
  return execFileSync(exe, args, { cwd: ROOT, encoding: 'utf8', timeout: 30000,
    maxBuffer: 16 * 1024 * 1024, windowsHide: true, ...options });
}
function git(args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  return run('git', ['-C', ROOT, ...args], { env }).trim();
}
function source(opts) {
  const remote = git(['remote', 'get-url', 'origin']);
  const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/);
  const actual = { root: fs.realpathSync(git(['rev-parse', '--show-toplevel'])),
    expectedRoot: fs.realpathSync(ROOT), remote: match ? match[1] : '',
    branch: git(['branch', '--show-current']), commit: git(['rev-parse', 'HEAD']),
    status: git(['status', '--porcelain=v1', '--untracked-files=all']) };
  validateSource(actual, opts);
  return actual;
}
function latestTools(sdk) {
  return fs.readdirSync(path.join(sdk, 'build-tools')).filter(n => /^\d+\.\d+\.\d+$/.test(n))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function main(argv) {
  const opts = parse([...argv]);
  const identity = source(opts);
  console.log('SOURCE VERIFIED', identity.branch, identity.commit, 'clean');
  if (opts.mode === 'check') return;
  must(process.platform === 'win32', 'This device workflow currently supports Windows only.');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const adb = path.join(sdk, 'platform-tools', 'adb.exe');
  const bt = path.join(sdk, 'build-tools', latestTools(sdk));
  const aapt = path.join(bt, 'aapt.exe');
  const ad = args => run(adb, ['-s', opts.serial, ...args]);
  must(run(adb, ['devices']).split(/\r?\n/).some(l => l.trim() === opts.serial + '\tdevice'),
    'Requested phone is absent or unauthorized.');
  const store = path.resolve(ROOT, git(['rev-parse', '--git-path', 'paksho-device']));
  fs.mkdirSync(store, { recursive: true });
  const lock = path.join(store, 'active.lock');
  fs.mkdirSync(lock); // Existing lock fails closed; inspect an interrupted run before removing it.
  try {
    const taskRole = opts.role[0].toUpperCase() + opts.role.slice(1);
    const started = Date.now();
    console.log('BUILDING', opts.role, 'from verified source; this can take several minutes.');
    run(process.env.ComSpec || 'cmd.exe',
      ['/d', '/c', 'gradlew.bat', ':app:assemble' + taskRole + 'Debug',
        '--rerun-tasks', '--no-build-cache', '-PreactNativeArchitectures=arm64-v8a'],
      { cwd: path.join(ROOT, 'android'), timeout: 30 * 60 * 1000, stdio: 'inherit',
        env: { ...process.env, EXPO_NO_CACHE: '1' } });
    source(opts);
    const apk = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk',
      opts.role, 'debug', 'app-' + opts.role + '-debug.apk');
    must(fs.statSync(apk).mtimeMs >= started - 2000, 'APK was not freshly generated.');
    must(packageFromBadging(run(aapt, ['dump', 'badging', apk])) === PACKAGES[opts.role],
      'Built APK has the wrong package.');
    const digest = sha(apk);
    const certificate = run('java', ['-jar', path.join(bt, 'lib', 'apksigner.jar'),
      'verify', '--verbose', '--print-certs', apk]);
    must(/certificate SHA-256 digest: [a-f0-9]{64}/i.test(certificate), 'Missing signing identity.');
    const evidence = { schema: 1, time: new Date().toISOString(), root: ROOT,
      branch: opts.branch, commit: opts.commit, clean: true, role: opts.role,
      package: PACKAGES[opts.role], serial: opts.serial, user: 0, apkSha256: digest,
      certificate, status: 'built-not-installed' };
    const record = path.join(store, Date.now() + '-' + opts.role + '.json');
    const save = () => fs.writeFileSync(record, JSON.stringify(evidence, null, 2) + '\n');
    save();
    source(opts);
    must(sha(apk) === digest, 'Artifact changed before installation.');
    const install = ad(['install', '-r', '--user', '0', apk]);
    must(/^Success\s*$/m.test(install), 'Install did not report success: ' + install);
    evidence.status = 'installed-not-verified'; save();
    const paths = ad(['shell', 'pm', 'path', '--user', '0', PACKAGES[opts.role]])
      .split(/\r?\n/).filter(l => l.startsWith('package:'));
    must(paths.length === 1, 'Expected exactly one standalone installed APK.');
    const devicePath = paths[0].slice(8).trim();
    must(/^\/data\/app\/[A-Za-z0-9_~+./=-]+\/base\.apk$/.test(devicePath), 'Unexpected device APK path.');
    installedHash(ad(['shell', 'sha256sum', devicePath]), digest);
    evidence.installedSha256 = digest;
    evidence.status = 'installed-hash-verified'; save();
    const resolution = ad(['shell', 'cmd', 'package', 'resolve-activity', '--brief', '--user', '0', PACKAGES[opts.role]]);
    const activity = resolution.split(/\r?\n/).find(l => l.trim().startsWith(PACKAGES[opts.role] + '/'));
    must(activity && /^[A-Za-z0-9._/]+$/.test(activity.trim()), 'Cannot resolve the exact launcher activity.');
    const launch = ad(['shell', 'am', 'start', '-W', '--user', '0', '-n', activity.trim()]);
    must(!/\bError\b|Exception/.test(launch) && /Status: ok/.test(launch), 'App launch failed: ' + launch);
    const resumed = ad(['shell', 'dumpsys', 'activity', 'activities']).split(/\r?\n/)
      .filter(l => /(?:mResumedActivity|topResumedActivity)/.test(l));
    must(resumed.some(l => l.includes(PACKAGES[opts.role] + '/')), 'Expected app is not in the foreground.');
    source(opts);
    evidence.activity = activity.trim(); evidence.status = 'installed-and-opened-verified'; save();
    console.log('VERIFIED:', evidence.package, opts.commit, digest);
    console.log('Evidence:', record);
    console.log('UI appearance, login and API/server identity still require separate checks.');
  } finally { fs.rmdirSync(lock); }
}
module.exports = { parse, validateSource, packageFromBadging, installedHash };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('STOP:', e.message); process.exitCode = 1; }
}
