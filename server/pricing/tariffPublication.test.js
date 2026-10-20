'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { quote } = require('./tariffEngine');
const {
  adoptUnjournaledTariff,
  hashBytes,
  loadCommittedTariff,
  publishVersion,
  registerDraft,
  seedCommittedPolicy,
} = require('./tariffPublication');

const NOW = new Date('2026-10-20T00:00:00.000Z');
const FROM = '2026-10-20T00:00:00.000Z';

function envFor(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  return { PAKSHO_TARIFF_FILE: path.join(dir, 'tariff.json') };
}

function hour(rate) {
  return { model: 'hourly', rate, surcharges: [], factors: [], discounts: [] };
}

function seed(env, versions) {
  const seeded = seedCommittedPolicy(env, {
    companyId: 'deployment-under-test',
    currencyUnit: 'minor',
    versions,
  });
  assert.equal(seeded.ok, true, seeded.code);
  return seeded;
}

function draft(id, rate, validFrom = '2026-12-01T00:00:00.000Z') {
  return {
    id,
    validFrom,
    validTo: null,
    services: { hour: hour(rate) },
  };
}

function document(env) {
  return JSON.parse(fs.readFileSync(env.PAKSHO_TARIFF_FILE, 'utf8'));
}

function committedCount(env) {
  const log = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8');
  return log.split('\n').filter((line) => line.includes('"state":"committed"')).length;
}

test('two publishes with one base revision commit once and keep the winner', () => {
  const env = envFor('paksho-pub-race-');
  seed(env, []);
  assert.equal(registerDraft({
    baseRevision: 1, requestId: 'register01', version: draft('v-a', 3), actor: 'admin', now: NOW,
  }, env).ok, true);
  assert.equal(registerDraft({
    baseRevision: 2, requestId: 'register02', version: draft('v-b', 4, '2027-01-01T00:00:00.000Z'), actor: 'admin', now: NOW,
  }, env).ok, true);
  const before = committedCount(env);
  const first = publishVersion({
    baseRevision: 3, requestId: 'publish001', versionId: 'v-a', validFrom: '2026-12-01T00:00:00.000Z', validTo: null, actor: 'admin', now: NOW,
  }, env);
  const second = publishVersion({
    baseRevision: 3, requestId: 'publish002', versionId: 'v-b', validFrom: '2027-01-01T00:00:00.000Z', validTo: null, actor: 'admin', now: NOW,
  }, env);
  assert.equal(first.ok, true);
  assert.equal(first.revision, 4);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'REVISION_CONFLICT');
  assert.equal(committedCount(env), before + 1);
  const saved = document(env);
  assert.equal(saved.revision, 4);
  assert.equal(saved.versions.find((item) => item.id === 'v-a').status, 'published');
  assert.equal(saved.versions.find((item) => item.id === 'v-a').services.hour.rate, 3);
  assert.equal(saved.versions.find((item) => item.id === 'v-b').status, 'draft');
});

test('repeating a committed requestId is stable, and a different body conflicts', () => {
  const env = envFor('paksho-pub-retry-');
  seed(env, []);
  const version = draft('v-a', 3);
  const first = registerDraft({ baseRevision: 1, requestId: 'register01', version, actor: 'admin', now: NOW }, env);
  const retry = registerDraft({ baseRevision: 1, requestId: 'register01', version, actor: 'admin', now: NOW }, env);
  const changed = registerDraft({
    baseRevision: 2, requestId: 'register01', version: draft('v-a', 9), actor: 'admin', now: NOW,
  }, env);
  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.revision, first.revision);
  assert.equal(changed.ok, false);
  assert.equal(changed.code, 'REQUEST_CONFLICT');
  assert.equal(document(env).versions.length, 1);
  assert.equal(document(env).versions[0].services.hour.rate, 3);
});

test('a failed write keeps the previous file and is not success', () => {
  const env = envFor('paksho-pub-io-');
  seed(env, []);
  const before = fs.readFileSync(env.PAKSHO_TARIFF_FILE);
  const beforeLog = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`);
  function fail(kind) {
    let commits = 0;
    return {
      writeTemp(temp, bytes) {
        if (kind === 'write' || kind === 'flush') throw new Error('injected');
        const fd = fs.openSync(temp, 'w');
        try {
          fs.writeSync(fd, bytes);
          if (kind !== 'flush-after') fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        if (kind === 'flush-after') throw new Error('injected');
      },
      replace(temp, live) {
        if (kind === 'replace') throw new Error('injected');
        const aside = `${live}.aside`;
        if (fs.existsSync(live)) fs.renameSync(live, aside);
        fs.renameSync(temp, live);
        if (fs.existsSync(aside)) fs.rmSync(aside, { force: true });
      },
      appendLog(file, line) {
        if (kind === 'commit' && line.includes('"state":"committed"')) {
          commits += 1;
          throw new Error('injected');
        }
        fs.appendFileSync(file, line);
      },
    };
  }
  for (const kind of ['write', 'flush-after', 'replace']) {
    const result = registerDraft({
      baseRevision: 1, requestId: 'register01', version: draft('v-a', 3), actor: 'admin', now: NOW, io: fail(kind),
    }, env);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'IO_FAILED');
    assert.deepEqual(fs.readFileSync(env.PAKSHO_TARIFF_FILE), before);
    const lines = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8').split('\n');
    assert.equal(lines.some((line) => line.includes('register01') && line.includes('"state":"committed"')), false);
  }
  const committedFail = registerDraft({
    baseRevision: 1, requestId: 'register0b', version: draft('v-b', 3), actor: 'admin', now: NOW, io: fail('commit'),
  }, env);
  assert.equal(committedFail.ok, false);
  assert.equal(committedFail.code, 'IO_FAILED');
  assert.deepEqual(fs.readFileSync(env.PAKSHO_TARIFF_FILE), before);
  const log = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8');
  assert.equal(log.split('\n').some((line) => line.includes('register0b') && line.includes('"state":"committed"')), false);
  assert.equal(log.startsWith(beforeLog.toString('utf8')), true);
  const policy = loadCommittedTariff(env);
  assert.equal(policy.versions.length, 0);
});

test('supersede closes only the named version and leaves its rate and past start', () => {
  const env = envFor('paksho-pub-close-');
  seed(env, [{
    id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null,
    services: { hour: hour(3) },
  }]);
  assert.equal(registerDraft({
    baseRevision: 1, requestId: 'register01', version: draft('v2', 4, FROM), actor: 'admin', now: NOW,
  }, env).ok, true);
  const past = publishVersion({
    baseRevision: 2, requestId: 'publish00p', versionId: 'v2', validFrom: '2020-06-01T00:00:00.000Z', validTo: null,
    supersede: { versionId: 'v1', validTo: '2020-06-01T00:00:00.000Z' }, actor: 'admin', now: NOW,
  }, env);
  assert.equal(past.ok, false);
  assert.equal(document(env).versions.find((item) => item.id === 'v1').validTo, null);
  const published = publishVersion({
    baseRevision: 2, requestId: 'publish001', versionId: 'v2', validFrom: FROM, validTo: null,
    supersede: { versionId: 'v1', validTo: FROM }, actor: 'admin', now: NOW,
  }, env);
  assert.equal(published.ok, true);
  const saved = document(env);
  const v1 = saved.versions.find((item) => item.id === 'v1');
  const v2 = saved.versions.find((item) => item.id === 'v2');
  assert.equal(v1.validFrom, '2020-01-01T00:00:00.000Z');
  assert.equal(v1.validTo, FROM);
  assert.equal(v1.services.hour.rate, 3);
  assert.equal(v2.status, 'published');
  assert.equal(v2.services.hour.rate, 4);
  assert.equal(saved.currencyUnit, 'minor');
  const pastQuote = quote(loadCommittedTariff(env), { at: '2020-06-01T00:00:00.000Z', serviceId: 'hour', quantity: 2 });
  assert.equal(pastQuote.tariffVersionId, 'v1');
  assert.equal(pastQuote.total, 6);
  const nextQuote = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 2 });
  assert.equal(nextQuote.tariffVersionId, 'v2');
  assert.equal(nextQuote.total, 8);
});

test('quote and confirmation see only a committed tariff', () => {
  const env = envFor('paksho-pub-commit-');
  seed(env, [{
    id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null,
    services: { hour: hour(3) },
  }]);
  const seen = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 1 });
  assert.equal(seen.total, 3);
  fs.writeFileSync(env.PAKSHO_TARIFF_FILE, JSON.stringify({
    companyId: 'deployment-under-test', currencyUnit: 'minor', revision: 99,
    versions: [{ id: 'v-evil', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null, services: { hour: hour(9) } }],
  }));
  assert.throws(() => loadCommittedTariff(env), (error) => error.code === 'TARIFF_INVALID');
});

test('publication does not rewrite orders, and a new order still needs a committed quote', async (t) => {
  const env = envFor('paksho-pub-order-');
  const previous = {
    file: process.env.PAKSHO_TARIFF_FILE,
    secret: process.env.PAKSHO_QUOTE_SECRET,
    mode: process.env.PAKSHO_PRICING_MODE,
    node: process.env.NODE_ENV,
  };
  process.env.PAKSHO_TARIFF_FILE = env.PAKSHO_TARIFF_FILE;
  process.env.PAKSHO_QUOTE_SECRET = 'stage4-isolated-quote-secret';
  process.env.PAKSHO_PRICING_MODE = 'server';
  process.env.NODE_ENV = 'test';
  seed(env, [{
    id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z',
    services: { hour: hour(1000) },
  }]);
  const { createTestHarness, request } = require('../testAuthHarness');
  const harness = createTestHarness('paksho-d60-stage4-');
  t.after(() => {
    harness.close();
    for (const [key, value] of Object.entries({
      PAKSHO_TARIFF_FILE: previous.file,
      PAKSHO_QUOTE_SECRET: previous.secret,
      PAKSHO_PRICING_MODE: previous.mode,
      NODE_ENV: previous.node,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120001001');
  const worker = await harness.login(server, '09120001002', 'WORKER');
  const admin = await harness.adminLogin(server);
  const anonymous = await request(server, {
    method: 'POST', pathname: '/api/admin/tariff-versions', body: { baseRevision: 1, requestId: 'register01' },
  });
  assert.equal(anonymous.status, 401);
  const asCustomer = await request(server, {
    method: 'POST', pathname: '/api/admin/tariff-versions', token: customer.token,
    body: { baseRevision: 1, requestId: 'register01', version: draft('v2', 4, FROM) },
  });
  assert.equal(asCustomer.status, 401);
  const asWorker = await request(server, {
    method: 'POST', pathname: '/api/admin/tariff-versions/v2/publish', token: worker.token,
    body: { baseRevision: 1, requestId: 'publish001', validFrom: FROM },
  });
  assert.equal(asWorker.status, 401);
  const quoted = await request(server, {
    method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hour', quantity: 2 },
  });
  assert.equal(quoted.status, 200);
  assert.equal(quoted.json.quote.total, 2000);
  const tokenBody = quoted.json.quote.quoteToken.slice(0, quoted.json.quote.quoteToken.lastIndexOf('.'));
  const signed = JSON.parse(Buffer.from(tokenBody, 'base64url').toString('utf8'));
  assert.equal(signed.total, 2000);
  assert.equal(signed.tariffVersionId, 'v1');
  const placed = await request(server, {
    method: 'POST', pathname: '/api/orders', token: customer.token,
    body: {
      serviceTitle: 'خدمت آزمایشی', address: 'آدرس ساختگی', date: '1405-01-01', time: '10:00',
      serviceId: 'hour', quantity: 2, quoteToken: quoted.json.quote.quoteToken, confirmedTotal: 2000,
      clientRequestId: 'stage4order1',
    },
  });
  assert.equal(placed.status, 200);
  assert.equal(placed.json.order.price, 2000);
  const orderId = placed.json.order.id;
  const registered = await request(server, {
    method: 'POST', pathname: '/api/admin/tariff-versions', token: admin,
    body: { baseRevision: 1, requestId: 'register01', version: draft('v2', 4, FROM) },
  });
  assert.equal(registered.status, 200);
  const published = await request(server, {
    method: 'POST', pathname: '/api/admin/tariff-versions/v2/publish', token: admin,
    body: {
      baseRevision: registered.json.revision, requestId: 'publish001', validFrom: '2098-06-01T00:00:00.000Z', validTo: null,
      supersede: { versionId: 'v1', validTo: '2098-06-01T00:00:00.000Z' },
    },
  });
  assert.equal(published.status, 200);
  assert.notEqual(published.status, 403);
  const replay = await request(server, {
    method: 'POST', pathname: '/api/orders', token: customer.token,
    body: {
      serviceTitle: 'خدمت آزمایشی', address: 'آدرس ساختگی', date: '1405-01-01', time: '10:00',
      serviceId: 'hour', quantity: 2, quoteToken: quoted.json.quote.quoteToken, confirmedTotal: 2000,
      clientRequestId: 'stage4order1',
    },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.duplicate, true);
  assert.equal(replay.json.order.id, orderId);
  assert.equal(replay.json.order.price, 2000);
  const listed = await request(server, { method: 'GET', pathname: '/api/orders', token: customer.token });
  assert.equal(listed.json.orders.find((order) => order.id === orderId).price, 2000);
  const decodedAgain = JSON.parse(Buffer.from(tokenBody, 'base64url').toString('utf8'));
  assert.equal(decodedAgain.total, 2000);
  assert.equal(decodedAgain.tariffVersionId, 'v1');
  const fresh = await request(server, {
    method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'hour', quantity: 2 },
  });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.json.quote.tariffVersionId, 'v1');
  assert.equal(fresh.json.quote.total, 2000);
  const atClose = quote(loadCommittedTariff(env), {
    at: '2098-06-01T00:00:00.000Z', serviceId: 'hour', quantity: 2,
  });
  assert.equal(atClose.tariffVersionId, 'v2');
  assert.equal(atClose.total, 8);
  const unquoted = await request(server, {
    method: 'POST', pathname: '/api/orders', token: customer.token,
    body: {
      serviceTitle: 'خدمت آزمایشی', address: 'آدرس ساختگی', date: '1405-01-01', time: '12:00',
      serviceId: 'hour', quantity: 2, price: 150000, clientRequestId: 'stage4bare01',
    },
  });
  assert.notEqual(unquoted.status, 200);
  const afterBare = await request(server, { method: 'GET', pathname: '/api/orders', token: customer.token });
  assert.equal(afterBare.json.orders.find((order) => order.id === orderId).price, 2000);
  assert.equal(afterBare.json.orders.some((order) => order.price === 150000), false);
  const publication = fs.readFileSync(path.join(__dirname, 'tariffPublication.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.equal(publication.includes('updateOrder'), false);
  assert.equal(routes.includes('seedCommittedPolicy'), false);
  const gate = routes.indexOf("app.use('/api/admin', requireAdmin)");
  const route = routes.indexOf("app.post('/api/admin/tariff-versions'");
  assert.equal(gate > -1 && route > gate, true);
});

function diskIo() {
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
      if (fs.existsSync(live)) fs.renameSync(live, aside);
      fs.renameSync(temp, live);
      if (fs.existsSync(aside)) fs.rmSync(aside, { force: true });
    },
    appendLog(file, line) {
      fs.appendFileSync(file, line);
    },
  };
}

function fsyncAfterCommit(active) {
  const io = diskIo();
  const appendLog = io.appendLog;
  io.appendLog = (file, line) => {
    appendLog(file, line);
    if (active.fail && line.includes('"state":"committed"')) throw new Error('fsync');
  };
  return io;
}

test('a torn commit fsync does not announce success or replace the quoted tariff', () => {
  const env = envFor('paksho-r1-fsync-');
  seed(env, [{
    id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null,
    services: { hour: hour(3) },
  }]);
  const beforeLog = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8');
  const result = registerDraft({
    baseRevision: 1, requestId: 'register01', version: draft('v-next', 4), actor: 'admin', now: NOW,
    io: fsyncAfterCommit({ fail: true }),
  }, env);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'IO_FAILED');
  const priced = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 1 });
  assert.equal(priced.tariffVersionId, 'v1');
  assert.equal(priced.total, 3);
  const log = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8');
  assert.equal(log.startsWith(beforeLog), true);
});

test('publish with supersede stays unquoted until fsync succeeds, then retry commits it', () => {
  const env = envFor('paksho-r2-publish-');
  seed(env, [{
    id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null,
    services: { hour: hour(3) },
  }]);
  assert.equal(registerDraft({
    baseRevision: 1, requestId: 'register01', version: draft('v2', 4, FROM), actor: 'admin', now: NOW,
  }, env).ok, true);
  const failing = { fail: true };
  const body = {
    baseRevision: 2, requestId: 'publish001', versionId: 'v2', validFrom: FROM, validTo: null,
    supersede: { versionId: 'v1', validTo: FROM }, actor: 'admin', now: NOW,
  };
  const first = publishVersion({ ...body, io: fsyncAfterCommit(failing) }, env);
  const second = publishVersion({ ...body, io: fsyncAfterCommit(failing) }, env);
  assert.equal(first.ok, false);
  assert.equal(first.code, 'IO_FAILED');
  assert.equal(second.ok, false);
  assert.equal(second.code, 'IO_FAILED');
  const during = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 1 });
  assert.equal(during.tariffVersionId, 'v1');
  assert.equal(during.total, 3);
  assert.equal(document(env).versions.find((item) => item.id === 'v1').validTo, null);
  failing.fail = false;
  const retried = publishVersion({ ...body, io: fsyncAfterCommit(failing) }, env);
  assert.equal(retried.ok, true);
  const after = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 1 });
  assert.equal(after.tariffVersionId, 'v2');
  assert.equal(after.total, 4);
  assert.equal(document(env).versions.find((item) => item.id === 'v1').services.hour.rate, 3);
  assert.equal(document(env).versions.find((item) => item.id === 'v1').validFrom, '2020-01-01T00:00:00.000Z');
  const log = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8');
  assert.equal(log.includes('"state":"committed"'), true);
  assert.equal(log.includes('"state":"aborted"'), true);
});

test('adopt stays out of quote until fsync succeeds, then the same request can retry', () => {
  const env = envFor('paksho-r2-adopt-');
  const original = {
    companyId: 'deployment-under-test',
    currencyUnit: 'minor',
    versions: [{
      id: 'v-file', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null,
      services: { hour: hour(6) },
    }],
  };
  fs.writeFileSync(env.PAKSHO_TARIFF_FILE, JSON.stringify(original));
  const failing = { fail: true };
  const first = adoptUnjournaledTariff(env, { requestId: 'adopt0001', actor: 'admin', now: NOW, io: fsyncAfterCommit(failing) });
  const second = adoptUnjournaledTariff(env, { requestId: 'adopt0001', actor: 'admin', now: NOW, io: fsyncAfterCommit(failing) });
  assert.equal(first.ok, false);
  assert.equal(first.code, 'IO_FAILED');
  assert.equal(second.ok, false);
  assert.equal(second.code, 'IO_FAILED');
  assert.throws(() => loadCommittedTariff(env), (error) => error.code === 'TARIFF_INVALID');
  failing.fail = false;
  const retried = adoptUnjournaledTariff(env, { requestId: 'adopt0001', actor: 'admin', now: NOW, io: fsyncAfterCommit(failing) });
  assert.equal(retried.ok, true);
  const priced = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 2 });
  assert.equal(priced.tariffVersionId, 'v-file');
  assert.equal(priced.total, 12);
  const log = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8');
  assert.equal(log.includes('"state":"aborted"'), true);
  assert.equal(log.includes('"state":"committed"'), true);
});

for (const withRevision of [false, true]) {
  test(`adopt rejects a real fsync and abort failure, then retries safely (${withRevision ? 'revision zero' : 'legacy'})`, () => {
    const env = envFor('paksho-adopt-durable-');
    const logPath = `${env.PAKSHO_TARIFF_FILE}.publication.jsonl`;
    const original = {
      companyId: 'deployment-under-test',
      currencyUnit: 'minor',
      ...(withRevision ? { revision: 0 } : {}),
      versions: [{
        id: 'v-file', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null,
        services: { hour: hour(6) },
      }],
    };
    const originalBytes = Buffer.from(JSON.stringify(original));
    fs.writeFileSync(env.PAKSHO_TARIFF_FILE, originalBytes);
    const nativeOpen = fs.openSync;
    const nativeClose = fs.closeSync;
    const nativeFsync = fs.fsyncSync;
    const journalFds = new Set();
    let failing = true;
    let commitFsyncFailed = false;
    fs.openSync = function (file, flags, ...args) {
      if (failing && commitFsyncFailed && file === logPath && flags === 'a') {
        throw new Error('injected abort append failure');
      }
      const fd = nativeOpen.call(fs, file, flags, ...args);
      if (file === logPath) journalFds.add(fd);
      return fd;
    };
    fs.closeSync = function (fd) {
      journalFds.delete(fd);
      return nativeClose.call(fs, fd);
    };
    fs.fsyncSync = function (fd) {
      if (failing && journalFds.has(fd) && fs.readFileSync(logPath, 'utf8').includes('"state":"committed"')) {
        commitFsyncFailed = true;
        throw new Error('injected journal fsync failure');
      }
      return nativeFsync.call(fs, fd);
    };
    try {
      const input = { requestId: 'adopt0001', actor: 'admin', now: NOW };
      const failed = adoptUnjournaledTariff(env, input);
      assert.equal(commitFsyncFailed, true);
      assert.equal(failed.ok, false);
      assert.equal(failed.code, 'IO_FAILED');
      assert.deepEqual(fs.readFileSync(env.PAKSHO_TARIFF_FILE), originalBytes);
      const uncertainLog = fs.readFileSync(logPath, 'utf8');
      assert.equal(uncertainLog.includes('"state":"committed"'), true);
      assert.equal(uncertainLog.includes('"state":"aborted"'), false);
      assert.throws(() => loadCommittedTariff(env), (error) => error.code === 'TARIFF_INVALID');
      assert.equal(adoptUnjournaledTariff(env, input).ok, false);
      failing = false;
      const retried = adoptUnjournaledTariff(env, input);
      assert.equal(retried.ok, true, retried.code);
      const priced = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 2 });
      assert.equal(priced.total, 12);
      assert.equal(priced.tariffVersionId, 'v-file');
      assert.equal(document(env).currencyUnit, original.currencyUnit);
      assert.deepEqual(document(env).versions, original.versions);
      const replay = adoptUnjournaledTariff(env, input);
      assert.equal(replay.ok, true);
      assert.equal(replay.idempotent, true);
      assert.equal(replay.revision, retried.revision);
      assert.equal(fs.readFileSync(logPath, 'utf8').startsWith(uncertainLog), true);
    } finally {
      fs.openSync = nativeOpen;
      fs.closeSync = nativeClose;
      fs.fsyncSync = nativeFsync;
    }
  });
}

test('a retry after abort recovers a cut that happened after rename', () => {
  const env = envFor('paksho-r1-retry-');
  seed(env, [{
    id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null,
    services: { hour: hour(3) },
  }]);
  const version = draft('v-next', 4);
  const abortIo = diskIo();
  abortIo.replace = () => { throw new Error('replace'); };
  const aborted = registerDraft({
    baseRevision: 1, requestId: 'register01', version, actor: 'admin', now: NOW, io: abortIo,
  }, env);
  assert.equal(aborted.ok, false);
  assert.equal(aborted.code, 'IO_FAILED');
  const previous = fs.readFileSync(env.PAKSHO_TARIFF_FILE);
  const saved = document(env);
  const next = {
    companyId: saved.companyId,
    currencyUnit: saved.currencyUnit,
    revision: saved.revision + 1,
    versions: [...saved.versions, {
      id: version.id, status: 'draft', validFrom: version.validFrom, validTo: null, services: version.services,
    }],
  };
  const nextBytes = Buffer.from(JSON.stringify(next));
  fs.writeFileSync(env.PAKSHO_TARIFF_FILE, nextBytes);
  fs.appendFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, `${JSON.stringify({
    state: 'prepared',
    requestId: 'register01',
    bodyHash: 'retry-body',
    revision: next.revision,
    versionId: version.id,
    hash: hashBytes(nextBytes),
    previousHash: hashBytes(previous),
    previousBytes: previous.toString('base64'),
    actor: 'admin',
    at: NOW.toISOString(),
  })}\n`);
  const restored = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 1 });
  assert.equal(restored.tariffVersionId, 'v1');
  assert.equal(restored.total, 3);
  const log = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8');
  assert.equal(log.includes('"state":"aborted"'), true);
  const retry = registerDraft({
    baseRevision: document(env).revision, requestId: 'register01', version, actor: 'admin', now: NOW,
  }, env);
  assert.equal(retry.ok, true);
  const after = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 1 });
  assert.equal(after.tariffVersionId, 'v1');
  assert.equal(after.total, 3);
  assert.equal(document(env).versions.find((item) => item.id === 'v1').services.hour.rate, 3);
  assert.equal(fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8').includes('"state":"aborted"'), true);
});

test('an explicit adopt records a valid tariff that has no journal', () => {
  const env = envFor('paksho-r1-adopt-');
  const original = {
    companyId: 'deployment-under-test',
    currencyUnit: 'minor',
    versions: [{
      id: 'v-file', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: null,
      services: { hour: hour(6) },
    }],
  };
  fs.writeFileSync(env.PAKSHO_TARIFF_FILE, JSON.stringify(original));
  assert.throws(() => loadCommittedTariff(env), (error) => error.code === 'TARIFF_INVALID');
  assert.equal(seedCommittedPolicy(env, original).ok, false);
  const adopted = adoptUnjournaledTariff(env, { requestId: 'adopt0001', actor: 'admin', now: NOW });
  assert.equal(adopted.ok, true);
  const priced = quote(loadCommittedTariff(env), { at: FROM, serviceId: 'hour', quantity: 2 });
  assert.equal(priced.tariffVersionId, 'v-file');
  assert.equal(priced.total, 12);
  assert.equal(document(env).versions[0].services.hour.rate, 6);
  const again = adoptUnjournaledTariff(env, { requestId: 'adopt0002', actor: 'admin', now: NOW });
  assert.equal(again.ok, false);
  const log = fs.readFileSync(`${env.PAKSHO_TARIFF_FILE}.publication.jsonl`, 'utf8').trim().split('\n');
  assert.equal(log.length, 1);
  assert.equal(log[0].includes('"state":"committed"'), true);
});
