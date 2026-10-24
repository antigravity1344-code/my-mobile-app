const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { devFixedOtp } = require('./kavenegarSms');

test('D-74 dev fixed OTP is impossible outside explicit development', () => {
  assert.equal(devFixedOtp({ NODE_ENV: 'development', PAKSHO_DEV_OTP_BYPASS: '1' }), '1234');
  assert.equal(devFixedOtp({ NODE_ENV: 'production', PAKSHO_DEV_OTP_BYPASS: '1' }), null);
  assert.equal(devFixedOtp({ NODE_ENV: 'test', PAKSHO_DEV_OTP_BYPASS: '1' }), null);
  assert.equal(devFixedOtp({ PAKSHO_DEV_OTP_BYPASS: '1' }), null);
  assert.equal(devFixedOtp({ NODE_ENV: 'development' }), null);
  assert.equal(devFixedOtp({ NODE_ENV: 'development', PAKSHO_DEV_OTP_BYPASS: 'true' }), null);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-devotp-'));
process.env.NODE_ENV = 'development';
process.env.PAKSHO_DEV_OTP_BYPASS = '1';
process.env.PAKSHO_SMS_MODE = '';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
process.env.KAVENEGAR_API_KEY = '';
process.env.KAVENEGAR_OTP_TEMPLATE = '';

function request(server, pathname, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}

test('D-74 worker logs in with fixed code without SMS; code stays one-time', async (t) => {
  const { app } = require('./index');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const sent = await request(server, '/api/auth/send-otp', { phone: '09120000222' });
  assert.equal(sent.status, 200);
  const wrong = await request(server, '/api/auth/verify-otp', { phone: '09120000222', code: '0000', role: 'WORKER' });
  assert.equal(wrong.status, 400);
  const ok = await request(server, '/api/auth/verify-otp', { phone: '09120000222', code: '1234', role: 'WORKER' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.role, 'WORKER');
  assert.equal(typeof ok.json.token, 'string');
  const reuse = await request(server, '/api/auth/verify-otp', { phone: '09120000222', code: '1234', role: 'WORKER' });
  assert.equal(reuse.status, 400);
});