import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Manager } from '../manager.mjs';

export const definition = (taskId = 'SECURITY') => ({
  taskId, repository: 'antigravity1344-code/my-mobile-app', sourceCommentId: 6128564865,
  baseSha: 'e2365404bba64f72d0a5d5aef6c786873fbd9c23', role: 'MAIN_CODEX',
  dependencies: [], resources: [`branch:${taskId}`], actions: ['READ_REPO','REPORT'],
});
export function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'pakshoo-security-004-'));
  const path = join(directory, 'state.sqlite');
  const manager = new Manager(path, { supervisors: ['SUPERVISOR'], clock: () => 1000 });
  t.after(() => { manager.close(); rmSync(directory, { recursive: true }); });
  let n = 0;
  const run = c => manager.execute({ commandId: `security-${++n}`, ...c });
  const register = (taskId = 'SECURITY') => run({ type: 'register', actor: 'SUPERVISOR', ownerApproved: true, spec: definition(taskId) });
  const owner = (taskId = 'SECURITY') => ({ taskId, agentId: 'WORKER', runId: 'RUN', epoch: 1 });
  const start = (taskId = 'SECURITY') => {
    register(taskId);
    run({ type: 'claim', ...owner(taskId), role: 'MAIN_CODEX', ttlMs: 60000 });
    run({ type: 'start', ...owner(taskId) });
  };
  const snapshot = () => Object.fromEntries(['tasks','events','outbox','commands','resources','meta']
    .map(table => [table, manager.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  return { manager, path, directory, run, register, owner, start, snapshot };
}
