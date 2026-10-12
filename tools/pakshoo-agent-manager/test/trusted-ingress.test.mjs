import test from 'node:test';
import assert from 'node:assert/strict';
import { TrustedIngress, scopeFingerprint } from '../trusted-ingress.mjs';
import { fixture, definition } from './security-helpers.mjs';
import { Manager } from '../manager.mjs';

const bytes = command => Buffer.from(JSON.stringify(command));
function setup(t) {
  const f = fixture(t), spec = definition();
  const instructionFingerprint = 'a'.repeat(64);
  const grant = { spec, instructionFingerprint, approval: {
    ownerId: 'OWNER', taskId: spec.taskId, repository: spec.repository,
    sourceCommentId: spec.sourceCommentId, baseSha: spec.baseSha,
    specFingerprint: scopeFingerprint(spec), instructionFingerprint, expiresAt: 2000,
  } };
  const contexts = new WeakMap();
  const supervisor = {}, worker = {}, reader = {};
  contexts.set(supervisor, { principalId: 'SUPERVISOR', kind: 'supervisor', allowedCommands: ['register','decide','retry','get','events'], grant });
  contexts.set(worker, { principalId: 'WORKER', kind: 'worker', role: spec.role, agentId: 'WORKER', runId: 'RUN',
    allowedCommands: ['claim','start','heartbeat','finish','get','events'], grant });
  contexts.set(reader, { principalId: 'READER', kind: 'reader', allowedCommands: ['get','events'], grant });
  let now = 1000;
  const ingress = new TrustedIngress(f.manager, { resolveContext: handle => contexts.get(handle), clock: () => now });
  const registration = { commandId: 'register', type: 'register', spec };
  const run = (command, handle = supervisor) => ingress.execute(bytes(command), handle);
  const start = () => {
    run(registration);
    run({ commandId: 'claim', type: 'claim', taskId: spec.taskId, ttlMs: 60000 }, worker);
    run({ commandId: 'start', type: 'start', taskId: spec.taskId, epoch: 1 }, worker);
  };
  return { ...f, spec, grant, contexts, supervisor, worker, reader, ingress, run, registration, start, time: n => { now = n; } };
}
test('no host resolver or unknown handle is BLOCKED_FOR_REAL_AUTH without mutation', t => {
  const f = setup(t), before = f.snapshot();
  assert.throws(() => new TrustedIngress(f.manager).execute(bytes(f.registration)), /BLOCKED_FOR_REAL_AUTH/);
  assert.throws(() => f.run(f.registration, {}), /BLOCKED_FOR_REAL_AUTH/);
  assert.deepEqual(f.snapshot(), before);
});
test('payload actor, approval and worker identity cannot override host context', t => {
  const f = setup(t), before = f.snapshot();
  for (const field of ['actor','ownerApproved','agentId','runId','role','context','principalId','approval','grant']) {
    assert.throws(() => f.run({ ...f.registration, [field]: true }), /SELF_ASSERTED_IDENTITY/);
    assert.deepEqual(f.snapshot(), before);
  }
});
test('approval binds task, source comment, base SHA, instruction and complete action/resource scope', t => {
  const f = setup(t), before = f.snapshot();
  const original = structuredClone(f.grant);
  for (const [field, value] of [['taskId','OTHER'], ['sourceCommentId',123], ['baseSha','b'.repeat(40)],
    ['repository','other/repo'], ['actions',['WRITE_ISOLATED_BRANCH']], ['resources',['branch:other']]]) {
    f.grant.spec = { ...original.spec, [field]: value };
    assert.throws(() => f.run({ ...f.registration, spec: f.grant.spec }), /APPROVAL_BINDING_MISMATCH/);
    assert.deepEqual(f.snapshot(), before);
  }
  f.grant.spec = original.spec;
  f.grant.instructionFingerprint = 'b'.repeat(64);
  assert.throws(() => f.run(f.registration), /APPROVAL_BINDING_MISMATCH/);
  assert.deepEqual(f.snapshot(), before);
});
test('missing/expired approval and an unapproved payload spec are denied', t => {
  const f = setup(t), before = f.snapshot();
  const approval = f.grant.approval;
  f.grant.approval = null;
  assert.throws(() => f.run(f.registration), /APPROVAL_REQUIRED/);
  f.grant.approval = approval; f.time(2000);
  assert.throws(() => f.run(f.registration), /APPROVAL_REQUIRED/);
  f.time(1000);
  assert.throws(() => f.run({ ...f.registration, spec: { ...f.spec, taskId: 'OTHER' } }), /SCOPE_DENIED/);
  assert.deepEqual(f.snapshot(), before);
});
test('wrong role or privilege denied, including reads across task scope and global pending reports', t => {
  const f = setup(t); f.run(f.registration); const before = f.snapshot();
  assert.throws(() => f.run(f.registration, f.worker), /SCOPE_DENIED/);
  f.contexts.get(f.worker).role = 'UX_UI_CHATGPT';
  assert.throws(() => f.run({ commandId: 'claim', type: 'claim', taskId: f.spec.taskId, ttlMs: 60000 }, f.worker), /ROLE_MISMATCH/);
  assert.throws(() => f.run({ type: 'get', taskId: 'OTHER' }, f.reader), /SCOPE_DENIED/);
  assert.throws(() => f.run({ type: 'pending-reports' }, f.reader), /SCOPE_DENIED/);
  assert.deepEqual(f.snapshot(), before);
});
test('host-derived identity permits offline lifecycle and durable replay rejects changed report', t => {
  const f = setup(t); f.start();
  const command = { commandId: 'finish', type: 'finish', taskId: f.spec.taskId, epoch: 1, status: 'REVIEW', report: { summary: 'offline only' } };
  f.run(command, f.worker);
  assert.equal(f.manager.get(f.spec.taskId).status, 'REVIEW');
  const before = f.snapshot();
  assert.equal(f.run(command, f.worker).replayed, true);
  const reopened = new Manager(f.path, { supervisors: ['SUPERVISOR'], clock: () => 1000 });
  try {
    const ingress = new TrustedIngress(reopened, { resolveContext: handle => f.contexts.get(handle), clock: () => 1000 });
    assert.equal(ingress.execute(bytes(command), f.worker).replayed, true);
  } finally { reopened.close(); }
  assert.throws(() => f.run({ ...command, report: { summary: 'contradiction' } }, f.worker), /COMMAND_ID_CONFLICT/);
  assert.deepEqual(f.snapshot(), before);
  f.run({ commandId: 'decide', type: 'decide', taskId: f.spec.taskId,
    expectedRevision: f.manager.get(f.spec.taskId).revision, status: 'COMPLETED', reason: 'offline review' });
  assert.equal(f.run({ type: 'get', taskId: f.spec.taskId }, f.reader).status, 'COMPLETED');
});
test('approval changes and other principals cannot obtain a previous principal receipt', t => {
  const f = setup(t); f.start(); const before = f.snapshot();
  f.grant.instructionFingerprint = 'b'.repeat(64);
  f.grant.approval.instructionFingerprint = 'b'.repeat(64);
  assert.throws(() => f.run({ commandId: 'claim', type: 'claim', taskId: f.spec.taskId, ttlMs: 60000 }, f.worker), /COMMAND_ID_CONFLICT/);
  f.grant.instructionFingerprint = 'a'.repeat(64); f.grant.approval.instructionFingerprint = 'a'.repeat(64);
  const other = {};
  f.contexts.set(other, { ...f.contexts.get(f.worker), principalId: 'OTHER', agentId: 'OTHER' });
  assert.throws(() => f.run({ commandId: 'claim', type: 'claim', taskId: f.spec.taskId, ttlMs: 60000 }, other), /TASK_UNAVAILABLE/);
  assert.deepEqual(f.snapshot(), before);
});
test('reporter receipts are task-scoped and cannot be used to acknowledge another task', t => {
  const f = setup(t); f.run(f.registration); f.register('OTHER');
  const reporter = {};
  f.contexts.set(reporter, { principalId: 'SUPERVISOR', kind: 'reporter', allowedCommands: ['report-receipt'], grant: f.grant });
  const before = f.snapshot();
  assert.throws(() => f.run({ commandId: 'receipt', type: 'report-receipt', reportId: 2, receipt: 'simulated:test' }, reporter), /SCOPE_DENIED/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.run({ commandId: 'receipt', type: 'report-receipt', reportId: 1, receipt: 'simulated:test' }, reporter).simulated, true);
});

test('scope fingerprint uses the same normalization as stored task definitions', t => {
  const f = setup(t);
  f.spec.actions.reverse(); // Action order is semantically irrelevant in core.
  f.run(f.registration);
  assert.equal(f.run({ type: 'get', taskId: f.spec.taskId }, f.reader).id, f.spec.taskId);
  assert.equal(scopeFingerprint(f.spec), scopeFingerprint(f.manager.get(f.spec.taskId).spec));
});
