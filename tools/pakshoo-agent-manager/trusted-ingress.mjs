import { createHash } from 'node:crypto';
import { canonicalBounded, parseBounded, validateCommand } from './input.mjs';
import { boundedResponse } from './pagination.mjs';
import { normalizeSpec } from './manager.mjs';

const fail = code => { throw new Error(code); };
const digest = text => createHash('sha256').update(text).digest('hex');
export const scopeFingerprint = spec => {
  canonicalBounded(spec);
  return digest(canonicalBounded(normalizeSpec(spec)));
};
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const permissions = {
  supervisor: ['register','decide','retry','get','events'],
  worker: ['claim','start','heartbeat','finish','get','events'],
  reporter: ['report-receipt','get','events'],
  reader: ['get','events'],
};

/** Offline authorization contract, NOT an identity provider.
 * resolveContext(handle) is installed by the trusted host, never from JSON.
 * The host must resolve an opaque handle to already-verified identity, current
 * instruction fingerprint and independently approved scope. No default identity.
 */
export class TrustedIngress {
  #manager; #resolve; #clock;
  constructor(manager, { resolveContext, clock = Date.now } = {}) {
    this.#manager = manager; this.#resolve = resolveContext; this.#clock = clock;
  }
  execute(bytes, hostHandle) {
    const request = parseBounded(bytes);
    if (typeof this.#resolve !== 'function') fail('BLOCKED_FOR_REAL_AUTH');
    const resolved = this.#resolve(hostHandle);
    if (!resolved) fail('BLOCKED_FOR_REAL_AUTH');
    // Snapshot host data; request cannot provide or override any identity field.
    const context = JSON.parse(canonicalBounded(resolved));
    if (!request || Array.isArray(request) || typeof request !== 'object') fail('INVALID_COMMAND');
    for (const field of ['actor','ownerApproved','agentId','runId','role','context','principalId','approval','grant']) {
      if (Object.hasOwn(request, field)) fail('SELF_ASSERTED_IDENTITY');
    }
    const { principalId, kind, allowedCommands, grant } = context;
    if (!identifier(principalId) || !Object.hasOwn(permissions, kind) ||
        !Array.isArray(allowedCommands) || !allowedCommands.includes(request.type) ||
        !permissions[kind].includes(request.type)) fail('SCOPE_DENIED');
    const spec = grant?.spec, approval = grant?.approval;
    const now = this.#clock();
    if (!spec || !approval || !identifier(approval.ownerId) || !hash(grant.instructionFingerprint) ||
        !Number.isSafeInteger(approval.expiresAt) || !Number.isSafeInteger(now) || approval.expiresAt <= now) fail('APPROVAL_REQUIRED');
    const specHash = scopeFingerprint(spec);
    if (approval.specFingerprint !== specHash || approval.instructionFingerprint !== grant.instructionFingerprint ||
        ['taskId','repository','sourceCommentId','baseSha'].some(key => approval[key] !== spec[key])) fail('APPROVAL_BINDING_MISMATCH');
    if (request.type === 'register') {
      if (scopeFingerprint(request.spec) !== specHash) fail('SCOPE_DENIED');
    } else if (request.type === 'report-receipt') {
      const report = this.#manager.db.prepare('SELECT task_id FROM outbox WHERE id=?').get(request.reportId);
      if (!report || report.task_id !== spec.taskId) fail('SCOPE_DENIED');
    } else if (request.taskId !== spec.taskId) fail('SCOPE_DENIED');
    if (request.type !== 'register' && scopeFingerprint(this.#manager.get(spec.taskId).spec) !== specHash) fail('SCOPE_DENIED');
    const command = { ...request };
    if (kind === 'worker') {
      if (context.role !== spec.role || !identifier(context.agentId) || !identifier(context.runId)) fail('ROLE_MISMATCH');
      if (!['get','events'].includes(request.type)) {
        Object.assign(command, { agentId: context.agentId, runId: context.runId, role: context.role });
      }
    }
    if (['register','decide','retry','report-receipt'].includes(request.type)) command.actor = principalId;
    if (request.type === 'register') command.ownerApproved = true; // Derived only from host approval verified above.
    validateCommand(command, { reads: true });
    let result;
    if (request.type === 'get') result = this.#manager.get(spec.taskId);
    else if (request.type === 'events') result = this.#manager.eventsPage(spec.taskId, { limit: request.limit, cursor: request.cursor });
    else {
      if (!identifier(request.commandId)) fail('INVALID_ID');
      // Same ID by another principal cannot expose a previous caller's receipt.
      command.commandId = `trusted:${digest(canonicalBounded([principalId, spec.repository, spec.taskId, request.commandId]))}`;
      result = this.#manager.execute(command, { binding: {
        principalId, kind, specFingerprint: specHash, instructionFingerprint: grant.instructionFingerprint,
        ownerId: approval.ownerId,
      } });
    }
    boundedResponse(result);
    return result;
  }
}
