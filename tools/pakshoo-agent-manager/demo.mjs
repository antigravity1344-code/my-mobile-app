import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Manager } from './manager.mjs';
import { simulateLauncher } from './simulator.mjs';

// New disposable DB, demo task ID; never import or claim historical live tasks.
const directory = mkdtempSync(join(tmpdir(), 'pakshoo-manager-demo-'));
const database = join(directory, 'state.sqlite');
const manager = new Manager(database, { supervisors: ['DEMO-SUPERVISOR'] });
let counter = 0;
const run = c => manager.execute({ commandId: `demo-${++counter}`, ...c });
try {
  run({ type: 'register', actor: 'DEMO-SUPERVISOR', ownerApproved: true, spec: {
    taskId: 'DEMO-OFFLINE-001', repository: 'antigravity1344-code/my-mobile-app',
    sourceCommentId: 6123734979, baseSha: 'febe14ee679c4d71b177e3b65844be6b14ce9625',
    role: 'MAIN_CODEX', dependencies: [], resources: ['demo:isolated-branch'],
    actions: ['READ_REPO','WRITE_ISOLATED_BRANCH','REPORT'],
  } });
  const owner = { taskId: 'DEMO-OFFLINE-001', agentId: 'DEMO-AGENT', runId: 'demo-run', role: 'MAIN_CODEX' };
  const claim = run({ type: 'claim', ...owner, ttlMs: 60000 });
  run({ type: 'start', ...owner, epoch: claim.task.epoch });
  const launches = ['CODEX_HEADLESS','CHATGPT_UX_UI'].map(target => simulateLauncher(manager.get(owner.taskId), target));
  run({ type: 'heartbeat', ...owner, epoch: claim.task.epoch, ttlMs: 60000 });
  run({ type: 'finish', ...owner, epoch: claim.task.epoch, status: 'REVIEW', report: {
    summary: 'Offline lifecycle demonstrated; no agent launched', tests: ['simulation only'], limitations: ['No live transport'],
  } });
  run({ type: 'decide', taskId: owner.taskId, actor: 'DEMO-SUPERVISOR',
    expectedRevision: manager.get(owner.taskId).revision, status: 'COMPLETED', reason: 'Demo review only' });
  const reports = manager.pendingReports();
  for (const report of reports) run({ type: 'report-receipt', actor: 'DEMO-SUPERVISOR', reportId: report.id, receipt: `simulated:demo-${report.id}` });
  console.log(JSON.stringify({ database, task: manager.get(owner.taskId), launches, eventCount: manager.events(owner.taskId).length,
    simulatedReports: reports.length, pendingReports: manager.pendingReports().length }, null, 2));
} finally { manager.close(); }
