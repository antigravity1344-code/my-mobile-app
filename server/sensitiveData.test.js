const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const TEST_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.PAKSHO_DATA_ENCRYPTION_KEY = TEST_KEY;
process.env.NODE_ENV = 'test';

const fieldCrypto = require('./fieldCrypto');
const { createDataStore } = require('./dataStore');

function rawDb(file) {
  return new DatabaseSync(file);
}

test('national id and sheba round-trip and are not stored as plaintext', () => {
  const nationalId = '0011223344';
  const sheba = 'IR110000000000000000000001';
  const encryptedId = fieldCrypto.encryptString(nationalId);
  const encryptedSheba = fieldCrypto.encryptString(sheba);
  assert.equal(fieldCrypto.decryptString(encryptedId), nationalId);
  assert.equal(fieldCrypto.decryptString(encryptedSheba), sheba);
  assert.equal(encryptedId.includes(nationalId), false);
  assert.equal(encryptedSheba.includes(sheba), false);
  assert.equal(fieldCrypto.encryptString(encryptedId), encryptedId);

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-secret-')), 'plain.sqlite');
  const store = createDataStore(file);
  store.createUser({
    id: 'USER-SECRET',
    phone: '09120000001',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    isProfileComplete: true,
    name: 'آزمایش',
    nationalId,
    birthDate: '',
    avatar: '',
    address: 'تهران',
    city: 'تهران',
    addresses: [],
    savedAddresses: [],
    skills: [],
    bankSheba: sheba,
    idDoc: 'wd_abc',
    createdAt: new Date().toISOString(),
  });
  const raw = rawDb(file).prepare('SELECT nationalId, bankSheba, phone, address, idDoc FROM users WHERE id = ?').get('USER-SECRET');
  assert.equal(raw.nationalId.includes(nationalId), false);
  assert.equal(raw.bankSheba.includes(sheba), false);
  assert.equal(fieldCrypto.isEncrypted(raw.nationalId), true);
  assert.equal(fieldCrypto.isEncrypted(raw.bankSheba), true);
  assert.equal(raw.phone, '09120000001');
  assert.equal(raw.address, 'تهران');
  assert.equal(raw.idDoc, 'wd_abc');
  assert.equal(store.getUser('USER-SECRET').nationalId, nationalId);
  store.close();
});

test('otp hash and session hash keep login behavior', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-auth-'));
  process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'app.sqlite');
  process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
  process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
  const { app, store } = require('./index.js');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  function request(method, pathname, token, body) {
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
            resolve({
              status: res.statusCode,
              json: type.includes('application/json') ? JSON.parse(buf.toString('utf8')) : null,
              text: buf.toString('utf8'),
            });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  const phone = '09125550000';
  await request('POST', '/api/auth/send-otp', null, { phone });
  const storedOtp = rawDb(process.env.PAKSHO_SQLITE_PATH).prepare('SELECT code FROM otp_store WHERE phone = ?').get(phone);
  assert.equal(fieldCrypto.isHashed(storedOtp.code), true);
  const wrong = await request('POST', '/api/auth/verify-otp', null, { phone, code: '000000', role: 'CUSTOMER' });
  assert.equal(wrong.status, 400);
  const otpRow = store.getOtp(phone);
  const code = '1357';
  store.saveOtp(phone, { ...otpRow, code });
  const ok = await request('POST', '/api/auth/verify-otp', null, { phone, code, role: 'CUSTOMER' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.token.length > 20, true);
  assert.equal(ok.text.includes(storedOtp.code), false);
  const again = await request('POST', '/api/auth/verify-otp', null, { phone, code, role: 'CUSTOMER' });
  assert.equal(again.status, 400);

  const me = await request('GET', '/api/users/me', ok.json.token);
  assert.equal(me.status, 200);
  const profile = await request('PUT', '/api/users/customer-profile', ok.json.token, {
    name: 'کاربر امن',
    nationalId: '1234567890',
    address: 'تهران',
  });
  assert.equal(profile.status, 200);
  assert.equal(Object.hasOwn(profile.json.user, 'nationalId'), false);
  assert.equal(profile.text.includes('1234567890'), false);
  const storedId = rawDb(process.env.PAKSHO_SQLITE_PATH)
    .prepare('SELECT nationalId FROM users WHERE phone = ?')
    .get(phone);
  assert.equal(storedId.nationalId.includes('1234567890'), false);
  const bad = await request('GET', '/api/users/me', 'not-a-real-session');
  assert.equal(bad.status, 401);
  const loggedOut = await request('POST', '/api/auth/logout', ok.json.token);
  assert.equal(loggedOut.status, 200);
  const afterLogout = await request('GET', '/api/users/me', ok.json.token);
  assert.equal(afterLogout.status, 401);

  const token = 'session-raw-token';
  store.createSession(token, { userId: 'USER-SECRET', role: 'CUSTOMER', expires: Date.now() + 60000 });
  const sessionFile = process.env.PAKSHO_SQLITE_PATH;
  const storedSession = rawDb(sessionFile).prepare('SELECT token FROM sessions').all();
  assert.equal(storedSession.some((row) => row.token === token), false);
  assert.equal(storedSession.some((row) => fieldCrypto.isHashed(row.token)), true);
  store.close();
  server.close();
  const reopened = createDataStore(sessionFile);
  assert.equal(reopened.getSession(token).userId, 'USER-SECRET');
  assert.equal(reopened.getSession('wrong-token'), null);
  reopened.close();
});

test('sensitive migration converts once and rolls back on failure', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-migrate-')), 'migrate.sqlite');
  const store = createDataStore(file);
  const db = rawDb(file);
  db.prepare(`
    INSERT INTO users (
      id, phone, role, status, isProfileComplete, name, nationalId, birthDate, avatar, address, city,
      addressesJson, savedAddressesJson, skillsJson, bankSheba, idDoc, createdAt, seq
    ) VALUES ('USER-1', '09120000002', 'WORKER', 'ACTIVE', 1, 'کارگر', '0088776655', '', '', 'تهران', 'تهران', '[]', '[]', '[]', 'IR220000000000000000000002', 'wd_keep', '2026-01-01T00:00:00.000Z', 1)
  `).run();
  db.prepare(`INSERT INTO otp_store (phone, code, attempts, lastSent, expires) VALUES ('09120000002', '2468', 0, 1, 2)`).run();
  db.prepare(`INSERT INTO sessions (token, userId, role, expires) VALUES ('raw-session', 'USER-1', 'WORKER', 99)`).run();
  db.close();

  assert.throws(() => store.migrateSensitiveFields({ beforeCommit() { throw new Error('boom'); } }));
  const rolled = rawDb(file);
  assert.equal(rolled.prepare('SELECT nationalId FROM users').get().nationalId, '0088776655');
  assert.equal(rolled.prepare('SELECT code FROM otp_store').get().code, '2468');
  assert.equal(rolled.prepare('SELECT token FROM sessions').get().token, 'raw-session');
  rolled.close();

  const converted = store.migrateSensitiveFields();
  assert.deepEqual(converted, { nationalIds: 1, bankShebas: 1, otps: 1, sessions: 1 });
  const again = store.migrateSensitiveFields();
  assert.deepEqual(again, { nationalIds: 0, bankShebas: 0, otps: 0, sessions: 0 });
  const after = rawDb(file);
  const user = after.prepare('SELECT nationalId, bankSheba, phone, address, idDoc, role, status FROM users').get();
  assert.equal(user.nationalId.includes('0088776655'), false);
  assert.equal(user.bankSheba.includes('IR220000000000000000000002'), false);
  assert.equal(user.phone, '09120000002');
  assert.equal(user.address, 'تهران');
  assert.equal(user.idDoc, 'wd_keep');
  assert.equal(user.role, 'WORKER');
  assert.equal(user.status, 'ACTIVE');
  assert.equal(fieldCrypto.isHashed(after.prepare('SELECT code FROM otp_store').get().code), true);
  assert.equal(fieldCrypto.secretsMatch('2468', after.prepare('SELECT code FROM otp_store').get().code), true);
  assert.equal(fieldCrypto.secretsMatch('raw-session', after.prepare('SELECT token FROM sessions').get().token), true);
  after.close();
  assert.equal(store.getUser('USER-1').nationalId, '0088776655');
  assert.equal(store.getSession('raw-session').userId, 'USER-1');
  store.close();
});

test('api responses and logs do not reveal secrets', async () => {
  const logs = [];
  const original = console.log;
  console.log = (...args) => {
    logs.push(args.map((item) => String(item)).join(' '));
    original(...args);
  };
  try {
    fieldCrypto.encryptString('0099887766');
    fieldCrypto.hashSecret('1357');
  } finally {
    console.log = original;
  }
  assert.equal(logs.some((line) => line.includes(TEST_KEY)), false);

  const missing = spawnSync(process.execPath, ['-e', "require('./server/fieldCrypto').assertKeyConfigured()"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production', PAKSHO_DATA_ENCRYPTION_KEY: '' },
    encoding: 'utf8',
  });
  assert.notEqual(missing.status, 0);
  const output = (missing.stderr || '') + (missing.stdout || '');
  assert.match(output, /PAKSHO_DATA_ENCRYPTION_KEY/);
  assert.equal(output.includes(TEST_KEY), false);
});
