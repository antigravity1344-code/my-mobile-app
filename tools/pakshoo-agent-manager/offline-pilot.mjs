import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, lstatSync, existsSync, openSync, closeSync, readSync, writeFileSync, appendFileSync, fsyncSync } from 'node:fs';
import { isAbsolute, resolve, relative, dirname, join, parse, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Manager } from './manager.mjs';

export const FORMAT = 'pakshoo-offline-pilot-v1';
export const TASK = 'PILOT-SYNTHETIC-001';
export const TTL = 2000; // Short synthetic lease, not a production setting.
const codeDirectory = dirname(fileURLToPath(import.meta.url));
const fail = code => { throw new Error(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

export function safePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || /^(?:\\\\|\/\/|[a-z]+:\/\/)/i.test(value)) fail('LOCAL_ABSOLUTE_PATH_REQUIRED');
  if (process.platform === 'win32' && value.slice(parse(value).root.length).includes(':')) fail('ALTERNATE_STREAM_DENIED');
  const path = resolve(value), fromCode = relative(codeDirectory, path);
  if (!fromCode || (!(fromCode === '..' || fromCode.startsWith('..' + sep)) && !isAbsolute(fromCode))) fail('DATA_INSIDE_CODE_DENIED');
  // Reject symlinks/junctions in existing ancestors. This is not protection
  // against a malicious user concurrently rewriting the same OS-owned folder.
  let current = path;
  while (true) {
    try { if (lstatSync(current).isSymbolicLink()) fail('LINK_PATH_DENIED'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current === parse(current).root) break;
    current = dirname(current);
  }
  return path;
}
function regular(path) {
  safePath(path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.nlink !== 1) fail('REGULAR_PRIVATE_FILE_REQUIRED');
  return stat;
}
function readSmall(path) {
  if (regular(path).size > 4096) fail('MANIFEST_TOO_LARGE');
  const fd = openSync(path, 'r'), buffer = Buffer.alloc(4097);
  try {
    const n = readSync(fd, buffer, 0, buffer.length, 0);
    if (n > 4096) fail('MANIFEST_TOO_LARGE');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, n)));
  } finally { closeSync(fd); }
}
function writeNew(path, value) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
export function checksum(path) {
  regular(path);
  const hash = createHash('sha256'), fd = openSync(path, 'r'), buffer = Buffer.alloc(65536);
  try { let n; while ((n = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n)); }
  finally { closeSync(fd); }
  return hash.digest('hex');
}
function metadata(db) {
  const row = db.prepare('SELECT format,instance_id FROM pilot_identity WHERE singleton=1').get();
  if (row?.format !== FORMAT || !uuid(row.instance_id)) fail('NOT_PILOT_DATABASE');
  return row;
}
function validateDirectory(directory) {
  const path = safePath(directory);
  const marker = readSmall(join(path, 'pilot.json'));
  if (marker.format !== FORMAT || marker.mode !== 'OFFLINE_DEMO' || !uuid(marker.instanceId)) fail('NOT_PILOT_DIRECTORY');
  regular(join(path, 'state.sqlite'));
  for (const file of ['state.sqlite-wal','state.sqlite-shm','writer-lock.sqlite','writer-lock.sqlite-journal','pilot.log']) {
    safePath(join(path, file));
    if (existsSync(join(path, file))) regular(join(path, file));
  }
  const db = new DatabaseSync(join(path, 'state.sqlite'), { readOnly: true });
  try { if (metadata(db).instance_id !== marker.instanceId) fail('IDENTITY_MISMATCH'); }
  finally { db.close(); }
  return { path, marker };
}
export function acquireWriter(directory) {
  const { path } = validateDirectory(directory);
  const lock = new DatabaseSync(join(path, 'writer-lock.sqlite'));
  try { lock.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE'); }
  catch { lock.close(); fail('PILOT_ALREADY_RUNNING'); }
  // OS/SQLite releases this lock after process death; no stale PID-file deletion.
  return () => { lock.exec('ROLLBACK'); lock.close(); };
}
export function initPilot(directory) {
  const path = safePath(directory);
  if (existsSync(path)) fail('DESTINATION_EXISTS');
  mkdirSync(path, { mode: 0o700 }); // Parent must exist. Never reuse an existing directory.
  const instanceId = randomUUID();
  const manager = new Manager(join(path, 'state.sqlite'), { supervisors: ['OFFLINE-SUPERVISOR'] });
  try {
    manager.db.exec('CREATE TABLE pilot_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1),format TEXT NOT NULL,instance_id TEXT NOT NULL)');
    manager.db.prepare('INSERT INTO pilot_identity VALUES(1,?,?)').run(FORMAT, instanceId);
    manager.execute({ commandId: 'pilot-register-v1', type: 'register', actor: 'OFFLINE-SUPERVISOR', ownerApproved: true,
      spec: { taskId: TASK, repository: 'offline/synthetic', sourceCommentId: 1, baseSha: '0'.repeat(40),
        role: 'OFFLINE_FIXTURE', dependencies: [], resources: ['offline:fixture'], actions: ['REPORT'] } });
  } finally { manager.close(); }
  writeNew(join(path, 'pilot.json'), { format: FORMAT, mode: 'OFFLINE_DEMO', instanceId });
  return health(path);
}
export function health(directory) {
  const { path, marker } = validateDirectory(directory);
  const db = new DatabaseSync(join(path, 'state.sqlite'), { readOnly: true });
  try {
    return { mode: 'OFFLINE_DEMO', instanceId: marker.instanceId, database: join(path, 'state.sqlite'),
      logs: join(path, 'pilot.log'), task: db.prepare('SELECT id,status,epoch,lease_until FROM tasks WHERE id=?').get(TASK),
      events: db.prepare('SELECT count(*) AS n FROM events').get().n,
      pendingReports: db.prepare('SELECT count(*) AS n FROM outbox WHERE receipt IS NULL').get().n,
      network: false, agentsLaunched: 0, realAuth: 'BLOCKED_FOR_REAL_AUTH' };
  } finally { db.close(); }
}
export function logEvent(directory, event) {
  if (!['STARTED','STOPPED','RECOVERED','ERROR'].includes(event)) fail('INVALID_LOG_EVENT');
  const path = safePath(join(safePath(directory), 'pilot.log'));
  if (existsSync(path) && regular(path).size >= 1048576) fail('LOG_LIMIT_REACHED');
  // No payload, environment, error.message, credential or arbitrary text in logs.
  appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), event, mode: 'OFFLINE_DEMO' }) + '\n', { mode: 0o600 });
}
export class PilotSession {
  #manager; #unlock; #path; #owner; #counter = 0; #closed = false;
  constructor(directory) {
    this.#path = safePath(directory); this.#unlock = acquireWriter(this.#path);
    try {
      this.#manager = new Manager(join(this.#path, 'state.sqlite'), { supervisors: ['OFFLINE-SUPERVISOR'] });
      const task = this.#manager.get(TASK);
      if (['CLAIMED','RUNNING'].includes(task.status) && task.lease_until > Date.now()) fail('PILOT_LEASE_ACTIVE_RETRY');
      const runId = randomUUID();
      const claim = this.#manager.execute({ commandId: `pilot-claim:${runId}`, type: 'claim', taskId: TASK,
        role: 'OFFLINE_FIXTURE', agentId: 'OFFLINE-SIMULATOR', runId, ttlMs: TTL });
      this.#owner = { taskId: TASK, agentId: 'OFFLINE-SIMULATOR', runId, epoch: claim.task.epoch };
      this.#manager.execute({ commandId: `pilot-start:${runId}`, type: 'start', ...this.#owner });
      logEvent(this.#path, claim.task.epoch > 1 ? 'RECOVERED' : 'STARTED');
    } catch (error) { this.#manager?.close(); this.#unlock(); this.#closed = true; throw error; }
  }
  heartbeat() {
    if (this.#closed) fail('SESSION_CLOSED');
    // Bounded demo runtime; preserve history rather than automatically pruning it.
    const bytes = ['state.sqlite','state.sqlite-wal'].reduce((n, name) => n + (existsSync(join(this.#path, name)) ? lstatSync(join(this.#path, name)).size : 0), 0);
    if (bytes > 67108864) fail('STATE_LIMIT_REACHED');
    return this.#manager.execute({ commandId: `pilot-heartbeat:${this.#owner.runId}:${++this.#counter}`,
      type: 'heartbeat', ...this.#owner, ttlMs: TTL });
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    try { logEvent(this.#path, 'STOPPED'); }
    finally { this.#manager.close(); this.#unlock(); }
    // Keep synthetic task/outbox/receipts. Restart waits for the old lease expiry.
  }
}
function integrity(db) {
  const rows = db.prepare('PRAGMA integrity_check').all();
  if (rows.length !== 1 || Object.values(rows[0])[0] !== 'ok') fail('INTEGRITY_FAILED');
  metadata(db);
}
export function backupPilot(directory, destination) {
  const { path, marker } = validateDirectory(directory), target = safePath(destination);
  if (existsSync(target)) fail('DESTINATION_EXISTS');
  mkdirSync(target, { mode: 0o700 });
  const snapshot = join(target, 'snapshot.sqlite');
  const source = new DatabaseSync(join(path, 'state.sqlite'), { readOnly: true });
  try {
    source.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL');
    source.prepare('VACUUM INTO ?').run(snapshot);
  } finally { source.close(); }
  const db = new DatabaseSync(snapshot, { readOnly: true });
  try { integrity(db); } finally { db.close(); }
  const manifest = { format: FORMAT, mode: 'OFFLINE_DEMO', snapshotId: randomUUID(), sourceInstanceId: marker.instanceId,
    createdAt: new Date().toISOString(), method: 'VACUUM INTO', file: 'snapshot.sqlite', sha256: checksum(snapshot), node: process.version };
  // Manifest is the completion marker. An interrupted folder without it is unusable.
  writeNew(join(target, 'manifest.json'), manifest);
  return { snapshotDirectory: target, ...manifest };
}
export function restorePilot(snapshotDirectory, destination) {
  const sourcePath = safePath(snapshotDirectory), target = safePath(destination);
  if (existsSync(target)) fail('DESTINATION_EXISTS');
  const manifest = readSmall(join(sourcePath, 'manifest.json'));
  if (manifest.format !== FORMAT || manifest.mode !== 'OFFLINE_DEMO' || manifest.file !== 'snapshot.sqlite' ||
      !uuid(manifest.snapshotId) || !uuid(manifest.sourceInstanceId) || !/^[a-f0-9]{64}$/.test(manifest.sha256)) fail('INVALID_SNAPSHOT');
  const snapshot = join(sourcePath, manifest.file);
  if (checksum(snapshot) !== manifest.sha256) fail('CHECKSUM_MISMATCH');
  const source = new DatabaseSync(snapshot, { readOnly: true });
  try {
    integrity(source);
    if (metadata(source).instance_id !== manifest.sourceInstanceId) fail('IDENTITY_MISMATCH');
    mkdirSync(target, { mode: 0o700 });
    source.exec('PRAGMA synchronous=FULL');
    source.prepare('VACUUM INTO ?').run(join(target, 'state.sqlite'));
  } finally { source.close(); }
  const db = new DatabaseSync(join(target, 'state.sqlite'), { readOnly: true });
  try { integrity(db); } finally { db.close(); }
  writeNew(join(target, 'pilot.json'), { format: FORMAT, mode: 'OFFLINE_DEMO', instanceId: manifest.sourceInstanceId,
    restoredFrom: manifest.snapshotId });
  return health(target);
}
