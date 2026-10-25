const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-worker-skills-'));
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'test-skills-admin';
process.env.NODE_ENV = 'test';
const { installTestSmsCapture } = require('./testAuthHarness');
const sms = installTestSmsCapture();
const { app, store } = require('./index');
const db = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
after(() => {
  db.close();
  store.close();
  sms.restore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function request(server, token, method = 'GET', body, pathname = '/api/workers/me/skills') {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port: server.address().port, path: pathname, method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}
function fixture(id, role, phone, status = 'APPROVED') {
  store.createUser({
    id, role, phone, status, isProfileComplete: true, name: 'نام ثابت',
    nationalId: '0012345678', birthDate: '1370/01/01', avatar: 'old-avatar',
    address: 'آدرس قدیمی', city: 'شهر قدیمی',
    skills: ['home', 'office'], bankSheba: 'IR123456789012345678901234',
    idDoc: 'identity-fixture.png', addresses: [{ id: 'legacy', address: 'old' }],
    savedAddresses: [{ id: 'saved', address: 'saved old' }], createdAt: '2026-01-01T00:00:00.000Z',
  });
  const token = 'test-session-' + id;
  store.createSession(token, { userId: id, role, expires: Date.now() + 600000 });
  return token;
}
const users = () => db.prepare('SELECT * FROM users ORDER BY id').all().map((row) => ({ ...row }));

test('independent worker skills API updates only skillsJson', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const token = fixture('worker', 'WORKER', '09131110081');
  const otherToken = fixture('other-worker', 'WORKER', '09131110082');
  const customerToken = fixture('customer', 'CUSTOMER', '09131110081', 'ACTIVE');

  await t.test('reads stored skills without exposing other profile fields', async () => {
    const before = users();
    const result = await request(server, token);
    assert.equal(result.status, 200);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.deepEqual(result.body, { success: true, skills: ['home', 'office'] });
    assert.deepEqual(users(), before);
  });

  await t.test('saves catalog ids and changes only skillsJson', async () => {
    const before = users();
    const saved = await request(server, token, 'PUT', { skills: ['home_unit_cleaning', ' staircase_common_areas '] });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, { success: true, skills: ['home_unit_cleaning', 'staircase_common_areas'] });
    assert.deepEqual(
      users(),
      before.map((row) => row.id === 'worker'
        ? { ...row, skillsJson: JSON.stringify(['home_unit_cleaning', 'staircase_common_areas']) }
        : row),
    );
    assert.equal((await request(server, token)).body.skills[0], 'home_unit_cleaning');
    assert.equal(store.getUser('worker').status, 'APPROVED');
    assert.equal(store.getUser('worker').address, 'آدرس قدیمی');
    assert.equal(store.getUser('other-worker').skills.join(','), 'home,office');
  });

  await t.test('denies customer and forged sessions and rejects extra fields', async () => {
    const before = users();
    assert.equal((await request(server, customerToken)).status, 403);
    assert.equal((await request(server, null, 'PUT', { skills: ['home'] })).status, 401);
    assert.equal((await request(server, token, 'PUT', { skills: ['home'], userId: 'other-worker' })).status, 400);
    assert.equal((await request(server, token, 'GET', undefined, '/api/workers/me/skills?userId=other-worker')).status, 400);
    assert.deepEqual(users(), before);
    assert.deepEqual((await request(server, otherToken)).body.skills, ['home', 'office']);
  });

  await t.test('rejects invalid lists and accepts an empty list', async () => {
    const before = users();
    for (const body of [undefined, {}, [], { skills: null }, { skills: 'home' }, { skills: [2] },
      { skills: [''] }, { skills: ['x'.repeat(41)] }, { skills: Array.from({ length: 21 }, (_, i) => 's' + i) }]) {
      assert.equal((await request(server, token, 'PUT', body)).status, 400);
    }
    assert.deepEqual(users(), before);
    assert.deepEqual((await request(server, token, 'PUT', { skills: [] })).body.skills, []);
  });
});
