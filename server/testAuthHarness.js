// Test-only transport: plaintext OTPs remain in this process, never in an API response or log.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

function installTestSmsCapture() {
  assert.equal(process.env.NODE_ENV, 'test', 'SMS capture is available only in the isolated test process');
  const sms = require('./kavenegarSms');
  const originalFake = sms.useFakeSms;
  const originalSend = sms.sendOtp;
  const codes = new Map();
  let deliveries = 0;
  sms.useFakeSms = () => false;
  sms.sendOtp = async (phone, code) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(/^\d{4}$/.test(code), true, 'Generated OTP must be four ASCII digits');
    codes.set(sms.normalizeIranMobile(phone), code);
    deliveries += 1;
    return { ok: true };
  };
  return {
    codeFor(phone) {
      const code = codes.get(sms.normalizeIranMobile(phone));
      assert.equal(typeof code, 'string', 'No test SMS has been sent to this fixture');
      return code;
    },
    deliveryCount: () => deliveries,
    restore() {
      sms.useFakeSms = originalFake;
      sms.sendOtp = originalSend;
      codes.clear();
    },
  };
}

function request(server, { method = 'GET', pathname, token, body, loseResponse = false }) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    let discarded = false;
    const req = http.request({
      hostname: '127.0.0.1', port: server.address().port, path: pathname, method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    }, (res) => {
      if (loseResponse) {
        // Discard the committed response to model a client that cannot observe success.
        discarded = true;
        res.destroy();
        req.destroy();
        resolve({ responseLost: true });
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const json = String(res.headers['content-type'] || '').includes('application/json') ? JSON.parse(raw) : null;
        resolve({ status: res.statusCode, json, text: raw });
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('Isolated HTTP test timed out')));
    req.on('error', (error) => { if (!discarded) reject(error); });
    if (payload) req.write(payload);
    req.end();
  });
}

function createTestHarness(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const adminPassword = 'isolated-test-admin';
  const env = {
    NODE_ENV: 'test', PAKSHO_SMS_MODE: 'fake',
    PAKSHO_DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    PAKSHO_SQLITE_PATH: path.join(tmp, 'paksho.sqlite'),
    PAKSHO_WORKER_DOC_DIR: path.join(tmp, 'docs'),
    PAKSHO_ADMIN_PASSWORD: adminPassword,
    KAVENEGAR_API_KEY: '', KAVENEGAR_OTP_TEMPLATE: '',
  };
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const smsCapture = installTestSmsCapture();
  const { app, store } = require('./index');
  return {
    app, store, smsCapture, adminPassword, request,
    async serverFor(t) {
      const server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      t.after(() => new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }));
      return server;
    },
    async login(server, phone, role = 'CUSTOMER', { persian = false } = {}) {
      const sent = await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone } });
      assert.equal(sent.status, 200);
      const code = smsCapture.codeFor(phone);
      const submitted = persian ? code.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]) : code;
      const verified = await request(server, {
        method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code: submitted, role },
      });
      assert.equal(verified.status, 200);
      return verified.json;
    },
    async adminLogin(server) {
      const response = await request(server, {
        method: 'POST', pathname: '/api/admin/login', body: { password: adminPassword },
      });
      assert.equal(response.status, 200);
      return response.json.token;
    },
    close() {
      store.close();
      smsCapture.restore();
      fs.rmSync(tmp, { recursive: true, force: true });
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

module.exports = { installTestSmsCapture, createTestHarness, request };
