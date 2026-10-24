const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-worker-address-'));
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'test-address-admin';
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

function request(server, token, method = 'GET', body, pathname = '/api/workers/me/address') {
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
    address: '  آدرس قدیمی، محله ثبت‌شده  ', city: 'شهر قدیمی',
    skills: ['home', 'office'], bankSheba: 'IR123456789012345678901234',
    idDoc: 'identity-fixture.png', addresses: [{ id: 'legacy', address: 'old' }],
    savedAddresses: [{ id: 'saved', address: 'saved old' }], createdAt: '2026-01-01T00:00:00.000Z',
  });
  const token = 'test-session-' + id;
  store.createSession(token, { userId: id, role, expires: Date.now() + 600000 });
  return token;
}
const users = () => db.prepare('SELECT * FROM users ORDER BY id').all().map((row) => ({ ...row }));
const orders = () => db.prepare('SELECT * FROM orders ORDER BY id').all();
const events = () => db.prepare('SELECT * FROM order_events ORDER BY rowid').all();

test('independent worker residence address API and SQLite preservation', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  let token = fixture('worker', 'WORKER', '09131110071');
  const otherToken = fixture('other-worker', 'WORKER', '09131110072');
  const customerToken = fixture('customer', 'CUSTOMER', '09131110071', 'ACTIVE');
  const documentPath = path.join(tmp, 'docs', 'identity-fixture.png');
  fs.mkdirSync(path.dirname(documentPath), { recursive: true });
  fs.writeFileSync(documentPath, 'unchanged-document-fixture');

  await t.test('reads legacy address exactly, without converting or exposing other fields', async () => {
    const before = users();
    const result = await request(server, token);
    assert.equal(result.status, 200);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.deepEqual(result.body, { success: true, address: '  آدرس قدیمی، محله ثبت‌شده  ' });
    assert.deepEqual(users(), before);
  });

  await t.test('saves with an active order and changes only the worker address column', async () => {
    store.createOrder({
      id: 'active-order', customerId: 'customer', customerName: 'مشتری', customerPhone: '09131110071',
      serviceTitle: 'نظافت', address: 'آدرس سفارش ثابت', date: '1405/08/02', time: '10:00',
      price: 100000, notes: '', status: 'IN_PROGRESS', paymentStatus: 'UNPAID', paymentMethod: 'CASH',
      cleanerId: 'worker', cleanerName: 'نام ثابت', createdAt: '2026-10-24T10:00:00.000Z',
    });
    const beforeUsers = users(), beforeOrders = orders(), beforeEvents = events();
    const address = 'تهران، خیابان جدید، پلاک ۱۲';
    const saved = await request(server, token, 'PUT', { address: '  ' + address + '  ' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, { success: true, address });
    assert.deepEqual(users(), beforeUsers.map((row) => row.id === 'worker' ? { ...row, address } : row));
    assert.deepEqual(orders(), beforeOrders);
    assert.deepEqual(events(), beforeEvents);
    assert.equal(fs.readFileSync(documentPath, 'utf8'), 'unchanged-document-fixture');
    assert.equal((await request(server, token)).body.address, address);
    // Independent connection proves the value is committed in SQLite, not a response/cache only.
    const reopened = new DatabaseSync(process.env.PAKSHO_SQLITE_PATH, { readOnly: true });
    try { assert.equal(reopened.prepare('SELECT address FROM users WHERE id = ?').get('worker').address, address); }
    finally { reopened.close(); }
  });

  await t.test('logout invalidates the old session and real test login retrieves the saved address', async () => {
    const address = store.getUser('worker').address;
    assert.equal((await request(server, token, 'POST', {}, '/api/auth/logout')).status, 200);
    assert.equal((await request(server, token)).status, 401);
    await request(server, null, 'POST', { phone: '09131110071' }, '/api/auth/send-otp');
    const login = await request(server, null, 'POST', {
      phone: '09131110071', code: sms.codeFor('09131110071'), role: 'WORKER',
    }, '/api/auth/verify-otp');
    assert.equal(login.status, 200);
    token = login.body.token;
    assert.equal((await request(server, token)).body.address, address);
    assert.equal(store.getUser('worker').status, 'APPROVED');
  });

  await t.test('does not change any approval state or profile completeness', async () => {
    for (const status of ['REGISTERED', 'PENDING_VERIFICATION', 'APPROVED', 'ACTIVE', 'REJECTED']) {
      const worker = store.getUser('worker');
      store.updateUser({ ...worker, status, isProfileComplete: status !== 'REGISTERED' });
      const before = users();
      const address = 'آدرس ' + status;
      assert.equal((await request(server, token, 'PUT', { address })).status, 200);
      assert.deepEqual(users(), before.map((row) => row.id === 'worker' ? { ...row, address } : row));
    }
  });

  await t.test('denies customer, missing, forged, expired and role-mismatched sessions', async () => {
    store.createSession('expired', { userId: 'worker', role: 'WORKER', expires: Date.now() - 1000 });
    store.createSession('wrong-role', { userId: 'worker', role: 'CUSTOMER', expires: Date.now() + 600000 });
    const before = users();
    for (const [session, status] of [[customerToken, 403], [null, 401], ['forged', 401], ['expired', 401], ['wrong-role', 401]]) {
      for (const method of ['GET', 'PUT']) {
        const result = await request(server, session, method, method === 'PUT' ? { address: 'ممنوع' } : undefined);
        assert.equal(result.status, status);
      }
    }
    assert.deepEqual(users(), before);
  });

  await t.test('rejects account selectors and every extra field, preserving both accounts', async () => {
    const before = users();
    for (const key of ['userId', 'id', 'status', 'isProfileComplete', 'name', 'nationalId', 'bankSheba', 'skills', 'city', 'idDoc', 'addresses']) {
      assert.equal((await request(server, token, 'PUT', { address: 'جدید', [key]: 'other-worker' })).status, 400);
    }
    for (const method of ['GET', 'PUT']) {
      assert.equal((await request(server, token, method, method === 'PUT' ? { address: 'جدید' } : undefined,
        '/api/workers/me/address?userId=other-worker')).status, 400);
    }
    assert.deepEqual(users(), before);
    assert.equal((await request(server, otherToken)).body.address, store.getUser('other-worker').address);
  });

  await t.test('rejects invalid values and accepts the length boundary without truncation', async () => {
    const before = users();
    for (const body of [undefined, {}, [], { address: null }, { address: 17 }, { address: {} },
      { address: ['الف'] }, { address: '' }, { address: ' \n\t ' }, { address: 'الف\u0000ب' }, { address: 'الف\u0007ب' }, { address: 'ا'.repeat(301) }]) {
      assert.equal((await request(server, token, 'PUT', body)).status, 400);
    }
    assert.deepEqual(users(), before);
    const address = 'ا'.repeat(300);
    assert.equal((await request(server, token, 'PUT', { address })).body.address, address);
  });

  await t.test('an actual SQLite write failure returns 500 and preserves the previous value', async () => {
    const before = users();
    db.exec("CREATE TRIGGER test_fail_address BEFORE UPDATE OF address ON users BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
    try {
      const result = await request(server, token, 'PUT', { address: 'ذخیره ناموفق' });
      assert.equal(result.status, 500);
      assert.equal(result.body.success, false);
      assert.deepEqual(users(), before);
      assert.equal((await request(server, token)).body.address, store.getUser('worker').address);
    } finally { db.exec('DROP TRIGGER test_fail_address'); }
  });

  await t.test('blocked worker cannot read or save; customer profile and saved addresses stay intact', async () => {
    store.updateUser({ ...store.getUser('worker'), status: 'BLOCKED' });
    const before = users();
    assert.equal((await request(server, token)).status, 403);
    assert.equal((await request(server, token, 'PUT', { address: 'ممنوع' })).status, 403);
    const profile = await request(server, customerToken, 'GET', undefined, '/api/users/me');
    assert.equal(profile.body.user.address, store.getUser('customer').address);
    assert.equal((await request(server, customerToken, 'GET', undefined, '/api/users/addresses')).status, 200);
    assert.deepEqual(users(), before);
  });
});
