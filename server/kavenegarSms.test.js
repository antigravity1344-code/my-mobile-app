const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendOtp, normalizeIranMobile, useFakeSms } = require('./kavenegarSms');

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
