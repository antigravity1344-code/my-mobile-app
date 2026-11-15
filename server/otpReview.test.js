const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-otp-review-'));
process.env.NODE_ENV = 'production';
process.env.PAKSHO_SMS_MODE = 'fake';
process.env.PAKSHO_DEV_OTP_BYPASS = '1';
process.env.PAKSHO_OTP_REVIEW_PHONES = '09120000111';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
process.env.KAVENEGAR_API_KEY = '';
process.env.KAVENEGAR_OTP_TEMPLATE = '';

const { devFixedOtp, isOtpReviewPhone } = require('./kavenegarSms');
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

test('review codes stay off unless the phone is listed and real SMS is absent', () => {
  assert.equal(devFixedOtp(), null);
  assert.equal(isOtpReviewPhone('09120000111'), true);
  assert.equal(isOtpReviewPhone('09129999999'), false);
  assert.equal(isOtpReviewPhone('09120000111', {
    ...process.env,
    KAVENEGAR_API_KEY: 'key',
    KAVENEGAR_OTP_TEMPLATE: 'otp',
  }), false);
});

test('a listed phone can sign in from the admin view, and other phones cannot', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const blocked = await request(server, 'GET', '/api/admin/otp-review');
  assert.equal(blocked.status, 401);

  const sent = await request(server, 'POST', '/api/auth/send-otp', { phone: '09120000111' });
  assert.equal(sent.status, 200);
  assert.equal(sent.json.message.includes('1234'), false);
  assert.equal(/\d{4}/.test(sent.text), false);

  const other = await request(server, 'POST', '/api/auth/send-otp', { phone: '09129999999' });
  assert.equal(other.status, 503);

  const login = await request(server, 'POST', '/api/admin/login', { password: 'paksho-test-admin' });
  assert.equal(login.status, 200);
  const review = await request(server, 'GET', '/api/admin/otp-review', undefined, login.json.token);
  assert.equal(review.status, 200);
  assert.equal(review.json.items.length, 1);
  assert.equal(review.json.items[0].phone, '09120000111');
  const code = review.json.items[0].code;
  assert.equal(/^\d{4}$/.test(code), true);
  assert.notEqual(code, '1234');

  const verified = await request(server, 'POST', '/api/auth/verify-otp', {
    phone: '09120000111',
    code,
    role: 'CUSTOMER',
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.json.user.role, 'CUSTOMER');
});
