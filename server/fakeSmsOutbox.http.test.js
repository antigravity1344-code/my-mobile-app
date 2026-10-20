const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-outbox-'));
const outbox = path.join(tmp, 'outbox.txt');
process.env.NODE_ENV = 'development';
process.env.PAKSHO_SMS_MODE = 'fake';
process.env.PAKSHO_FAKE_SMS_PHONES = '09120000111';
process.env.PAKSHO_FAKE_SMS_OUTBOX = outbox;
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
process.env.KAVENEGAR_API_KEY = '';
process.env.KAVENEGAR_OTP_TEMPLATE = '';

const { app, store } = require('./index');
const server = http.createServer(app);

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
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, text, json: JSON.parse(text) });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function latestCode(phone) {
  const lines = fs.readFileSync(outbox, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const [storedPhone, code] = lines[i].split(' ');
    if (storedPhone === phone && /^\d{4}$/.test(code || '')) return code;
  }
  return '';
}

test('fake delivery stays outside the API and verify remains one-time', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const sent = await request('/api/auth/send-otp', { phone: '09120000111' });
  const code = latestCode('09120000111');
  assert.equal(sent.status, 200);
  assert.equal(sent.json.success, true);
  assert.deepEqual(Object.keys(sent.json).sort(), ['message', 'success']);
  assert.equal(sent.text.includes(code), false);
  assert.equal(/^\d{4}$/.test(code), true);

  const other = await request('/api/auth/send-otp', { phone: '09129999999' });
  assert.equal(other.status, 200);
  assert.equal(other.text.includes(code), false);
  assert.equal(fs.readFileSync(outbox, 'utf8').includes('09129999999'), false);

  const verified = await request('/api/auth/verify-otp', {
    phone: '09120000111',
    code,
    role: 'CUSTOMER',
  });
  assert.equal(verified.status, 200);
  assert.equal(typeof verified.json.token, 'string');
  assert.equal(verified.text.includes(code), false);
  const reused = await request('/api/auth/verify-otp', {
    phone: '09120000111',
    code,
    role: 'CUSTOMER',
  });
  assert.equal(reused.status, 400);
  assert.equal(reused.json.token, undefined);
});

after(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
