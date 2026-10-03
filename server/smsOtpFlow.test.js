const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-sms-'));
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
process.env.NODE_ENV = 'development';
process.env.PAKSHO_SMS_MODE = '';
process.env.KAVENEGAR_API_KEY = '';
process.env.KAVENEGAR_OTP_TEMPLATE = '';

const { app, store } = require('./index.js');
after(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function request(pathname, body) {
  const payload = JSON.stringify(body);
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            json: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

let server;

test('otp is not issued when Kavenegar settings are empty', async (t) => {
  let networkCalled = false;
  const originalFetch = global.fetch;
  global.fetch = () => {
    networkCalled = true;
    throw new Error('real SMS must not be called');
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const sent = await request('/api/auth/send-otp', { phone: '09120000000' });
  assert.equal(sent.status, 503);
  assert.equal(sent.json.success, false);
  assert.equal(store.getOtp('09120000000'), null);
  assert.equal(networkCalled, false);

  const login = await request('/api/auth/verify-otp', {
    phone: '09120000000',
    code: '1234',
    role: 'CUSTOMER',
  });
  assert.notEqual(login.status, 200);
  assert.equal(login.json.success, false);
  assert.equal(login.json.token, undefined);
});
