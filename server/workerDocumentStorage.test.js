const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {
  createWorkerDocumentStorage,
  assignDocument,
  restoreDocument,
  rememberDocument,
} = require('./workerDocumentStorage');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-worker-docs-'));
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
process.env.NODE_ENV = 'test';

const { app, store } = require('./index.js');

const PHONE = '09120000099';
const NATIONAL_ID = '0012345678';
const { jpeg, png } = require('./testImageFixtures');

function request(server, { method = 'GET', pathname, token, body }) {
  const payload = body === undefined ? null : JSON.stringify(body);
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const type = String(res.headers['content-type'] || '');
          let json = null;
          if (type.includes('application/json')) json = JSON.parse(buf.toString('utf8'));
          resolve({ status: res.statusCode, json, buf, type });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function workerRecord() {
  return store.getUserByPhone(PHONE, 'WORKER');
}

function onboardingBody(data, mimeType) {
  return {
    name: 'متخصص آزمایشی',
    nationalId: NATIONAL_ID,
    birthDate: '1370/01/01',
    address: 'تهران',
    city: 'تهران',
    bankSheba: 'IR120000000000000000000000',
    idDocFile: { mimeType, data },
  };
}

let server;
let workerToken;
let adminToken;
let workerId;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone: PHONE } });
  const code = store.getOtp(PHONE).code;
  const verified = await request(server, {
    method: 'POST',
    pathname: '/api/auth/verify-otp',
    body: { phone: PHONE, code, role: 'WORKER' },
  });
  workerToken = verified.json.token;
  workerId = verified.json.user.id;
  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  adminToken = admin.json.token;
});

after(() => {
  server.close();
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('worker identity documents stay private', async (t) => {
  await t.test('missing document returns a controlled response', async () => {
    const missing = await request(server, {
      pathname: '/api/admin/workers/' + workerId + '/document',
      token: adminToken,
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.success, false);
    assert.match(missing.json.message, /مدرک/);
    assert.equal(JSON.stringify(missing.json).includes(tmp), false);
  });

  await t.test('invalid file is rejected', async () => {
    const invalid = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: workerToken,
      body: onboardingBody(Buffer.from('not-an-image').toString('base64'), 'image/jpeg'),
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.success, false);
    assert.equal(workerRecord().idDoc, '');
  });

  await t.test('oversized file is rejected', async () => {
    const big = Buffer.alloc(600 * 1024 + 1, 0x11);
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;
    const oversized = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: workerToken,
      body: onboardingBody(big.toString('base64'), 'image/jpeg'),
    });
    assert.equal(oversized.status, 400);
    assert.match(oversized.json.message, /۶۰۰/);
    assert.equal(workerRecord().idDoc, '');
  });

  await t.test('valid upload stores only an opaque id', async () => {
    const uploaded = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: workerToken,
      body: onboardingBody(jpeg.toString('base64'), 'image/jpeg'),
    });
    assert.equal(uploaded.status, 200);
    assert.equal(uploaded.json.user.status, 'PENDING_VERIFICATION');
    assert.equal(Object.hasOwn(uploaded.json.user, 'idDoc'), false);
    assert.equal(Object.hasOwn(uploaded.json.user, 'idDocPath'), false);
    assert.equal(JSON.stringify(uploaded.json).includes('uploads'), false);
    const saved = workerRecord();
    assert.match(saved.idDoc, /^wd_[0-9a-f]{32}$/);
    assert.equal(Object.hasOwn(saved, 'idDocPath'), false);
    const names = fs.readdirSync(process.env.PAKSHO_WORKER_DOC_DIR);
    assert.deepEqual(names, [saved.idDoc + '.jpg']);
    assert.equal(names[0].includes(PHONE), false);
    assert.equal(names[0].includes(NATIONAL_ID), false);
  });

  await t.test('public and static routes do not return the file', async () => {
    const documentId = workerRecord().idDoc;
    const me = await request(server, { pathname: '/api/users/me', token: workerToken });
    assert.equal(JSON.stringify(me.json).includes(documentId), false);
    const listed = await request(server, {
      pathname: '/api/admin/users?role=WORKER',
      token: adminToken,
    });
    assert.equal(JSON.stringify(listed.json).includes(documentId), false);
    assert.equal(listed.json.users.some((user) => user.id === workerId && user.hasIdDoc === true), true);
    const exposed = await request(server, {
      pathname: '/uploads/worker-docs/' + documentId + '.jpg',
    });
    assert.equal(exposed.status, 404);
    assert.equal(exposed.buf.includes(jpeg), false);
    assert.equal(exposed.buf.toString('utf8').includes(tmp), false);
  });

  await t.test('worker token cannot read the document', async () => {
    const denied = await request(server, {
      pathname: '/api/admin/workers/' + workerId + '/document',
      token: workerToken,
    });
    assert.equal(denied.status, 401);
    const anonymous = await request(server, {
      pathname: '/api/admin/workers/' + workerId + '/document',
    });
    assert.equal(anonymous.status, 401);
  });

  await t.test('admin can read the document', async () => {
    const readable = await request(server, {
      pathname: '/api/admin/workers/' + workerId + '/document',
      token: adminToken,
    });
    assert.equal(readable.status, 200);
    assert.match(readable.type, /image\/jpeg/);
    assert.deepEqual(readable.buf, jpeg);
    assert.equal(JSON.stringify(readable.buf).includes(tmp), false);
  });

  await t.test('replacement keeps the new document and removes the old file', async () => {
    const previousId = workerRecord().idDoc;
    const replaced = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: workerToken,
      body: onboardingBody(jpeg.toString('base64'), 'image/png'),
    });
    assert.equal(replaced.status, 400);
    assert.equal(workerRecord().idDoc, previousId);
    assert.deepEqual(fs.readdirSync(process.env.PAKSHO_WORKER_DOC_DIR), [previousId + '.jpg']);
    const ok = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: workerToken,
      body: onboardingBody(png.toString('base64'), 'image/png'),
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.status, 'PENDING_VERIFICATION');
    const saved = workerRecord();
    assert.notEqual(saved.idDoc, previousId);
    assert.equal(Object.hasOwn(saved, 'idDocPath'), false);
    const names = fs.readdirSync(process.env.PAKSHO_WORKER_DOC_DIR);
    assert.deepEqual(names, [saved.idDoc + '.png']);
    assert.equal(names.includes(previousId + '.jpg'), false);
  });

  await t.test('a failed database write does not replace the saved document', async () => {
    const previousId = workerRecord().idDoc;
    const { DatabaseSync } = require('node:sqlite');
    const side = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
    side.exec(
      'CREATE TRIGGER fail_user_update BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, \'forced\'); END'
    );
    const failed = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: workerToken,
      body: onboardingBody(jpeg.toString('base64'), 'image/jpeg'),
    });
    side.exec('DROP TRIGGER fail_user_update');
    side.close();
    assert.equal(failed.status, 500);
    const readable = await request(server, {
      pathname: '/api/admin/workers/' + workerId + '/document',
      token: adminToken,
    });
    assert.deepEqual(readable.buf, png);
    assert.equal(workerRecord().idDoc, previousId);
    assert.deepEqual(fs.readdirSync(process.env.PAKSHO_WORKER_DOC_DIR), [previousId + '.png']);
  });

  await t.test('D-62 F1: DB abort plus unlink fault keeps durable recovery record', async () => {
    const originalId = workerRecord().idDoc;
    const { DatabaseSync } = require('node:sqlite');
    const side = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
    side.exec("CREATE TRIGGER d62_abort_user_update BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'synthetic db failure'); END");
    const realUnlink = fs.unlinkSync;
    let injected = false;
    fs.unlinkSync = function (filename, ...args) {
      if (!injected && typeof filename === 'string' &&
          /^wd_[0-9a-f]{32}\.jpg$/.test(path.basename(filename))) {
        injected = true;
        const err = new Error('synthetic EACCES');
        err.code = 'EACCES';
        throw err;
      }
      return realUnlink.call(this, filename, ...args);
    };
    let response;
    try {
      response = await request(server, {
        method: 'PUT', pathname: '/api/users/worker-onboarding', token: workerToken,
        body: onboardingBody(jpeg.toString('base64'), 'image/jpeg')
      });
    } finally {
      fs.unlinkSync = realUnlink;
      side.exec('DROP TRIGGER d62_abort_user_update');
      side.close();
    }
    assert.equal(response.status, 500);
    assert.equal(injected, true, 'the final document unlink fault was injected');
    assert.equal(workerRecord().idDoc, originalId, 'DB failed without changing referenced doc');
    const names = fs.readdirSync(process.env.PAKSHO_WORKER_DOC_DIR);
    const orphan = names.find(name => /^wd_[0-9a-f]{32}\.jpg$/.test(name));
    assert.ok(orphan, 'synthetic final file remains after injected unlink failure');
    assert.ok(names.includes(orphan.replace(/\.jpg$/, '.pending')), 'durable pending intent must survive both faults');
    const storage = createWorkerDocumentStorage(process.env.PAKSHO_WORKER_DOC_DIR);
    const result = storage.reconcilePendingDocuments(id =>
      store.listUsers('WORKER').some(user => user.idDoc === id)
    );
    assert.equal(result.recovered, 1);
    assert.deepEqual(fs.readdirSync(process.env.PAKSHO_WORKER_DOC_DIR), [originalId + '.png']);
  });

  await t.test('D-62 F1: real process restart sweeps three previously untracked managed orphan forms', async () => {
    const { spawnSync } = require('node:child_process');
    const directory = process.env.PAKSHO_WORKER_DOC_DIR;
    const beforeUser = JSON.stringify(workerRecord());
    const referencedId = workerRecord().idDoc;
    const referencedBytes = fs.readFileSync(path.join(directory, referencedId + '.png'));
    const ids = ['a'.repeat(32), 'b'.repeat(32)].map(x => 'wd_' + x);
    const orphanFinal = ids[0] + '.jpg';
    const orphanTemp = ids[1] + '.tmp';
    const legacyOrphan = 'DOC-synthetic-legacy-unreferenced.png';
    const unrelatedFile = 'not-a-worker-document.txt';
    fs.writeFileSync(path.join(directory, orphanFinal), jpeg);
    fs.writeFileSync(path.join(directory, orphanTemp), Buffer.from('synthetic interrupted write'));
    fs.writeFileSync(path.join(directory, legacyOrphan), png);
    fs.writeFileSync(path.join(directory, unrelatedFile), 'untouched');
    const restart = (injectFailure = false) => {
      const prelude = injectFailure ? (
        "const fs=require('fs'),path=require('path');" +
        "const original=fs.unlinkSync;" +
        "fs.unlinkSync=(p,...args)=>{if(path.basename(p)==='" + orphanFinal + "')" +
        "{const e=new Error('synthetic EACCES');e.code='EACCES';throw e;}" +
        "return original.call(fs,p,...args);};"
      ) : '';
      return spawnSync(process.execPath, ['-e',
        prelude + "const {store}=require('./index.js');store.close();"
      ], { cwd: __dirname, env: { ...process.env, NODE_ENV: 'test', PAKSHO_SMS_MODE: 'fake' },
        encoding: 'utf8', timeout: 15000 });
    };
    const result = restart();
    assert.equal(result.status, 0, (result.stderr || '').slice(0, 500));
    assert.equal(JSON.stringify(workerRecord()), beforeUser);
    assert.deepEqual(fs.readFileSync(path.join(directory, referencedId + '.png')), referencedBytes);
    assert.deepEqual(fs.readdirSync(directory).sort(), [referencedId + '.png', unrelatedFile].sort(),
      'no journal final, no journal temp, and unreferenced legacy file all removed');
    fs.unlinkSync(path.join(directory, unrelatedFile));

    // Confirm two abandoned concurrently-created writes are both reclaimed.
    const storage = createWorkerDocumentStorage(directory);
    const a = storage.uploadWorkerDocument({ buffer: jpeg, ext: 'jpg' });
    const b = storage.uploadWorkerDocument({ buffer: png, ext: 'png' });
    assert.notEqual(a.documentId, b.documentId);
    storage.trackPendingDocument(referencedId); // committed reference with a stale journal
    const again = restart();
    assert.equal(again.status, 0, (again.stderr || '').slice(0, 500));
    assert.equal(JSON.stringify(workerRecord()), beforeUser);
    assert.deepEqual(fs.readdirSync(directory), [referencedId + '.png'],
      'both unreferenced parallel uploads removed, committed document retained');
    assert.deepEqual(fs.readFileSync(path.join(directory, referencedId + '.png')), referencedBytes);

    // A failed restart cleanup must preserve a *durable* intent for next boot.
    fs.writeFileSync(path.join(directory, orphanFinal), jpeg);
    const failed = restart(true);
    assert.notEqual(failed.status, 0, 'failed cleanup prevents application startup');
    assert.equal(fs.existsSync(path.join(directory, orphanFinal)), true);
    const pending = path.join(directory, ids[0] + '.pending');
    assert.equal(fs.existsSync(pending), true);
    assert.equal(JSON.parse(fs.readFileSync(pending, 'utf8')).documentId, ids[0]);
    assert.equal(JSON.stringify(workerRecord()), beforeUser);
    const recovered = restart();
    assert.equal(recovered.status, 0, (recovered.stderr || '').slice(0, 500));
    assert.deepEqual(fs.readdirSync(directory), [referencedId + '.png']);
    assert.equal(JSON.stringify(workerRecord()), beforeUser);
  });

  await t.test('D-62 F1: malformed managed recovery entry fails closed without touching documents', () => {
    const { spawnSync } = require('node:child_process');
    const directory = process.env.PAKSHO_WORKER_DOC_DIR;
    const id = 'wd_' + 'c'.repeat(32);
    const imageFile = path.join(directory, id + '.png');
    const pending = path.join(directory, id + '.pending');
    const user = JSON.stringify(workerRecord());
    fs.writeFileSync(imageFile, png);
    fs.writeFileSync(pending, 'not-valid-json');
    const boot = () => spawnSync(process.execPath,
      ['-e', "const {store}=require('./index.js');store.close();"],
      { cwd: __dirname, env: { ...process.env, NODE_ENV: 'test', PAKSHO_SMS_MODE: 'fake' },
        encoding: 'utf8', timeout: 15000 });
    const failure = boot();
    assert.notEqual(failure.status, 0);
    assert.equal(fs.readFileSync(pending, 'utf8'), 'not-valid-json');
    assert.deepEqual(fs.readFileSync(imageFile), png);
    assert.equal(JSON.stringify(workerRecord()), user);
    fs.writeFileSync(pending, JSON.stringify({ version: 1, documentId: id, pendingCleanup: true }));
    assert.equal(boot().status, 0);
    assert.equal(fs.existsSync(pending), false);
    assert.equal(fs.existsSync(imageFile), false);
  });

  await t.test('admin delete removes the document', async () => {
    const denied = await request(server, {
      method: 'DELETE',
      pathname: '/api/admin/workers/' + workerId + '/document',
      token: workerToken,
    });
    assert.equal(denied.status, 401);
    const removed = await request(server, {
      method: 'DELETE',
      pathname: '/api/admin/workers/' + workerId + '/document',
      token: adminToken,
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.json.success, true);
    assert.equal(workerRecord().idDoc, '');
    assert.equal(fs.readdirSync(process.env.PAKSHO_WORKER_DOC_DIR).length, 0);
    const missing = await request(server, {
      pathname: '/api/admin/workers/' + workerId + '/document',
      token: adminToken,
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.buf.toString('utf8').includes(tmp), false);
  });

  await t.test('a failed record save restores the previous document', () => {
    const storage = createWorkerDocumentStorage(path.join(tmp, 'rollback'));
    const first = storage.uploadWorkerDocument({ buffer: jpeg, ext: 'jpg' });
    const user = { idDoc: first.documentId, name: 'قبلی' };
    const second = storage.uploadWorkerDocument({ buffer: jpeg, ext: 'jpg' });
    const previous = rememberDocument(user);
    assignDocument(user, second.documentId);
    user.name = 'جدید';
    user.name = 'قبلی';
    restoreDocument(user, previous);
    storage.deleteWorkerDocument(second.documentId);
    assert.equal(user.idDoc, first.documentId);
    assert.equal(storage.getWorkerDocument(second.documentId), null);
    assert.deepEqual(storage.getWorkerDocument(first.documentId).data, jpeg);
  });
});
