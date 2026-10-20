const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sendOtp, normalizeIranMobile, useFakeSms, writeFakeSmsOutbox } = require('./kavenegarSms');

test('iran mobile numbers normalize to 09 format', () => {
  assert.equal(normalizeIranMobile('09120000000'), '09120000000');
  assert.equal(normalizeIranMobile('+989120000000'), '09120000000');
  assert.equal(normalizeIranMobile('0912-000-0000'), '09120000000');
  assert.equal(normalizeIranMobile('۰۹۱۲۰۰۰۰۰۰۰'), '09120000000');
  assert.equal(normalizeIranMobile('989120000000'), '09120000000');
  assert.equal(normalizeIranMobile('12345'), null);
});

test('missing Kavenegar settings do not call VerifyLookup', async () => {
  let called = false;
  const result = await sendOtp('09120000000', '1234', {
    config: { apiKey: '', template: '' },
    api: {
      VerifyLookup() {
        called = true;
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-configured');
  assert.equal(called, false);
});

test('VerifyLookup sends receptor, token and template without a sender', async () => {
  const calls = [];
  const ok = await sendOtp('09120000000', '4321', {
    config: { apiKey: 'test-key', template: 'paksho-otp' },
    api: {
      VerifyLookup(data, callback) {
        calls.push(data);
        callback({ messageid: 1 }, 200, 'تایید شد');
      },
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receptor, '09120000000');
  assert.equal(calls[0].token, '4321');
  assert.equal(calls[0].template, 'paksho-otp');
  assert.equal(Object.hasOwn(calls[0], 'sender'), false);

  const rejected = await sendOtp('09120000000', '4321', {
    config: { apiKey: 'test-key', template: 'paksho-otp' },
    api: {
      VerifyLookup(_data, callback) {
        callback(null, 424, 'الگو پیدا نشد');
      },
    },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'rejected');
  assert.equal(rejected.status, 424);
});

test('a thrown VerifyLookup does not count as a sent OTP', async () => {
  const result = await sendOtp('09120000000', '4321', {
    config: { apiKey: 'test-key', template: 'paksho-otp' },
    api: {
      VerifyLookup() {
        throw new Error('offline');
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'network');
});

test('test mode is the fake sender and does not imply production', () => {
  assert.equal(useFakeSms({ NODE_ENV: 'test' }), true);
  assert.equal(useFakeSms({ NODE_ENV: 'development' }), false);
  assert.equal(useFakeSms({ NODE_ENV: 'production' }), false);
  assert.equal(useFakeSms({ NODE_ENV: 'development', PAKSHO_SMS_MODE: 'fake' }), true);
});


test('production cannot enable the fake sender through configuration', () => {
  assert.equal(useFakeSms({ NODE_ENV: 'production', PAKSHO_SMS_MODE: 'fake' }), false);
});

test('fake delivery is written only for an explicit non-production allowlist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-sms-'));
  const file = path.join(dir, 'outbox.txt');
  const env = {
    NODE_ENV: 'development',
    PAKSHO_SMS_MODE: 'fake',
    PAKSHO_FAKE_SMS_PHONES: '09120000111,09120000112',
    PAKSHO_FAKE_SMS_OUTBOX: file,
  };
  assert.equal(writeFakeSmsOutbox('09120000111', '1001', env), true);
  assert.equal(writeFakeSmsOutbox('09121111111', '1002', env), false);
  assert.equal(writeFakeSmsOutbox('09120000111', '1003', {
    ...env,
    NODE_ENV: 'production',
    PAKSHO_SMS_MODE: 'fake',
  }), false);
  assert.equal(writeFakeSmsOutbox('09120000111', '12', env), false);
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  assert.deepEqual(lines, ['09120000111 1001']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('missing fake settings do not create an outbox', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-sms-'));
  const file = path.join(dir, 'outbox.txt');
  const base = {
    NODE_ENV: 'development',
    PAKSHO_SMS_MODE: 'fake',
    PAKSHO_FAKE_SMS_PHONES: '09120000111',
    PAKSHO_FAKE_SMS_OUTBOX: file,
  };
  assert.equal(writeFakeSmsOutbox('09120000111', '1001', { ...base, PAKSHO_SMS_MODE: '' }), false);
  assert.equal(writeFakeSmsOutbox('09120000111', '1001', { ...base, NODE_ENV: 'test', PAKSHO_SMS_MODE: '' }), false);
  assert.equal(writeFakeSmsOutbox('09120000111', '1001', { ...base, PAKSHO_FAKE_SMS_PHONES: '' }), false);
  assert.equal(writeFakeSmsOutbox('09120000111', '1001', { ...base, PAKSHO_FAKE_SMS_OUTBOX: '' }), false);
  assert.equal(fs.existsSync(file), false);
  assert.equal(writeFakeSmsOutbox('09120000111', '1001', { ...base, NODE_ENV: 'test' }), true);
  assert.equal(fs.existsSync(file), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an outbox inside the repository is not written', () => {
  const file = path.join(__dirname, 'sms-outbox-rejected.txt');
  const env = {
    NODE_ENV: 'development',
    PAKSHO_SMS_MODE: 'fake',
    PAKSHO_FAKE_SMS_PHONES: '09120000111',
    PAKSHO_FAKE_SMS_OUTBOX: file,
  };
  assert.equal(writeFakeSmsOutbox('09120000111', '1001', env), false);
  assert.equal(fs.existsSync(file), false);
});
