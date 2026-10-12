import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { Manager } from '../manager.mjs';
import { simulateLauncher } from '../simulator.mjs';

const worker = new URL('./process-worker.mjs', import.meta.url);
const definition = (taskId = 'TASK-1', extra = {}) => ({
  taskId, repository: 'antigravity1344-code/my-mobile-app', sourceCommentId: 6123734979,
  baseSha: 'febe14ee679c4d71b177e3b65844be6b14ce9625', role: 'MAIN_CODEX',
  dependencies: [], resources: ['branch:feature/pakshoo-agent-manager'],
  actions: ['READ_REPO', 'WRITE_ISOLATED_BRANCH', 'REPORT'], ...extra,
});
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'pakshoo-manager-test-'));
  const path = join(directory, 'state.sqlite');
  let now = 1000;
  const manager = new Manager(path, { supervisors: ['SUPERVISOR'], clock: () => now });
  let n = 0;
  const run = c => manager.execute({ commandId: `cmd-${++n}`, ...c });
  const register = (taskId, extra) => run({ type: 'register', actor: 'SUPERVISOR', ownerApproved: true, spec: definition(taskId, extra) });
  const claim = (taskId = 'TASK-1', extra = {}) => run({ type: 'claim', taskId, role: 'MAIN_CODEX', agentId: 'CODEX-MANAGER', runId: 'run-1', ttlMs: 1000, ...extra });
  const owned = (type, extra = {}) => run({ type, taskId: 'TASK-1', agentId: 'CODEX-MANAGER', runId: 'run-1', epoch: 1, ...extra });
  t.after(() => { manager.close(); rmSync(directory, { recursive: true }); });
  return { manager, path, run, register, claim, owned, time: v => { now = v; } };
}
function child(path, command, mode = 'normal') {
  const process = spawn(globalThis.process.execPath, [fileURLToPath(worker), path, mode], { stdio: ['pipe','pipe','pipe'] });
  process.stdin.end(JSON.stringify(command));
  let stdout = '', stderr = '';
  process.stdout.on('data', d => { stdout += d; });
  process.stderr.on('data', d => { stderr += d; });
  const completion = once(process, 'close').then(([code]) => ({ code, stdout, stderr }));
  const ready = new Promise((resolve, reject) => {
    process.stdout.on('data', () => { if (stdout.includes('\n')) resolve(stdout.trim()); });
    process.once('error', reject);
    process.once('close', () => { if (!stdout.includes('\n')) reject(new Error(`Worker closed: ${stderr}`)); });
  });
  return { process, completion, ready };
}
const claimCommand = (commandId, taskId, agentId, ttlMs = 60000) => ({ commandId, type: 'claim', taskId, agentId, runId: 'process-run', role: 'MAIN_CODEX', ttlMs });

test('registration is immutable and duplicate definitions create no event', t => {
  const f = fixture(t); f.register();
  assert.equal(f.register().duplicate, true);
  assert.equal(f.manager.events('TASK-1').length, 1);
  assert.throws(() => f.register('TASK-1', { role: 'UX_UI_CHATGPT' }), /TASK_ID_CONFLICT/);
});
test('command replay survives reopen and different payload is rejected', t => {
  const f = fixture(t);
  const command = { commandId: 'fixed', type: 'register', actor: 'SUPERVISOR', ownerApproved: true, spec: definition() };
  f.manager.execute(command);
  const second = new Manager(f.path, { supervisors: ['SUPERVISOR'], clock: () => 1000 });
  try {
    assert.equal(second.execute(command).replayed, true);
    assert.throws(() => second.execute({ ...command, ownerApproved: false }), /COMMAND_ID_CONFLICT/);
    assert.equal(second.events('TASK-1').length, 1);
  } finally { second.close(); }
});
test('unapproved or unauthorized registration and sensitive actions fail closed', t => {
  const f = fixture(t);
  assert.throws(() => f.run({ type: 'register', actor: 'OTHER', ownerApproved: true, spec: definition() }), /SUPERVISOR_REQUIRED/);
  assert.throws(() => f.run({ type: 'register', actor: 'SUPERVISOR', ownerApproved: false, spec: definition() }), /OWNER_APPROVAL_REQUIRED/);
  for (const action of ['MERGE','DELETE','DEPLOY','FORCE_PUSH','FINANCIAL','PRODUCTION']) {
    assert.throws(() => f.register(undefined, { actions: [action] }), /FORBIDDEN_ACTION/);
  }
  assert.throws(() => f.manager.get('TASK-1'), /TASK_NOT_FOUND/);
});
test('malformed task, source and lease are rejected without partial state', t => {
  const f = fixture(t);
  for (const extra of [{ taskId: '../ bad' }, { sourceCommentId: 0 }, { baseSha: 'main' }, { resources: ['x','x'] }, { deploy: true }]) {
    assert.throws(() => f.register(undefined, extra));
  }
  f.register();
  assert.throws(() => f.claim(undefined, { ttlMs: 0 }), /INVALID_LEASE/);
  assert.equal(f.manager.get('TASK-1').status, 'NEW');
});
test('complete lifecycle requires worker lease and separate supervisor decision', t => {
  const f = fixture(t); f.register(); f.claim(); f.owned('start');
  assert.throws(() => f.owned('finish', { status: 'COMPLETED', report: { summary: 'done' } }), /INVALID_TRANSITION/);
  f.owned('finish', { status: 'REVIEW', report: { summary: 'tests passed', evidence: ['offline'] } });
  const row = f.manager.get('TASK-1');
  assert.throws(() => f.run({ type: 'decide', taskId: row.id, actor: 'CODEX-MANAGER', expectedRevision: row.revision, status: 'COMPLETED', reason: 'approve' }), /SUPERVISOR_REQUIRED/);
  f.run({ type: 'decide', taskId: row.id, actor: 'SUPERVISOR', expectedRevision: row.revision, status: 'COMPLETED', reason: 'reviewed' });
  assert.equal(f.manager.get(row.id).status, 'COMPLETED');
  assert.throws(() => f.claim(), /TASK_UNAVAILABLE/);
  assert.throws(() => f.run({ type: 'retry', taskId: row.id, actor: 'SUPERVISOR', expectedRevision: f.manager.get(row.id).revision, reason: 'again' }), /RETRY_NOT_ALLOWED/);
});
test('review cannot be skipped; stale revisions cannot approve', t => {
  const f = fixture(t); f.register(); f.claim();
  assert.throws(() => f.run({ type: 'decide', taskId: 'TASK-1', actor: 'SUPERVISOR', expectedRevision: 1, status: 'COMPLETED', reason: 'yes' }), /REVISION_CONFLICT/);
  assert.throws(() => f.run({ type: 'decide', taskId: 'TASK-1', actor: 'SUPERVISOR', expectedRevision: 2, status: 'COMPLETED', reason: 'yes' }), /REVIEW_REQUIRED/);
});
test('heartbeat extends lease without shortening it', t => {
  const f = fixture(t); f.register(); f.claim(); f.time(1500);
  f.owned('heartbeat', { ttlMs: 2000 });
  assert.equal(f.manager.get('TASK-1').lease_until, 3500);
  f.owned('heartbeat', { ttlMs: 100 });
  assert.equal(f.manager.get('TASK-1').lease_until, 3500);
});
test('expiry is inclusive and old owner cannot heartbeat or finish after takeover', t => {
  const f = fixture(t); f.register(); f.claim(); f.owned('start'); f.time(2000);
  assert.throws(() => f.owned('heartbeat', { ttlMs: 1000 }), /LEASE_EXPIRED/);
  assert.equal(f.claim('TASK-1', { agentId: 'SECOND', runId: 'run-2' }).task.epoch, 2);
  assert.throws(() => f.owned('heartbeat', { ttlMs: 1000 }), /STALE_OWNER/);
  assert.throws(() => f.owned('finish', { status: 'REVIEW', report: { summary: 'old result' } }), /STALE_OWNER/);
  assert.ok(f.manager.events('TASK-1').some(e => e.kind === 'LEASE_RECOVERED'));
});
test('same agent and run still require the new epoch', t => {
  const f = fixture(t); f.register(); f.claim(); f.time(2000); f.claim();
  assert.throws(() => f.owned('start'), /STALE_OWNER/);
  f.owned('start', { epoch: 2 });
});
test('clock rollback after a rejected expired mutation cannot revive a lease', t => {
  const f = fixture(t); f.register(); f.claim(); f.time(2000);
  assert.throws(() => f.owned('heartbeat', { ttlMs: 1000 }), /LEASE_EXPIRED/);
  f.time(1100);
  assert.throws(() => f.owned('start'), /LEASE_EXPIRED/);
  assert.equal(f.claim('TASK-1', { agentId: 'SECOND' }).task.lease_until, 3000);
});
test('dependencies must exist and be completed; immutable registration prevents cycles', t => {
  const f = fixture(t);
  assert.throws(() => f.register('B', { dependencies: ['A'] }), /TASK_NOT_FOUND/);
  f.register('A', { resources: [] }); f.register('B', { dependencies: ['A'], resources: [] });
  assert.throws(() => f.claim('B'), /DEPENDENCY_NOT_COMPLETED/);
  const a = f.manager.get('A');
  f.claim('A');
  f.owned('start', { taskId: 'A' });
  f.owned('finish', { taskId: 'A', status: 'REVIEW', report: { summary: 'done' } });
  f.run({ type: 'decide', taskId: a.id, actor: 'SUPERVISOR', expectedRevision: f.manager.get(a.id).revision, status: 'COMPLETED', reason: 'reviewed' });
  assert.equal(f.claim('B').task.status, 'CLAIMED');
  assert.throws(() => f.register('A', { dependencies: ['B'], resources: [] }), /TASK_ID_CONFLICT/);
});
test('role mismatch and simultaneous active claims fail', t => {
  const f = fixture(t); f.register();
  assert.throws(() => f.claim(undefined, { role: 'UX_UI_CHATGPT' }), /ROLE_MISMATCH/);
  f.claim();
  assert.throws(() => f.claim(undefined, { agentId: 'SECOND' }), /TASK_UNAVAILABLE/);
});
test('resource locks remain through REVIEW and release on supervisor completion', t => {
  const f = fixture(t); f.register(); f.register('TASK-2'); f.claim(); f.owned('start');
  f.owned('finish', { status: 'REVIEW', report: { summary: 'review me' } }); f.time(9999);
  assert.throws(() => f.claim('TASK-2'), /RESOURCE_BUSY/);
  f.run({ type: 'decide', taskId: 'TASK-1', actor: 'SUPERVISOR', expectedRevision: f.manager.get('TASK-1').revision, status: 'COMPLETED', reason: 'checked' });
  assert.equal(f.claim('TASK-2').task.status, 'CLAIMED');
});
test('resource conflict rolls back an entire claim, including earlier free resources', t => {
  const f = fixture(t);
  f.register('A', { resources: ['z-busy'] }); f.register('B', { resources: ['a-free','z-busy'] });
  f.register('C', { resources: ['a-free'] }); f.claim('A');
  assert.throws(() => f.claim('B'), /RESOURCE_BUSY/);
  assert.equal(f.manager.get('B').epoch, 0);
  assert.equal(f.claim('C').task.status, 'CLAIMED');
});
test('expired resource owner cannot reclaim while another task owns the resource', t => {
  const f = fixture(t); f.register(); f.register('TASK-2'); f.claim(); f.time(2000);
  f.claim('TASK-2');
  assert.throws(() => f.claim(), /RESOURCE_BUSY/);
  assert.throws(() => f.owned('start'), /LEASE_EXPIRED/);
});
test('BLOCKED and FAILED retry require explicit supervisor revision and reason', t => {
  const f = fixture(t); f.register(); f.claim(); f.owned('start');
  f.owned('finish', { status: 'BLOCKED', report: { summary: 'external dependency absent' } });
  const row = f.manager.get('TASK-1');
  assert.throws(() => f.claim(), /TASK_UNAVAILABLE/);
  assert.throws(() => f.run({ type: 'retry', taskId: row.id, actor: 'OTHER', expectedRevision: row.revision, reason: 'retry' }), /SUPERVISOR_REQUIRED/);
  f.run({ type: 'retry', taskId: row.id, actor: 'SUPERVISOR', expectedRevision: row.revision, reason: 'dependency resolved' });
  assert.equal(f.claim().task.epoch, 2);
  f.owned('start', { epoch: 2 });
  f.owned('finish', { epoch: 2, status: 'FAILED', report: { summary: 'execution failed' } });
  assert.equal(f.manager.get(row.id).status, 'FAILED');
});
test('supervisor stop invalidates active owner and frees shared resource', t => {
  const f = fixture(t); f.register(); f.register('TASK-2'); f.claim();
  f.run({ type: 'decide', taskId: 'TASK-1', actor: 'SUPERVISOR', expectedRevision: 2, status: 'BLOCKED', reason: 'PSTOP' });
  assert.throws(() => f.owned('start'), /STALE_OWNER/);
  f.claim('TASK-2');
});
test('failed report validation creates no partial event or outbox item', t => {
  const f = fixture(t); f.register(); f.claim(); f.owned('start');
  const count = f.manager.pendingReports().length;
  assert.throws(() => f.owned('finish', { status: 'REVIEW', report: {} }), /REPORT_REQUIRED/);
  assert.equal(f.manager.get('TASK-1').status, 'RUNNING');
  assert.equal(f.manager.pendingReports().length, count);
});
test('event history rejects update, delete and INSERT OR REPLACE', t => {
  const f = fixture(t); f.register();
  const db = new DatabaseSync(f.path);
  try {
    assert.throws(() => db.exec("UPDATE events SET kind='FAKE'"), /APPEND_ONLY/);
    assert.throws(() => db.exec('DELETE FROM events'), /APPEND_ONLY/);
    assert.throws(() => db.exec("INSERT OR REPLACE INTO events VALUES(1,'TASK-1','FAKE',1,'{}')"), /APPEND_ONLY/);
    assert.equal(f.manager.events('TASK-1')[0].kind, 'REGISTERED');
  } finally { db.close(); }
});
test('outbox receipt is idempotent, simulated and survives restart', t => {
  const f = fixture(t); f.register();
  const report = f.manager.pendingReports()[0];
  assert.ok(report.marker.includes('TASK-1'));
  assert.throws(() => f.run({ type: 'report-receipt', actor: 'SUPERVISOR', reportId: report.id, receipt: 'github:123' }), /SIMULATED_RECEIPT_REQUIRED/);
  f.run({ type: 'report-receipt', actor: 'SUPERVISOR', reportId: report.id, receipt: 'simulated:123' });
  f.run({ type: 'report-receipt', actor: 'SUPERVISOR', reportId: report.id, receipt: 'simulated:123' });
  assert.throws(() => f.run({ type: 'report-receipt', actor: 'SUPERVISOR', reportId: report.id, receipt: 'simulated:456' }), /RECEIPT_CONFLICT/);
  const second = new Manager(f.path, { supervisors: ['SUPERVISOR'] });
  try { assert.equal(second.pendingReports().length, 0); } finally { second.close(); }
});
test('launch simulation never launches Codex or an existing UX/UI conversation', t => {
  const f = fixture(t); f.register(); f.claim(); f.owned('start');
  for (const target of ['CODEX_HEADLESS','CHATGPT_UX_UI']) {
    assert.equal(simulateLauncher(f.manager.get('TASK-1'), target).launched, false);
  }
  assert.throws(() => simulateLauncher(f.manager.get('TASK-1'), 'SHELL'), /UNKNOWN_TARGET/);
});
test('two OS processes racing for one task produce exactly one owner', { timeout: 15000 }, async t => {
  const f = fixture(t); f.register();
  const results = await Promise.all(['A','B'].map(agent => child(f.path, claimCommand(`race-${agent}`, 'TASK-1', agent)).completion));
  const payloads = results.map(r => JSON.parse(r.stdout));
  assert.equal(payloads.filter(r => r.ok).length, 1);
  assert.equal(payloads.find(r => !r.ok).error, 'TASK_UNAVAILABLE');
  assert.equal(f.manager.get('TASK-1').epoch, 1);
});
test('two OS processes racing on different tasks with one shared resource have one winner', { timeout: 15000 }, async t => {
  const f = fixture(t); f.register('A'); f.register('B');
  const results = await Promise.all(['A','B'].map(taskId => child(f.path, claimCommand(`resource-${taskId}`, taskId, taskId)).completion));
  const payloads = results.map(r => JSON.parse(r.stdout));
  assert.equal(payloads.filter(r => r.ok).length, 1);
  assert.equal(payloads.find(r => !r.ok).error, 'RESOURCE_BUSY');
});
test('SIGKILL before commit rolls back partial state and leaves audit consistent', { timeout: 15000 }, async t => {
  const f = fixture(t); f.register();
  const process = child(f.path, { taskId: 'TASK-1' }, 'crash-transaction');
  t.after(() => process.process.kill('SIGKILL'));
  assert.equal(await process.ready, 'UNCOMMITTED');
  process.process.kill('SIGKILL'); await process.completion;
  assert.equal(f.manager.get('TASK-1').status, 'NEW');
  assert.equal(f.manager.events('TASK-1').length, 1);
  f.claim();
});
test('SIGKILL after committed claim preserves lease and allows fenced recovery after expiry', { timeout: 15000 }, async t => {
  const f = fixture(t); f.register();
  const command = claimCommand('crash-claim', 'TASK-1', 'OLD', 100);
  const process = child(f.path, command, 'crash-after-claim');
  t.after(() => process.process.kill('SIGKILL'));
  const payload = JSON.parse(await process.ready); assert.equal(payload.ok, true);
  process.process.kill('SIGKILL'); await process.completion;
  const committed = f.manager.get('TASK-1');
  assert.equal(committed.status, 'CLAIMED');
  f.time(committed.lease_until);
  assert.equal(f.claim('TASK-1', { agentId: 'NEW', runId: 'new-run' }).task.epoch, 2);
  assert.throws(() => f.run({ type: 'start', taskId: 'TASK-1', agentId: 'OLD', runId: 'process-run', epoch: 1 }), /STALE_OWNER/);
  // Replaying a receipt is a historical snapshot, never a new lease.
  assert.equal(f.manager.execute(command).replayed, true);
  assert.equal(f.manager.get('TASK-1').agent, 'NEW');
});

test('a command waiting behind a write lock checks expiry after the lock is acquired', { timeout: 15000 }, async t => {
  const f = fixture(t); f.register();
  const claimed = await child(f.path, claimCommand('wait-claim', 'TASK-1', 'WAIT', 500)).completion;
  assert.equal(JSON.parse(claimed.stdout).ok, true);
  const blocker = new DatabaseSync(f.path);
  const started = f.manager.get('TASK-1');
  let waiting;
  try {
    blocker.exec('BEGIN IMMEDIATE');
    waiting = child(f.path, { commandId: 'waiting-start', type: 'start', taskId: 'TASK-1',
      agentId: 'WAIT', runId: 'process-run', epoch: started.epoch });
    t.after(() => waiting.process.kill('SIGKILL'));
    await new Promise(resolve => setTimeout(resolve, Math.max(0, started.lease_until - Date.now()) + 100));
    blocker.exec('COMMIT');
    const result = JSON.parse((await waiting.completion).stdout);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'LEASE_EXPIRED');
    assert.equal(f.manager.get('TASK-1').status, 'CLAIMED');
  } finally { if (blocker.isTransaction) blocker.exec('ROLLBACK'); blocker.close(); }
});

test('CLI reads JSON, replays a registration and exposes pending reports with no transport', { timeout: 15000 }, async t => {
  const f = fixture(t);
  const config = fileURLToPath(new URL('../examples/supervisors.json', import.meta.url));
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  async function invoke(command) {
    const process = spawn(globalThis.process.execPath, [cli, f.path, config]);
    let stdout = '', stderr = '';
    process.stdout.on('data', d => { stdout += d; });
    process.stderr.on('data', d => { stderr += d; });
    process.stdin.end(JSON.stringify(command));
    const [code] = await once(process, 'close');
    return { code, stdout, stderr };
  }
  const registration = { commandId: 'cli-register', type: 'register', actor: 'DEMO-SUPERVISOR', ownerApproved: true, spec: definition() };
  assert.equal((await invoke(registration)).code, 0);
  assert.equal(JSON.parse((await invoke(registration)).stdout).replayed, true);
  const pending = await invoke({ type: 'pending-reports' });
  // SECURITY-004: CLI collections now use a bounded page envelope.
  assert.equal(JSON.parse(pending.stdout).items.length, 1);
  assert.equal(JSON.parse(pending.stdout).nextCursor, null);
  const forbidden = await invoke({ commandId: 'cli-forbidden', type: 'merge', taskId: 'TASK-1' });
  assert.equal(forbidden.code, 1);
  assert.match(forbidden.stderr, /UNKNOWN_COMMAND/);
});
