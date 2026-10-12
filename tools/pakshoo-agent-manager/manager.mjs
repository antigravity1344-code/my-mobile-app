import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const ALLOWED = new Set(['READ_REPO', 'WRITE_ISOLATED_BRANCH', 'REPORT']);
const ACTIVE = new Set(['CLAIMED', 'RUNNING']);
const TERMINAL = new Set(['COMPLETED', 'BLOCKED', 'FAILED']);
const fail = (code) => { throw new Error(code); };
const id = (v) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(v)) fail('INVALID_ID');
  return v;
};
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) fail('INVALID_JSON');
  return JSON.stringify(v);
}
const fingerprint = (v) => createHash('sha256').update(stable(v)).digest('hex');
const list = (v) => {
  if (!Array.isArray(v) || v.length > 100) fail('INVALID_LIST');
  const result = v.map(id).sort();
  if (new Set(result).size !== result.length) fail('DUPLICATE_LIST_ITEM');
  return result;
};
function spec(input) {
  if (!input || typeof input !== 'object') fail('INVALID_SPEC');
  const fields = new Set(['taskId','repository','sourceCommentId','baseSha','role','dependencies','resources','actions']);
  if (Object.keys(input).some(k => !fields.has(k))) fail('UNKNOWN_SPEC_FIELD');
  const { taskId, repository, sourceCommentId, baseSha, role, dependencies = [], resources = [], actions = [] } = input;
  id(taskId); id(role);
  if (typeof repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repository)) fail('INVALID_REPOSITORY');
  if (!Number.isSafeInteger(sourceCommentId) || sourceCommentId <= 0) fail('INVALID_SOURCE');
  if (typeof baseSha !== 'string' || !/^[a-f0-9]{40}$/.test(baseSha)) fail('INVALID_BASE_SHA');
  const grants = list(actions);
  if (grants.some(a => !ALLOWED.has(a))) fail('FORBIDDEN_ACTION');
  return { taskId, repository, sourceCommentId, baseSha, role, dependencies: list(dependencies), resources: list(resources), actions: grants };
}

/** Local trusted-process prototype. Agent/run IDs and epochs are NOT credentials. */
export class Manager {
  constructor(path, { supervisors, clock = Date.now } = {}) {
    if (typeof path !== 'string' || !path) fail('DATABASE_PATH_REQUIRED');
    if (!Array.isArray(supervisors) || !supervisors.length) fail('SUPERVISORS_REQUIRED');
    this.supervisors = new Set(supervisors.map(id));
    this.clock = clock;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout=5000;
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      INSERT OR IGNORE INTO meta VALUES ('last_now', 0);
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, spec TEXT NOT NULL, spec_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('NEW','CLAIMED','RUNNING','REVIEW','COMPLETED','BLOCKED','FAILED')),
        revision INTEGER NOT NULL, epoch INTEGER NOT NULL,
        agent TEXT, run TEXT, lease_until INTEGER, result TEXT
      );
      CREATE TABLE IF NOT EXISTS resources (name TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id));
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id),
        kind TEXT NOT NULL, at INTEGER NOT NULL, data TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_replace BEFORE INSERT ON events
        WHEN EXISTS(SELECT 1 FROM events WHERE seq=NEW.seq)
        BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
      CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, hash TEXT NOT NULL, response TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY REFERENCES events(seq), task_id TEXT NOT NULL REFERENCES tasks(id),
        marker TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, receipt TEXT
      );
    `);
  }
  close() { this.db.close(); }
  #tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  #now() {
    const raw = this.clock();
    if (!Number.isSafeInteger(raw) || raw < 0) fail('INVALID_CLOCK');
    const previous = this.db.prepare("SELECT value FROM meta WHERE key='last_now'").get().value;
    const now = Math.max(raw, previous);
    this.db.prepare("UPDATE meta SET value=? WHERE key='last_now'").run(now);
    return now;
  }
  #task(taskId) {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id(taskId));
    if (!row) fail('TASK_NOT_FOUND');
    return { ...row, spec: JSON.parse(row.spec), result: row.result ? JSON.parse(row.result) : null };
  }
  get(taskId) { return this.#task(taskId); }
  events(taskId) {
    return this.db.prepare('SELECT * FROM events WHERE task_id=? ORDER BY seq').all(id(taskId))
      .map(r => ({ ...r, data: JSON.parse(r.data) }));
  }
  pendingReports() {
    return this.db.prepare('SELECT * FROM outbox WHERE receipt IS NULL ORDER BY id').all()
      .map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  }
  #supervisor(actor) {
    if (!this.supervisors.has(actor)) fail('SUPERVISOR_REQUIRED');
  }
  #revision(task, expected) {
    if (expected !== task.revision) fail('REVISION_CONFLICT');
  }
  #ttl(ttlMs) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 100 || ttlMs > 86400000) fail('INVALID_LEASE');
    return ttlMs;
  }
  #until(now, ttlMs) {
    const until = now + this.#ttl(ttlMs);
    if (!Number.isSafeInteger(until)) fail('INVALID_CLOCK');
    return until;
  }
  #lease(task, c, now) {
    if (!ACTIVE.has(task.status) || task.agent !== c.agentId || task.run !== c.runId || task.epoch !== c.epoch) fail('STALE_OWNER');
    if (task.lease_until <= now) fail('LEASE_EXPIRED');
  }
  #release(taskId) {
    this.db.prepare('DELETE FROM resources WHERE task_id=?').run(taskId);
  }
  #event(taskId, kind, now, data) {
    const eventId = Number(this.db.prepare('INSERT INTO events(task_id,kind,at,data) VALUES(?,?,?,?)')
      .run(taskId, kind, now, stable(data)).lastInsertRowid);
    const task = this.#task(taskId);
    const payload = {
      taskId, role: task.spec.role, sourceCommentId: task.spec.sourceCommentId,
      repository: task.spec.repository, baseSha: task.spec.baseSha,
      status: task.status, revision: task.revision, epoch: task.epoch,
      agentId: task.agent, runId: task.run, kind, at: now, details: data,
    };
    const marker = `pakshoo-agent-manager:${taskId}:${eventId}`;
    this.db.prepare('INSERT INTO outbox(id,task_id,marker,payload) VALUES(?,?,?,?)')
      .run(eventId, taskId, marker, stable(payload));
  }
  /** Every mutation, command receipt, event and report is one SQLite transaction. */
  execute(c) {
    if (!c || typeof c !== 'object') fail('INVALID_COMMAND');
    id(c.commandId);
    const hash = fingerprint(c);
    const outcome = this.#tx(() => {
      // Read the clock AFTER obtaining the write lock. Preserve observed time on
      // rejected commands using a savepoint; state/events/receipts still roll back.
      const now = this.#now();
      this.db.exec('SAVEPOINT command');
      try {
      const previous = this.db.prepare('SELECT * FROM commands WHERE id=?').get(c.commandId);
      if (previous) {
        if (previous.hash !== hash) fail('COMMAND_ID_CONFLICT');
        this.db.exec('RELEASE command');
        return { response: { ...JSON.parse(previous.response), replayed: true } };
      }
      const response = this.#apply(c, now);
      this.db.prepare('INSERT INTO commands VALUES(?,?,?)').run(c.commandId, hash, stable(response));
      this.db.exec('RELEASE command');
      return { response };
      } catch (error) {
        this.db.exec('ROLLBACK TO command; RELEASE command');
        return { error };
      }
    });
    if (outcome.error) throw outcome.error;
    return outcome.response;
  }
  #apply(c, now) {
    if (c.type === 'register') {
      this.#supervisor(c.actor);
      if (c.ownerApproved !== true) fail('OWNER_APPROVAL_REQUIRED');
      const definition = spec(c.spec);
      const hash = fingerprint(definition);
      const existing = this.db.prepare('SELECT spec_hash FROM tasks WHERE id=?').get(definition.taskId);
      if (existing) {
        if (existing.spec_hash !== hash) fail('TASK_ID_CONFLICT');
        return { task: this.#task(definition.taskId), duplicate: true };
      }
      for (const dependency of definition.dependencies) this.#task(dependency);
      this.db.prepare("INSERT INTO tasks(id,spec,spec_hash,status,revision,epoch) VALUES(?,?,?,'NEW',1,0)")
        .run(definition.taskId, stable(definition), hash);
      this.#event(definition.taskId, 'REGISTERED', now, { actor: c.actor });
      return { task: this.#task(definition.taskId), duplicate: false };
    }
    if (c.type === 'report-receipt') {
      this.#supervisor(c.actor);
      if (!Number.isSafeInteger(c.reportId)) fail('INVALID_REPORT');
      // Prototype receipt only, never proof of a real GitHub delivery.
      id(c.receipt);
      if (!c.receipt.startsWith('simulated:')) fail('SIMULATED_RECEIPT_REQUIRED');
      const report = this.db.prepare('SELECT receipt FROM outbox WHERE id=?').get(c.reportId);
      if (!report) fail('REPORT_NOT_FOUND');
      if (report.receipt && report.receipt !== c.receipt) fail('RECEIPT_CONFLICT');
      this.db.prepare('UPDATE outbox SET receipt=? WHERE id=?').run(c.receipt, c.reportId);
      return { reportId: c.reportId, receipt: c.receipt, simulated: true };
    }
    const task = this.#task(c.taskId);
    if (c.type === 'claim') {
      id(c.agentId); id(c.runId);
      if (c.role !== task.spec.role) fail('ROLE_MISMATCH');
      const until = this.#until(now, c.ttlMs);
      if (task.status !== 'NEW' && !(ACTIVE.has(task.status) && task.lease_until <= now)) fail('TASK_UNAVAILABLE');
      for (const dependency of task.spec.dependencies) {
        if (this.#task(dependency).status !== 'COMPLETED') fail('DEPENDENCY_NOT_COMPLETED');
      }
      for (const resource of task.spec.resources) {
        const lock = this.db.prepare('SELECT task_id FROM resources WHERE name=?').get(resource);
        if (!lock || lock.task_id === task.id) continue;
        const holder = this.#task(lock.task_id);
        if (holder.status === 'REVIEW' || (ACTIVE.has(holder.status) && holder.lease_until > now)) fail('RESOURCE_BUSY');
      }
      this.#release(task.id);
      for (const resource of task.spec.resources) {
        this.db.prepare('INSERT INTO resources(name,task_id) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET task_id=excluded.task_id')
          .run(resource, task.id);
      }
      this.db.prepare("UPDATE tasks SET status='CLAIMED',revision=revision+1,epoch=epoch+1,agent=?,run=?,lease_until=?,result=NULL WHERE id=?")
        .run(c.agentId, c.runId, until, task.id);
      this.#event(task.id, task.status === 'NEW' ? 'CLAIMED' : 'LEASE_RECOVERED', now,
        { previousEpoch: task.epoch, agentId: c.agentId, runId: c.runId });
      return { task: this.#task(task.id) };
    }
    if (c.type === 'heartbeat' || c.type === 'start' || c.type === 'finish') {
      this.#lease(task, c, now);
      if (c.type === 'heartbeat') {
        const until = Math.max(task.lease_until, this.#until(now, c.ttlMs));
        this.db.prepare('UPDATE tasks SET revision=revision+1,lease_until=? WHERE id=?').run(until, task.id);
        this.#event(task.id, 'HEARTBEAT', now, { epoch: c.epoch });
      } else if (c.type === 'start') {
        if (task.status !== 'CLAIMED') fail('INVALID_TRANSITION');
        this.db.prepare("UPDATE tasks SET status='RUNNING',revision=revision+1 WHERE id=?").run(task.id);
        this.#event(task.id, 'STARTED', now, { epoch: c.epoch });
      } else {
        if (task.status !== 'RUNNING' || !['REVIEW', 'BLOCKED', 'FAILED'].includes(c.status)) fail('INVALID_TRANSITION');
        if (!c.report || typeof c.report !== 'object' || Array.isArray(c.report) || typeof c.report.summary !== 'string' || !c.report.summary.trim()) fail('REPORT_REQUIRED');
        const serializedReport = stable(c.report);
        if (Buffer.byteLength(serializedReport, 'utf8') > 32768) fail('REPORT_TOO_LARGE');
        this.db.prepare('UPDATE tasks SET status=?,revision=revision+1,agent=NULL,run=NULL,lease_until=NULL,result=? WHERE id=?')
          .run(c.status, serializedReport, task.id);
        if (c.status !== 'REVIEW') this.#release(task.id);
        this.#event(task.id, c.status, now, { epoch: c.epoch, agentId: c.agentId, runId: c.runId, report: c.report });
      }
      return { task: this.#task(task.id) };
    }
    if (c.type === 'decide') {
      this.#supervisor(c.actor);
      this.#revision(task, c.expectedRevision);
      if (TERMINAL.has(task.status) || !['COMPLETED','BLOCKED','FAILED'].includes(c.status)) fail('INVALID_TRANSITION');
      if (c.status === 'COMPLETED' && task.status !== 'REVIEW') fail('REVIEW_REQUIRED');
      if (typeof c.reason !== 'string' || !c.reason.trim() || c.reason.length > 2000) fail('REASON_REQUIRED');
      this.db.prepare('UPDATE tasks SET status=?,revision=revision+1,agent=NULL,run=NULL,lease_until=NULL WHERE id=?')
        .run(c.status, task.id);
      this.#release(task.id);
      this.#event(task.id, 'SUPERVISOR_DECISION', now, { actor: c.actor, status: c.status, reason: c.reason });
      return { task: this.#task(task.id) };
    }
    if (c.type === 'retry') {
      this.#supervisor(c.actor);
      this.#revision(task, c.expectedRevision);
      if (!['BLOCKED','FAILED'].includes(task.status)) fail('RETRY_NOT_ALLOWED');
      if (typeof c.reason !== 'string' || !c.reason.trim() || c.reason.length > 2000) fail('REASON_REQUIRED');
      this.db.prepare("UPDATE tasks SET status='NEW',revision=revision+1,result=NULL WHERE id=?").run(task.id);
      this.#event(task.id, 'REOPENED', now, { actor: c.actor, reason: c.reason });
      return { task: this.#task(task.id) };
    }
    fail('UNKNOWN_COMMAND');
  }
}
