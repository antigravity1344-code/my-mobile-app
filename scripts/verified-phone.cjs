'use strict';
// Standalone lab checkpoints only. Never clears data, changes branches or starts a server.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const PACKAGES = { customer: 'com.paksho.customer', worker: 'com.paksho.worker' };
const LAB_API_URL = 'http://127.0.0.1:3000/api';
function must(ok, message) { if (!ok) throw new Error(message); }
function parse(argv) {
  const mode = argv.shift();
  const allowed = {
    check: ['commit', 'branch', 'role'],
    'build-install': ['commit', 'branch', 'role', 'serial', 'api-url'],
    'verify-installed': ['role', 'serial', 'apk'],
  };
  must(Object.hasOwn(allowed, mode), 'Use check, build-install or verify-installed.');
  const opts = { mode };
  while (argv.length) {
    const key = argv.shift();
    must(key.startsWith('--') && allowed[mode].includes(key.slice(2)), 'Unknown argument: ' + key);
    must(argv.length && !argv[0].startsWith('--'), 'Missing value for ' + key);
    must(opts[key.slice(2)] === undefined, 'Duplicate argument: ' + key);
    opts[key.slice(2)] = argv.shift();
  }
  must(Object.hasOwn(PACKAGES, opts.role), '--role must be customer or worker.');
  if (mode !== 'verify-installed') {
    must(/^[a-f0-9]{40}$/.test(opts.commit || ''), 'A full expected --commit is required.');
    must(opts.branch && !opts.branch.startsWith('-'), 'An expected --branch is required.');
  }
  if (mode !== 'check') {
    must(/^[A-Za-z0-9._:-]+$/.test(opts.serial || ''), 'An explicit --serial is required.');
  }
  if (mode === 'verify-installed') must(opts.apk, 'An explicit --apk is required.');
  if (mode === 'build-install') {
    must(opts['api-url'] === LAB_API_URL, '--api-url must explicitly equal ' + LAB_API_URL + ' for this lab workflow.');
  }
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
function deviceApkPath(text) {
  const paths = text.split(/\r?\n/).filter(l => l.startsWith('package:'));
  must(paths.length === 1, 'Expected exactly one standalone installed APK.');
  const result = paths[0].slice(8).trim();
  must(/^\/data\/app\/[A-Za-z0-9_~+./=-]+\/base\.apk$/.test(result), 'Unexpected device APK path.');
  return result;
}
function inspectArtifact(opts, ops) {
  must(packageFromBadging(ops.badging()) === PACKAGES[opts.role], 'APK has the wrong package.');
  const certificate = ops.certificate();
  must(/certificate SHA-256 digest: [a-f0-9]{64}/i.test(certificate), 'Missing signing identity.');
  const digest = ops.artifactHash();
  must(/^[a-f0-9]{64}$/.test(digest), 'Cannot read artifact hash.');
  return { package: PACKAGES[opts.role], apkSha256: digest, certificate };
}
function matchInstalled(artifact, ops) {
  const devicePath = deviceApkPath(ops.installedPaths());
  installedHash(ops.installedHash(devicePath), artifact.apkSha256);
  return { installedSha256: artifact.apkSha256, artifactAcceptance: 'matched' };
}
function checkForeground(role, text) {
  const resumed = text.split(/\r?\n/).filter(l => /(?:mResumedActivity|topResumedActivity)/.test(l));
  must(resumed.some(l => new RegExp('\\bu0\\s+' + PACKAGES[role].replace(/\./g, '\\.') + '/').test(l)),
    'Expected user-0 app is not in the foreground.');
}
function verifyInstalledWorkflow(opts, ops) {
  // Intentionally has no Git, build, install, launch, tap, UI dump or record-writing step.
  const artifact = inspectArtifact(opts, ops);
  const matched = matchInstalled(artifact, ops);
  checkForeground(opts.role, ops.foreground());
  return { ...artifact, ...matched, foregroundAcceptance: 'matched',
    sourceAcceptance: 'not-checked', status: 'artifact-and-foreground-matched' };
}
function buildInstallWorkflow(opts, ops) {
  ops.source();
  ops.build();
  ops.source();
  ops.fresh();
  const artifact = inspectArtifact(opts, ops);
  ops.record({ ...artifact, status: 'built-not-installed', sourceAcceptance: 'not-checked' });
  ops.source();
  must(ops.artifactHash() === artifact.apkSha256, 'Artifact changed before installation.');
  must(/^Success\s*$/m.test(ops.install()), 'Install did not report success.');
  ops.record({ status: 'installed-not-verified' });
  const matched = matchInstalled(artifact, ops);
  ops.record({ ...matched, status: 'installed-hash-matched' });
  const activity = ops.launch();
  checkForeground(opts.role, ops.foreground());
  ops.source();
  const result = { ...artifact, ...matched, activity, foregroundAcceptance: 'matched',
    sourceAcceptance: 'not-checked', status: 'artifact-and-foreground-matched' };
  ops.record(result);
  return result;
}
function buildInvocation(opts, root, env) {
  must(Object.hasOwn(PACKAGES, opts.role), 'Invalid build role.');
  must(opts['api-url'] === LAB_API_URL, 'Invalid lab API target.');
  const role = opts.role[0].toUpperCase() + opts.role.slice(1);
  const childEnv = { ...env, EXPO_PUBLIC_API_URL: LAB_API_URL, EXPO_NO_CACHE: '1' };
  for (const key of Object.keys(childEnv)) if (key.startsWith('GIT_')) delete childEnv[key];
  // --rerun applies only to the preceding JS task; RN BundleHermesCTask passes --reset-cache.
  return { exe: env.ComSpec || 'cmd.exe',
    args: ['/d', '/c', 'gradlew.bat', ':app:createBundle' + role + 'DebugJsAndAssets',
      '--rerun', ':app:assemble' + role + 'Debug', '-PreactNativeArchitectures=arm64-v8a'],
    options: { cwd: path.join(root, 'android'), timeout: 30 * 60 * 1000,
      stdio: 'inherit', env: childEnv } };
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
  const result = fs.readdirSync(path.join(sdk, 'build-tools')).filter(n => /^\d+\.\d+\.\d+$/.test(n))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  must(result, 'No Android build-tools found.');
  return result;
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function main(argv) {
  const opts = parse([...argv]);
  if (opts.mode !== 'verify-installed') {
    const identity = source(opts);
    console.log('WORKTREE MATCHED', identity.branch, identity.commit, 'clean; bundle identity not yet checked');
    if (opts.mode === 'check') return;
  }
  must(process.platform === 'win32', 'This device workflow currently supports Windows only.');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const adb = path.join(sdk, 'platform-tools', 'adb.exe');
  const bt = path.join(sdk, 'build-tools', latestTools(sdk));
  const ad = args => run(adb, ['-s', opts.serial, ...args]);
  must(run(adb, ['devices']).split(/\r?\n/).some(l => l.trim() === opts.serial + '\tdevice'),
    'Requested phone is absent or unauthorized.');
  const apk = opts.mode === 'verify-installed' ? path.resolve(opts.apk) :
    path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk',
      opts.role, 'debug', 'app-' + opts.role + '-debug.apk');
  const common = {
    badging: () => run(path.join(bt, 'aapt.exe'), ['dump', 'badging', apk]),
    certificate: () => run('java', ['-jar', path.join(bt, 'lib', 'apksigner.jar'),
      'verify', '--verbose', '--print-certs', apk]),
    artifactHash: () => sha(apk),
    installedPaths: () => ad(['shell', 'pm', 'path', '--user', '0', PACKAGES[opts.role]]),
    installedHash: devicePath => ad(['shell', 'sha256sum', devicePath]),
    foreground: () => ad(['shell', 'dumpsys', 'activity', 'activities']),
  };
  if (opts.mode === 'verify-installed') {
    console.log(JSON.stringify({ schema: 2, time: new Date().toISOString(), role: opts.role,
      serial: opts.serial, user: 0, ...verifyInstalledWorkflow(opts, common) }, null, 2));
    console.log('Artifact/foreground only. Expanded source badge and API identity remain unchecked.');
    return;
  }
  const store = path.resolve(ROOT, git(['rev-parse', '--git-path', 'paksho-device']));
  fs.mkdirSync(store, { recursive: true });
  const lock = path.join(store, 'active.lock');
  fs.mkdirSync(lock);
  try {
    const started = Date.now();
    const record = path.join(store, Date.now() + '-' + opts.role + '.json');
    const evidence = { schema: 2, time: new Date().toISOString(), root: ROOT, role: opts.role,
      serial: opts.serial, user: 0, expectedBuildSource: { branch: opts.branch, commit: opts.commit, clean: true },
      expectedBuildConfiguration: { apiUrl: opts['api-url'] }, sourceAcceptance: 'not-checked',
      apiRuntimeAcceptance: 'not-checked' };
    const ops = {
      ...common,
      source: () => source(opts),
      build: () => {
        const invocation = buildInvocation(opts, ROOT, process.env);
        console.log('BUILDING', opts.role, 'with explicit lab API; rebuilding JS bundle only where required.');
        run(invocation.exe, invocation.args, invocation.options);
      },
      fresh: () => must(fs.statSync(apk).mtimeMs >= started - 2000, 'APK was not freshly generated.'),
      record: update => {
        Object.assign(evidence, update);
        fs.writeFileSync(record, JSON.stringify(evidence, null, 2) + '\n');
      },
      install: () => ad(['install', '-r', '--user', '0', apk]),
      launch: () => {
        const resolution = ad(['shell', 'cmd', 'package', 'resolve-activity', '--brief', '--user', '0', PACKAGES[opts.role]]);
        const activity = resolution.split(/\r?\n/).find(l => l.trim().startsWith(PACKAGES[opts.role] + '/'));
        must(activity && /^[A-Za-z0-9._/]+$/.test(activity.trim()), 'Cannot resolve the exact launcher activity.');
        const launch = ad(['shell', 'am', 'start', '-W', '--user', '0', '-n', activity.trim()]);
        must(!/\bError\b|Exception/.test(launch) && /Status: ok/.test(launch), 'App launch failed: ' + launch);
        return activity.trim();
      },
    };
    buildInstallWorkflow(opts, ops);
    console.log('ARTIFACT AND FOREGROUND MATCHED:', evidence.package, evidence.apkSha256);
    console.log('Evidence:', record);
    console.log('SOURCE ACCEPTANCE PENDING: compare expanded bundle badge; check UI, login and API separately.');
  } finally { fs.rmdirSync(lock); }
}
module.exports = { parse, validateSource, packageFromBadging, installedHash, deviceApkPath,
  checkForeground, inspectArtifact, verifyInstalledWorkflow, buildInstallWorkflow, buildInvocation, LAB_API_URL };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('STOP:', e.message); process.exitCode = 1; }
}
