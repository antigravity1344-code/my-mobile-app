const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestHarness } = require('./testAuthHarness');
const { isHashed } = require('./fieldCrypto');

const harness = createTestHarness('paksho-otp-isolated-');
const { store, request, smsCapture } = harness;
after(() => harness.close());

test('OTP send -> verify uses captured four digits without exposing OTP or stored hash', async (t) => {
  const server = await harness.serverFor(t);
  const phone = '09120006501';
  const before = smsCapture.deliveryCount();
  const sent = await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone } });
  assert.equal(sent.status, 200);
  assert.equal(smsCapture.deliveryCount(), before + 1);
  const code = smsCapture.codeFor(phone);
  const stored = store.getOtp(phone).code;
  assert.equal(isHashed(stored), true);
  assert.equal(stored === code, false);
  assert.equal(sent.json.code, undefined);
  assert.equal(sent.json.token, undefined);
  assert.equal(sent.text.includes(code), false);
  assert.equal(sent.text.includes(stored), false);
  const verified = await request(server, {
    method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code, role: 'CUSTOMER' },
  });
  assert.equal(verified.status, 200);
  assert.equal(typeof verified.json.token, 'string');
  assert.equal(store.getOtp(phone), null);
  const reused = await request(server, {
    method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code, role: 'CUSTOMER' },
  });
  assert.equal(reused.status, 400);
  assert.equal(reused.json.token, undefined);
});

test('OTP rejects stored hash as code and accepts actual English four digits', async (t) => {
  const server = await harness.serverFor(t);
  const phone = '09120006502';
  await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone } });
  const rejected = await request(server, {
    method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code: store.getOtp(phone).code },
  });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.json.token, undefined);
  const verified = await request(server, {
    method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code: smsCapture.codeFor(phone) },
  });
  assert.equal(verified.status, 200);
});

test('OTP accepts Persian four digits for each app role', async (t) => {
  const server = await harness.serverFor(t);
  for (const [phone, role] of [['09120006503', 'CUSTOMER'], ['09120006504', 'WORKER']]) {
    const authenticated = await harness.login(server, phone, role, { persian: true });
    assert.equal(authenticated.user.role, role);
    assert.equal(typeof authenticated.token, 'string');
  }
});

test('OTP wrong, malformed and expired codes never issue a session', async (t) => {
  const server = await harness.serverFor(t);
  const phone = '09120006505';
  await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone } });
  const code = smsCapture.codeFor(phone);
  const wrong = String((Number(code[0]) + 1) % 10) + code.slice(1);
  const bad = await request(server, { method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code: wrong } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.token, undefined);
  assert.equal(store.getOtp(phone).attempts, 1);
  for (const malformed of ['123', '12345', 'ab12', 1234]) {
    const response = await request(server, {
      method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code: malformed },
    });
    assert.equal(response.status, 400);
    assert.equal(response.json.token, undefined);
  }
  const current = store.getOtp(phone);
  store.saveOtp(phone, { ...current, code, expires: Date.now() - 1 });
  const expired = await request(server, { method: 'POST', pathname: '/api/auth/verify-otp', body: { phone, code } });
  assert.equal(expired.status, 400);
  assert.equal(expired.json.token, undefined);
  assert.equal(store.getOtp(phone), null);
});

test('sessions reject missing, wrong, expired and revoked tokens', async (t) => {
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120006506');
  assert.equal((await request(server, { pathname: '/api/users/me' })).status, 401);
  assert.equal((await request(server, { pathname: '/api/users/me', token: 'invalid-test-token' })).status, 401);
  assert.equal((await request(server, { pathname: '/api/users/me', token: customer.token })).status, 200);
  store.deleteSession(customer.token);
  store.createSession(customer.token, { userId: customer.user.id, role: 'CUSTOMER', expires: Date.now() - 1 });
  assert.equal((await request(server, { pathname: '/api/users/me', token: customer.token })).status, 401);
  assert.equal(store.getSession(customer.token), null);
  const revoked = await harness.login(server, '09120006507');
  assert.equal((await request(server, { method: 'POST', pathname: '/api/auth/logout', token: revoked.token })).status, 200);
  assert.equal((await request(server, { pathname: '/api/users/me', token: revoked.token })).status, 401);
});


test('a stored session hash cannot be used as a bearer credential', async (t) => {
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120006508');
  const storedHash = require('./fieldCrypto').hashSecret(customer.token);
  const replay = await request(server, { pathname: '/api/users/me', token: storedHash });
  assert.equal(replay.status, 401);
  assert.equal((await request(server, { pathname: '/api/users/me', token: customer.token })).status, 200);
});

test('a stored session hash cannot revoke the original opaque session', async (t) => {
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120006509');
  const storedHash = require('./fieldCrypto').hashSecret(customer.token);
  await request(server, { method: 'POST', pathname: '/api/auth/logout', token: storedHash });
  assert.equal((await request(server, { pathname: '/api/users/me', token: customer.token })).status, 200);
  assert.equal((await request(server, { method: 'POST', pathname: '/api/auth/logout', token: customer.token })).status, 200);
  assert.equal((await request(server, { pathname: '/api/users/me', token: customer.token })).status, 401);
});
