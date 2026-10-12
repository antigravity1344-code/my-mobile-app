import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Manager } from '../manager.mjs';

// Include serialized JSON overhead, not just summary text. Keys are canonical order.
function reportAt(bytes, glyph) {
  const overhead = Buffer.byteLength(JSON.stringify({ summary: '' }), 'utf8');
  const width = Buffer.byteLength(glyph, 'utf8');
  const remaining = bytes - overhead;
  const report = { summary: glyph.repeat(Math.floor(remaining / width)) + 'a'.repeat(remaining % width) };
  assert.equal(Buffer.byteLength(JSON.stringify(report), 'utf8'), bytes);
  return report;
}
function fixture(t, cli = false) {
  const directory = mkdtempSync(join(tmpdir(), 'pakshoo-report-size-'));
  const path = join(directory, 'state.sqlite');
  const manager = new Manager(path, { supervisors: ['DEMO-SUPERVISOR'] });
  t.after(() => { manager.close(); rmSync(directory, { recursive: true }); });
  const execute = cli ? command => {
    const result = spawnSync(process.execPath, [new URL('../cli.mjs', import.meta.url).pathname,
      path, new URL('../examples/supervisors.json', import.meta.url).pathname],
    { input: JSON.stringify(command), encoding: 'utf8' });
    assert.ifError(result.error);
    return result;
  } : command => manager.execute(command);
  manager.execute({ commandId: 'register', type: 'register', actor: 'DEMO-SUPERVISOR', ownerApproved: true,
    spec: { taskId: 'REPORT', repository: 'antigravity1344-code/my-mobile-app', sourceCommentId: 6125075744,
      baseSha: '29e62c6afca2499a42b5bc852b1792c8c6567bfc', role: 'MAIN_CODEX',
      dependencies: [], resources: ['branch:feature/pakshoo-agent-manager'], actions: ['REPORT'] } });
  const owner = { taskId: 'REPORT', agentId: 'CODEX-MANAGER', runId: 'size-test', epoch: 1 };
  manager.execute({ commandId: 'claim', type: 'claim', ...owner, role: 'MAIN_CODEX', ttlMs: 60000 });
  manager.execute({ commandId: 'start', type: 'start', ...owner });
  const finish = report => ({ commandId: 'finish', type: 'finish', ...owner, status: 'REVIEW', report });
  // Compare complete durable rows, including receipts and locks, not just counts.
  const snapshot = () => Object.fromEntries(['tasks', 'events', 'outbox', 'commands', 'resources']
    .map(table => [table, manager.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  return { manager, execute, finish, snapshot, path };
}

for (const [label, glyph] of [['ASCII', 'a'], ['Persian', 'ژ'], ['emoji', '😀'], ['three-byte', '界']]) {
  test(`${label}: exact 32768-byte canonical report accepted and replay survives reopen`, t => {
    const f = fixture(t);
    const command = f.finish(reportAt(32768, glyph));
    f.execute(command);
    assert.equal(f.manager.get('REPORT').status, 'REVIEW');
    assert.deepEqual(f.manager.get('REPORT').result, command.report);
    assert.equal(Buffer.byteLength(f.manager.db.prepare('SELECT result FROM tasks').get().result, 'utf8'), 32768);
    const before = f.snapshot();
    const reopened = new Manager(f.path, { supervisors: ['DEMO-SUPERVISOR'] });
    try {
      assert.equal(reopened.execute(command).replayed, true);
      assert.throws(() => reopened.execute({ ...command, report: { summary: 'changed' } }), /COMMAND_ID_CONFLICT/);
    } finally { reopened.close(); }
    assert.deepEqual(f.snapshot(), before);
  });
  test(`${label}: exact 32769-byte report rejected atomically; command ID remains usable`, t => {
    const f = fixture(t);
    const command = f.finish(reportAt(32769, glyph));
    const before = f.snapshot();
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(() => f.execute(command), /REPORT_TOO_LARGE/);
      assert.deepEqual(f.snapshot(), before);
    }
    // Rejection must not have recorded a command receipt or consumed this ID.
    const corrected = f.finish(reportAt(32768, glyph));
    f.execute(corrected);
    assert.equal(f.execute(corrected).replayed, true);
  });
}

test('serialized escaping and additional report fields count toward the byte limit', t => {
  const f = fixture(t);
  const report = { summary: 'ok', evidence: ['\\"\n'.repeat(6000)] };
  assert.ok(Buffer.byteLength(JSON.stringify(report), 'utf8') > 32768);
  const before = f.snapshot();
  assert.throws(() => f.execute(f.finish(report)), /REPORT_TOO_LARGE/);
  assert.deepEqual(f.snapshot(), before);
});

test('CLI: Persian 32769 rejected (exit 1), 32768 accepted and replayed (exit 0)', t => {
  const f = fixture(t, true);
  const before = f.snapshot();
  const rejected = f.execute(f.finish(reportAt(32769, 'ژ')));
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /REPORT_TOO_LARGE/);
  assert.equal(rejected.stdout, '');
  assert.deepEqual(f.snapshot(), before);
  const command = f.finish(reportAt(32768, 'ژ'));
  const accepted = f.execute(command);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(f.manager.get('REPORT').status, 'REVIEW');
  const after = f.snapshot();
  const replay = f.execute(command);
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).replayed, true);
  assert.deepEqual(f.snapshot(), after);
});
