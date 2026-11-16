const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-admin-recover-'));
const passwordFile = path.join(tmp, 'admin.env');
const outbox = path.join(tmp, 'outbox.txt');
fs.writeFileSync(passwordFile, 'PAKSHO_ADMIN_PASSWORD=paksho-test-admin\n');
process.env.NODE_ENV = 'test';
process.env.PAKSHO_SMS_MODE = 'fake';
process.env.PAKSHO_FAKE_SMS_PHONES = '09120000111';
process.env.PAKSHO_FAKE_SMS_OUTBOX = outbox;
process.env.PAKSHO_ADMIN_RECOVERY_PHONE = '09120000111';
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
process.env.PAKSHO_ADMIN_PASSWORD_FILE = passwordFile;
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.KAVENEGAR_API_KEY = '';
process.env.KAVENEGAR_OTP_TEMPLATE = '';

const { app } = require('./index');

function request(server, method, pathname, body, token) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: pathname,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, text, json: JSON.parse(text) });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('the manager can replace a leaked password from a phone code', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const oldLogin = await request(server, 'POST', '/api/admin/login', { password: 'paksho-test-admin' });
  assert.equal(oldLogin.status, 200);

  const sent = await request(server, 'POST', '/api/admin/recover/send', {});
  assert.equal(sent.status, 200);
  assert.equal(/\d{4}/.test(sent.text), false);
  const code = fs.readFileSync(outbox, 'utf8').trim().split(' ').pop();
  assert.match(code, /^\d{4}$/);

  const wrong = await request(server, 'POST', '/api/admin/recover/confirm', {
    code: code === '1111' ? '2222' : '1111',
    password: 'a-brand-new-secret',
    again: 'a-brand-new-secret',
  });
  assert.equal(wrong.status, 401);

  const saved = await request(server, 'POST', '/api/admin/recover/confirm', {
    code,
    password: 'a-brand-new-secret',
    again: 'a-brand-new-secret',
  });
  assert.equal(saved.status, 200);
  assert.equal(fs.readFileSync(passwordFile, 'utf8').includes('a-brand-new-secret'), true);

  const stale = await request(server, 'GET', '/api/admin/stats', undefined, oldLogin.json.token);
  assert.equal(stale.status, 401);
  const oldNow = await request(server, 'POST', '/api/admin/login', { password: 'paksho-test-admin' });
  assert.equal(oldNow.status, 401);
  const fresh = await request(server, 'POST', '/api/admin/login', { password: 'a-brand-new-secret' });
  assert.equal(fresh.status, 200);
});
