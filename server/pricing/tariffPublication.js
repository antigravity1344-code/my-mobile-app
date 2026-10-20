'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TariffError, validatePolicy } = require('./tariffEngine');

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

let locked = false;

function withLock(fn) {
  if (locked) {
    return { ok: false, code: 'REVISION_CONFLICT' };
  }
  locked = true;
  try {
    return fn();
  } finally {
    locked = false;
  }
}

function tariffFile(env = process.env) {
  const file = env && env.PAKSHO_TARIFF_FILE;
  if (typeof file !== 'string' || file.trim() === '') return null;
  return file;
}

function logFile(env) {
  const file = tariffFile(env);
  return file ? `${file}.publication.jsonl` : null;
}

function hashBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = stable(value[key]);
    return sorted;
  }
  return value;
}

function canonical(value) {
  return JSON.stringify(stable(value));
}

function instant(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function readBytes(file) {
  if (!file || !fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

function readRecords(env) {
  const file = logFile(env);
  if (!file || !fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  if (text.trim() === '') return [];
  const records = [];
  for (const line of text.split(/\n/)) {
    if (!line) continue;
    records.push(JSON.parse(line));
  }
  return records;
}

function readDurableRecords(env) {
  const file = logFile(env);
  if (file && fs.existsSync(file)) {
    // A readable committed line may have survived an unsuccessful writer fsync.
    const fd = fs.openSync(file, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  return readRecords(env);
}

function withdrawnCommitIndexes(records) {
  const withdrawn = new Set();
  for (let i = 0; i < records.length; i += 1) {
    if (records[i].state !== 'aborted') continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (records[j].requestId !== records[i].requestId) continue;
      if (records[j].state === 'prepared' || records[j].state === 'aborted') break;
      if (records[j].state === 'committed') {
        withdrawn.add(j);
        break;
      }
    }
  }
  return withdrawn;
}

function latestCommitted(records) {
  const withdrawn = withdrawnCommitIndexes(records);
  let found = null;
  for (let i = 0; i < records.length; i += 1) {
    if (records[i].state === 'committed' && !withdrawn.has(i)) found = records[i];
  }
  return found;
}

function openPrepared(records) {
  let pending = null;
  for (const record of records) {
    if (record.state === 'prepared') {
      pending = record;
      continue;
    }
    if (pending && record.requestId === pending.requestId && (record.state === 'committed' || record.state === 'aborted')) {
      pending = null;
    }
  }
  return pending;
}

function committedForRequest(records, requestId) {
  const withdrawn = withdrawnCommitIndexes(records);
  let found = null;
  for (let i = 0; i < records.length; i += 1) {
    if (records[i].state === 'committed' && records[i].requestId === requestId && !withdrawn.has(i)) found = records[i];
  }
  return found;
}

function defaultIo() {
  return {
    writeTemp(temp, bytes) {
      const fd = fs.openSync(temp, 'w');
      try {
        fs.writeSync(fd, bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    },
    replace(temp, live) {
      const aside = `${live}.aside`;
      if (fs.existsSync(aside)) fs.rmSync(aside, { force: true });
      const hadLive = fs.existsSync(live);
      if (hadLive) fs.renameSync(live, aside);
      try {
        fs.renameSync(temp, live);
      } catch (error) {
        if (hadLive && fs.existsSync(aside) && !fs.existsSync(live)) fs.renameSync(aside, live);
        throw error;
      }
      if (fs.existsSync(aside)) fs.rmSync(aside, { force: true });
    },
    appendLog(file, line) {
      const fd = fs.openSync(file, 'a');
      try {
        fs.writeSync(fd, line);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}

function appendRecord(env, record, io) {
  const file = logFile(env);
  io.appendLog(file, `${JSON.stringify(record)}\n`);
}

function restorePrevious(live, pending, io) {
  if (pending.previousBytes == null) {
    if (fs.existsSync(live)) fs.rmSync(live, { force: true });
    return;
  }
  const bytes = Buffer.from(pending.previousBytes, 'base64');
  const temp = `${live}.restore-${pending.revision}`;
  io.writeTemp(temp, bytes);
  io.replace(temp, live);
}

function recoverUnlocked(env, io = defaultIo()) {
  const livePath = tariffFile(env);
  if (!livePath) return { ok: false, code: 'TARIFF_NOT_CONFIGURED' };
  let records;
  try {
    records = readDurableRecords(env);
  } catch (error) {
    return { ok: false, code: 'TARIFF_DAMAGED' };
  }
  const pending = openPrepared(records);
  if (pending) {
    const live = readBytes(livePath);
    const liveHash = live ? hashBytes(live) : null;
    try {
      if (liveHash === pending.previousHash) {
        appendRecord(env, { ...pending, state: 'aborted', previousBytes: undefined, at: new Date().toISOString() }, io);
      } else if (liveHash === pending.hash || (liveHash == null && pending.previousBytes != null)) {
        restorePrevious(livePath, pending, io);
        appendRecord(env, { ...pending, state: 'aborted', previousBytes: undefined, at: new Date().toISOString() }, io);
      } else {
        return { ok: false, code: 'TARIFF_DAMAGED' };
      }
    } catch (error) {
      return { ok: false, code: 'TARIFF_DAMAGED' };
    }
    records = readRecords(env);
  }
  const committed = latestCommitted(records);
  const live = readBytes(livePath);
  if (!committed && !live) return { ok: true, bytes: null, committed: null };
  if (!committed || !live || hashBytes(live) !== committed.hash) {
    return { ok: false, code: 'TARIFF_DAMAGED' };
  }
  return { ok: true, bytes: live, committed };
}

function loadCommittedTariff(env = process.env) {
  const loaded = withLock(() => {
    const state = recoverUnlocked(env);
    if (!state.ok) {
      throw new TariffError('TARIFF_INVALID', 'تعرفه مورد اعتماد در دسترس نیست.');
    }
    if (!state.bytes) {
      throw new TariffError('TARIFF_NOT_CONFIGURED', 'فایل تعرفه مورد اعتماد این استقرار تنظیم نشده است.');
    }
    let parsed;
    try {
      parsed = JSON.parse(state.bytes.toString('utf8'));
    } catch (error) {
      throw new TariffError('TARIFF_INVALID', 'فایل تعرفه مورد اعتماد خوانده یا تفسیر نشد.');
    }
    return validatePolicy(parsed);
  });
  if (loaded && loaded.ok === false) {
    throw new TariffError('TARIFF_INVALID', 'تعرفه مورد اعتماد در دسترس نیست.');
  }
  return loaded;
}

function failIo(env, liveBefore, requestId, io) {
  const livePath = tariffFile(env);
  const liveAfter = readBytes(livePath);
  const beforeHash = liveBefore ? hashBytes(liveBefore) : null;
  const afterHash = liveAfter ? hashBytes(liveAfter) : null;
  if (afterHash !== beforeHash) {
    try {
      if (liveBefore) restorePrevious(livePath, { previousBytes: liveBefore.toString('base64'), revision: 'io' }, io);
      else if (fs.existsSync(livePath)) fs.rmSync(livePath, { force: true });
    } catch (error) {
      // The next committed read restores from the prepared record when one was written.
    }
  }
  try {
    const records = readRecords(env);
    const pending = openPrepared(records);
    if (pending && pending.requestId === requestId) {
      appendRecord(env, { ...pending, state: 'aborted', previousBytes: undefined, at: new Date().toISOString() }, defaultIo());
    } else if (latestCommitted(records) && latestCommitted(records).requestId === requestId) {
      appendRecord(env, { state: 'aborted', requestId, actor: 'admin', at: new Date().toISOString() }, defaultIo());
    }
  } catch (error) {
    // A missing abort stays prepared. Quote recovery must not treat it as success.
  }
  return { ok: false, code: 'IO_FAILED' };
}

function commitBytes(env, nextBytes, meta, io = defaultIo()) {
  const livePath = tariffFile(env);
  const previous = readBytes(livePath);
  const previousHash = previous ? hashBytes(previous) : null;
  const nextHash = hashBytes(nextBytes);
  const temp = path.join(path.dirname(livePath), `.${path.basename(livePath)}.${meta.revision}.tmp`);
  const prepared = {
    state: 'prepared',
    requestId: meta.requestId,
    bodyHash: meta.bodyHash,
    revision: meta.revision,
    versionId: meta.versionId,
    hash: nextHash,
    previousHash,
    previousBytes: previous ? previous.toString('base64') : null,
    actor: meta.actor || 'admin',
    at: meta.at,
  };
  try {
    io.writeTemp(temp, nextBytes);
  } catch (error) {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    return { ok: false, code: 'IO_FAILED' };
  }
  try {
    appendRecord(env, prepared, io);
  } catch (error) {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    return { ok: false, code: 'IO_FAILED' };
  }
  try {
    io.replace(temp, livePath);
  } catch (error) {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    try {
      appendRecord(env, { ...prepared, state: 'aborted', previousBytes: undefined }, defaultIo());
    } catch (abortError) {
      // Quote recovery still sees the prepared record and the untouched live file.
    }
    return { ok: false, code: 'IO_FAILED' };
  }
  try {
    appendRecord(env, {
      state: 'committed',
      requestId: meta.requestId,
      bodyHash: meta.bodyHash,
      revision: meta.revision,
      versionId: meta.versionId,
      hash: nextHash,
      actor: meta.actor || 'admin',
      at: meta.at,
    }, io);
  } catch (error) {
    return failIo(env, previous, meta.requestId, defaultIo());
  }
  return { ok: true, revision: meta.revision, versionId: meta.versionId, idempotent: false };
}

function readDocument(bytes) {
  const document = JSON.parse(bytes.toString('utf8'));
  if (!document || typeof document !== 'object' || !Number.isInteger(document.revision) || document.revision < 0) {
    return null;
  }
  return document;
}

function sameRequest(records, requestId, bodyHash) {
  const existing = committedForRequest(records, requestId);
  if (!existing) return null;
  if (existing.bodyHash !== bodyHash) return { ok: false, code: 'REQUEST_CONFLICT' };
  return {
    ok: true,
    revision: existing.revision,
    versionId: existing.versionId,
    idempotent: true,
  };
}

function currentState(env) {
  const state = recoverUnlocked(env);
  if (!state.ok) return state;
  if (!state.bytes) return { ok: false, code: 'TARIFF_NOT_CONFIGURED' };
  const document = readDocument(state.bytes);
  if (!document) return { ok: false, code: 'TARIFF_DAMAGED' };
  return { ok: true, document, records: readRecords(env) };
}

function versionBody(version) {
  return {
    id: version.id,
    validFrom: version.validFrom,
    validTo: version.validTo == null ? null : version.validTo,
    services: version.services,
  };
}

function registerDraft(input, env = process.env) {
  const requestId = input && input.requestId;
  const version = input && input.version;
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) return { ok: false, code: 'INPUT_INVALID' };
  if (!version || typeof version !== 'object' || Array.isArray(version)) return { ok: false, code: 'INPUT_INVALID' };
  if (typeof version.id !== 'string' || version.id.trim() === '') return { ok: false, code: 'INPUT_INVALID' };
  if (!Number.isInteger(input.baseRevision)) return { ok: false, code: 'INPUT_INVALID' };
  const bodyHash = hashBytes(Buffer.from(canonical(versionBody(version))));
  return withLock(() => {
    const state = currentState(env);
    if (!state.ok) return state;
    const replay = sameRequest(state.records, requestId, bodyHash);
    if (replay) return replay;
    if (state.document.revision !== input.baseRevision) return { ok: false, code: 'REVISION_CONFLICT' };
    if ((state.document.versions || []).some((item) => item.id === version.id)) {
      return { ok: false, code: 'TARIFF_INVALID' };
    }
    const next = {
      companyId: state.document.companyId,
      currencyUnit: state.document.currencyUnit,
      revision: state.document.revision + 1,
      versions: [...state.document.versions, {
        id: version.id,
        status: 'draft',
        validFrom: version.validFrom,
        validTo: version.validTo == null ? null : version.validTo,
        services: version.services,
      }],
    };
    try {
      validatePolicy(next);
    } catch (error) {
      return { ok: false, code: error instanceof TariffError ? error.code : 'TARIFF_INVALID' };
    }
    for (const prior of state.document.versions) {
      const kept = next.versions.find((item) => item.id === prior.id);
      if (!kept || canonical(kept) !== canonical(prior)) return { ok: false, code: 'TARIFF_INVALID' };
    }
    return commitBytes(env, Buffer.from(canonical(next)), {
      requestId,
      bodyHash,
      revision: next.revision,
      versionId: version.id,
      actor: input.actor || 'admin',
      at: (input.now || new Date()).toISOString(),
    }, input.io || defaultIo());
  });
}

function publishVersion(input, env = process.env) {
  const requestId = input && input.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) return { ok: false, code: 'INPUT_INVALID' };
  if (!Number.isInteger(input.baseRevision)) return { ok: false, code: 'INPUT_INVALID' };
  if (typeof input.versionId !== 'string' || input.versionId.trim() === '') return { ok: false, code: 'INPUT_INVALID' };
  const validFromMs = instant(input.validFrom);
  if (validFromMs == null) return { ok: false, code: 'INPUT_INVALID' };
  const validToMs = input.validTo == null ? null : instant(input.validTo);
  if (input.validTo != null && validToMs == null) return { ok: false, code: 'INPUT_INVALID' };
  const supersede = input.supersede == null ? null : input.supersede;
  if (supersede != null && (typeof supersede !== 'object' || Array.isArray(supersede))) {
    return { ok: false, code: 'INPUT_INVALID' };
  }
  const bodyHash = hashBytes(Buffer.from(canonical({
    versionId: input.versionId,
    validFrom: input.validFrom,
    validTo: input.validTo == null ? null : input.validTo,
    supersede: supersede == null ? null : { versionId: supersede.versionId, validTo: supersede.validTo },
  })));
  return withLock(() => {
    const state = currentState(env);
    if (!state.ok) return state;
    const replay = sameRequest(state.records, requestId, bodyHash);
    if (replay) return replay;
    if (state.document.revision !== input.baseRevision) return { ok: false, code: 'REVISION_CONFLICT' };
    const nowMs = (input.now || new Date()).getTime();
    const draft = (state.document.versions || []).find((item) => item.id === input.versionId);
    if (!draft || draft.status !== 'draft') return { ok: false, code: 'TARIFF_INVALID' };
    const nextVersions = state.document.versions.map((item) => ({ ...item, services: item.services }));
    const target = nextVersions.find((item) => item.id === input.versionId);
    target.status = 'published';
    target.validFrom = input.validFrom;
    target.validTo = input.validTo == null ? null : input.validTo;
    if (canonical(target.services) !== canonical(draft.services)) return { ok: false, code: 'TARIFF_INVALID' };
    if (supersede) {
      if (typeof supersede.versionId !== 'string' || supersede.versionId === input.versionId) {
        return { ok: false, code: 'TARIFF_INVALID' };
      }
      const closeMs = instant(supersede.validTo);
      if (closeMs == null || closeMs !== validFromMs || closeMs < nowMs) return { ok: false, code: 'TARIFF_INVALID' };
      const previous = nextVersions.find((item) => item.id === supersede.versionId);
      if (!previous || previous.status !== 'published') return { ok: false, code: 'TARIFF_INVALID' };
      const previousTo = previous.validTo == null ? null : instant(previous.validTo);
      if (previousTo != null && (previousTo <= nowMs || closeMs > previousTo)) return { ok: false, code: 'TARIFF_INVALID' };
      const opened = instant(previous.validFrom);
      if (opened == null || closeMs <= opened) return { ok: false, code: 'TARIFF_INVALID' };
      const before = canonical({ ...previous, validTo: previous.validTo == null ? null : previous.validTo });
      previous.validTo = input.validFrom;
      const after = canonical({ ...previous, validTo: previous.validTo });
      const expected = canonical({ ...JSON.parse(before), validTo: input.validFrom });
      if (after !== expected) return { ok: false, code: 'TARIFF_INVALID' };
    }
    const next = {
      companyId: state.document.companyId,
      currencyUnit: state.document.currencyUnit,
      revision: state.document.revision + 1,
      versions: nextVersions,
    };
    try {
      validatePolicy(next);
    } catch (error) {
      return { ok: false, code: error instanceof TariffError ? error.code : 'TARIFF_INVALID' };
    }
    return commitBytes(env, Buffer.from(canonical(next)), {
      requestId,
      bodyHash,
      revision: next.revision,
      versionId: input.versionId,
      actor: input.actor || 'admin',
      at: (input.now || new Date()).toISOString(),
    }, input.io || defaultIo());
  });
}

function adoptUnjournaledTariff(env = process.env, input = {}) {
  const requestId = input.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) return { ok: false, code: 'INPUT_INVALID' };
  return withLock(() => {
    const livePath = tariffFile(env);
    if (!livePath) return { ok: false, code: 'TARIFF_NOT_CONFIGURED' };
    let records = [];
    try {
      records = readDurableRecords(env);
    } catch (error) {
      return { ok: false, code: 'TARIFF_DAMAGED' };
    }
    const live = readBytes(livePath);
    if (!live) return { ok: false, code: 'TARIFF_NOT_CONFIGURED' };
    let parsed;
    try {
      parsed = JSON.parse(live.toString('utf8'));
    } catch (error) {
      return { ok: false, code: 'TARIFF_INVALID' };
    }
    try {
      validatePolicy(parsed);
    } catch (error) {
      return { ok: false, code: 'TARIFF_INVALID' };
    }
    const revision = Number.isInteger(parsed.revision) ? parsed.revision : 0;
    const bytes = Number.isInteger(parsed.revision)
      ? live
      : Buffer.from(canonical({
        companyId: parsed.companyId,
        currencyUnit: parsed.currencyUnit,
        revision: 0,
        versions: parsed.versions,
      }));
    const fileHash = hashBytes(bytes);
    const replay = committedForRequest(records, requestId);
    if (replay) {
      const liveHash = hashBytes(live);
      if (replay.hash === liveHash) {
        return { ok: true, revision: replay.revision, versionId: replay.versionId, idempotent: true };
      }
      if (replay.versionId !== 'adopt' || replay.previousHash !== liveHash) {
        return { ok: false, code: 'REQUEST_CONFLICT' };
      }
      try {
        appendRecord(env, { state: 'aborted', requestId, actor: 'admin', at: new Date().toISOString() }, defaultIo());
        records = readDurableRecords(env);
      } catch (error) {
        return { ok: false, code: 'IO_FAILED' };
      }
    }
    if (latestCommitted(records)) return { ok: false, code: 'TARIFF_INVALID' };
    const io = input.io || defaultIo();
    if (!live.equals(bytes)) {
      const temp = path.join(path.dirname(livePath), `.${path.basename(livePath)}.adopt.tmp`);
      try {
        io.writeTemp(temp, bytes);
        io.replace(temp, livePath);
      } catch (error) {
        if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
        if (!readBytes(livePath) || !readBytes(livePath).equals(live)) {
          try {
            restorePrevious(livePath, { previousBytes: live.toString('base64'), revision: 'adopt' }, defaultIo());
          } catch (restoreError) {
            return { ok: false, code: 'IO_FAILED' };
          }
        }
        return { ok: false, code: 'IO_FAILED' };
      }
    }
    try {
      appendRecord(env, {
        state: 'committed',
        requestId,
        bodyHash: fileHash,
        revision,
        versionId: 'adopt',
        hash: fileHash,
        previousHash: hashBytes(live),
        actor: input.actor || 'admin',
        at: (input.now || new Date()).toISOString(),
      }, io);
    } catch (error) {
      try {
        const written = readRecords(env).some((record) => record.state === 'committed' && record.requestId === requestId);
        if (written) {
          appendRecord(env, { state: 'aborted', requestId, actor: 'admin', at: new Date().toISOString() }, defaultIo());
        }
      } catch (withdrawError) {
        // Restore still runs; trusted reads require a successful journal fsync.
      }
      if (!live.equals(bytes)) {
        try {
          restorePrevious(livePath, { previousBytes: live.toString('base64'), revision: 'adopt' }, defaultIo());
        } catch (restoreError) {
          return { ok: false, code: 'IO_FAILED' };
        }
      }
      return { ok: false, code: 'IO_FAILED' };
    }
    return { ok: true, revision, versionId: 'adopt', idempotent: false };
  });
}

function seedCommittedPolicy(env, document, options = {}) {
  const requestId = options.requestId || `seed${crypto.randomBytes(8).toString('hex')}`.slice(0, 64);
  if (!REQUEST_ID.test(requestId)) return { ok: false, code: 'INPUT_INVALID' };
  return withLock(() => {
    const livePath = tariffFile(env);
    if (!livePath) return { ok: false, code: 'TARIFF_NOT_CONFIGURED' };
    let records = [];
    try {
      records = readRecords(env);
    } catch (error) {
      return { ok: false, code: 'TARIFF_DAMAGED' };
    }
    const committed = latestCommitted(records);
    const live = readBytes(livePath);
    if (live && (!committed || hashBytes(live) !== committed.hash)) {
      return { ok: false, code: 'TARIFF_DAMAGED' };
    }
    const revision = committed ? committed.revision + 1 : 1;
    const next = {
      companyId: document.companyId,
      currencyUnit: document.currencyUnit,
      revision,
      versions: document.versions,
    };
    try {
      validatePolicy(next);
    } catch (error) {
      return { ok: false, code: error instanceof TariffError ? error.code : 'TARIFF_INVALID' };
    }
    const bytes = Buffer.from(canonical(next));
    return commitBytes(env, bytes, {
      requestId,
      bodyHash: hashBytes(bytes),
      revision,
      versionId: options.versionId || 'seed',
      actor: 'fixture',
      at: new Date().toISOString(),
    }, options.io || defaultIo());
  });
}

module.exports = {
  hashBytes,
  canonical,
  loadCommittedTariff,
  registerDraft,
  publishVersion,
  adoptUnjournaledTariff,
  seedCommittedPolicy,
  recoverUnlocked,
};
