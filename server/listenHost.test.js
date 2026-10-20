const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-listen-'));
process.env.NODE_ENV = 'test';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
process.env.PAKSHO_SMS_MODE = '';
process.env.KAVENEGAR_API_KEY = '';
process.env.KAVENEGAR_OTP_TEMPLATE = '';

const { listenHost, store } = require('./index');

test('bind host limits the listener and rejects an invalid value', () => {
  assert.equal(listenHost({}), '0.0.0.0');
  assert.equal(listenHost({ PAKSHO_BIND_HOST: '   ' }), '0.0.0.0');
  assert.equal(listenHost({ PAKSHO_BIND_HOST: '127.0.0.1' }), '127.0.0.1');
  assert.equal(listenHost({ PAKSHO_BIND_HOST: 'localhost' }), '127.0.0.1');
  assert.equal(listenHost({ PAKSHO_BIND_HOST: '::1' }), '127.0.0.1');
  assert.equal(listenHost({ PAKSHO_BIND_HOST: '0.0.0.0' }), '0.0.0.0');
  assert.throws(() => listenHost({ PAKSHO_BIND_HOST: '192.168.1.2' }), { code: 'INVALID_BIND_HOST' });
  assert.throws(() => listenHost({ PAKSHO_BIND_HOST: '*' }), { code: 'INVALID_BIND_HOST' });
});

test.after(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
