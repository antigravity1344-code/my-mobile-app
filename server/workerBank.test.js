'use strict';
process.env.NODE_ENV = 'test';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 41).toString('base64');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createWorkerBank, validSheba, smsStepUpRequired } = require('./workerBank');
const fields = require('./fieldCrypto');
const SHEBA = 'IR820540102680020817909002';
const OTHER = 'IR062960000000100324200001';

function fixture(t, options = {}) {
  const db = new DatabaseSync(options.filename || ':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,role TEXT,status TEXT,bankSheba TEXT,
    phone TEXT,nationalId TEXT,idDoc TEXT,name TEXT,isProfileComplete INTEGER);
    CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY,userId TEXT,kind TEXT,title TEXT,body TEXT);`);
  const insert = db.prepare('INSERT OR IGNORE INTO users VALUES (?,?,?,?,?,?,?,?,?)');
  for (const [id, role, status] of [['w', 'WORKER', 'APPROVED'], ['other', 'WORKER', 'APPROVED'], ['c', 'CUSTOMER', 'ACTIVE'], ['blocked', 'WORKER', 'BLOCKED']]) {
    insert.run(id, role, status, fields.encryptString(SHEBA), '09120000001', fields.encryptString('1234567890'), 'existing-document', 'fixture', 1);
  }
  let time = Date.UTC(2026, 9, 26), depth = 0, requireOtp = options.requireOtp || false, failNotification = false;
  const getUser = id => { const row = db.prepare('SELECT * FROM users WHERE id=?').get(id); return row ? { ...row, bankSheba: fields.decryptString(row.bankSheba), nationalId: fields.decryptString(row.nationalId) } : null; };
  const transaction = fn => {
    if (depth) return fn(); db.exec('BEGIN IMMEDIATE'); depth++;
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; } finally { depth--; }
  };
  let sentCode, sentPhone, deliveryOk = true;
  const smsGateway = { normalizeIranMobile: value => /^09\d{9}$/.test(value) ? value : null,
    devFixedOtp: () => null, useFakeSms: () => false, writeFakeSmsOutbox: () => {},
    sendOtp: async (phone, code) => { sentPhone = phone; sentCode = code; return { ok: deliveryOk }; } };
  const create = () => createWorkerBank({ database: db, transaction, getUser, now: () => time,
    otpRequired: () => requireOtp, smsGateway, addNotification: (id, _order, kind, title, body) => {
      if (failNotification) throw new Error('fixture notification failure');
      db.prepare('INSERT INTO notifications(userId,kind,title,body) VALUES (?,?,?,?)').run(id, kind, title, body);
    } });
  return { db, bank: create(), create, getUser, advance: milliseconds => { time += milliseconds; },
    requireOtp: value => { requireOtp = value; }, failNotification: value => { failNotification = value; },
    failSms: value => { deliveryOk = !value; }, sentCode: () => sentCode, sentPhone: () => sentPhone };
}
const pin = (expectedVersion = 0, extra = {}) => ({ newPin: '123456', expectedVersion, ...extra });
const change = (expectedVersion = 1, extra = {}) => ({ bankSheba: OTHER, pin: '123456', expectedVersion, ...extra });

test('Iranian IBAN checksum and strict PIN/field validation reject malformed input without state changes', t => {
  assert.equal(validSheba(SHEBA), true); assert.equal(validSheba(OTHER), true);
  for (const value of ['IR000540102680020817909002', SHEBA.toLowerCase(), ' ' + SHEBA, 'IR12', null]) assert.equal(validSheba(value), false);
  const { bank, db } = fixture(t);
  for (const input of [pin(0, { newPin: '12345' }), pin(0, { newPin: 123456 }), pin(0, { workerId: 'other' }), pin(0, { newPin: '۱۲۳۴۵۶' })]) assert.equal(bank.savePin('w', input).code, 'invalid');
  assert.equal(bank.savePin('c', pin()).code, 'forbidden');
  assert.equal(bank.savePin('blocked', pin()).code, 'forbidden');
  assert.equal(bank.savePin('w', pin()).code, 'ok');
  for (const input of [change(1, { bankSheba: 'IR000540102680020817909002' }), change(1, { name: 'changed' }), change(1, { otp: 'hmac:v1:fake' })]) assert.equal(bank.saveBank('w', input).code, 'invalid');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM worker_bank_audit').get().n, 1);
});

test('PIN is salted scrypt; bank update encrypts only bankSheba and atomically records masked audit and notification', t => {
  const { bank, db, getUser } = fixture(t);
  const before = getUser('w');
  bank.savePin('w', pin()); bank.savePin('other', pin());
  const secrets = db.prepare('SELECT pinHash FROM worker_bank_security').all();
  assert.match(secrets[0].pinHash, /^scrypt:v1:/); assert.notEqual(secrets[0].pinHash, secrets[1].pinHash);
  const result = bank.saveBank('w', change());
  assert.deepEqual(result.bankDetails, { bankShebaMasked: 'IR06****0001', hasPin: true, lockedUntil: null, version: 2 });
  assert.deepEqual(getUser('w'), { ...before, bankSheba: OTHER });
  assert.equal(getUser('other').bankSheba, SHEBA);
  assert.match(db.prepare('SELECT bankSheba FROM users WHERE id=?').get('w').bankSheba, /^enc:v1:/);
  const audit = db.prepare("SELECT * FROM worker_bank_audit WHERE kind='SHEBA_CHANGED'").get();
  assert.equal(audit.previousShebaMasked, 'IR82****9002'); assert.equal(audit.nextShebaMasked, 'IR06****0001');
  const publicText = JSON.stringify(result) + JSON.stringify(audit) + JSON.stringify(db.prepare('SELECT * FROM notifications').all());
  for (const secret of [SHEBA, OTHER, '123456', secrets[0].pinHash]) assert.equal(publicText.includes(secret), false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE userId='w'").get().n, 2);
  assert.throws(() => db.prepare('UPDATE worker_bank_audit SET reason=?').run('tamper'), /immutable/);
  assert.throws(() => db.exec('DELETE FROM worker_bank_audit'), /immutable/);
  assert.throws(() => db.prepare('INSERT OR REPLACE INTO worker_bank_audit SELECT * FROM worker_bank_audit WHERE id=?').run(audit.id), /immutable/);
});

test('five wrong PIN attempts lock bank and PIN edits for fifteen minutes across service recreation', t => {
  const f = fixture(t); f.bank.savePin('w', pin());
  for (let i = 0; i < 4; i++) assert.equal(f.bank.saveBank('w', change(1, { pin: '654321' })).code, 'pin_invalid');
  const locked = f.bank.savePin('w', pin(1, { currentPin: '654321' }));
  assert.equal(locked.code, 'locked'); assert.ok(locked.lockedUntil);
  assert.equal(f.create().saveBank('w', change()).code, 'locked');
  assert.equal(f.create().savePin('w', pin(1, { currentPin: '123456', newPin: '111111' })).code, 'locked');
  f.advance(15 * 60 * 1000 - 1); assert.equal(f.bank.saveBank('w', change()).code, 'locked');
  f.advance(1); assert.equal(f.bank.saveBank('w', change()).code, 'ok');
  assert.equal(f.bank.read('w').bankDetails.lockedUntil, null);
});

test('PIN change needs current PIN; admin reset requires existing identity, reason, version and clears PIN only', t => {
  const { bank, db, getUser } = fixture(t);
  bank.savePin('w', pin());
  assert.equal(bank.savePin('w', pin(1)).code, 'pin_required');
  assert.equal(bank.savePin('w', pin(1, { currentPin: '123456', newPin: '112233' })).code, 'ok');
  assert.equal(bank.saveBank('w', change(2)).code, 'pin_invalid');
  const before = getUser('w');
  for (const extra of [{ identityVerified: false }, { reason: '' }, { newPin: '111111' }, { expectedVersion: 0 }]) {
    const result = bank.resetPin('w', { reason: 'بررسی مدرک موجود', identityVerified: true, expectedVersion: 2, ...extra });
    assert.ok(['invalid', 'conflict'].includes(result.code));
  }
  db.prepare("UPDATE users SET idDoc='' WHERE id='other'").run();
  assert.equal(bank.resetPin('other', { reason: 'بررسی مدرک موجود', identityVerified: true, expectedVersion: 0 }).code, 'identity_missing');
  const result = bank.resetPin('w', { reason: 'بررسی مدرک موجود', identityVerified: true, expectedVersion: 2 });
  assert.equal(result.bankDetails.hasPin, false); assert.equal(result.bankDetails.version, 3);
  assert.deepEqual(getUser('w'), before);
  assert.equal(bank.saveBank('w', change(3, { pin: '112233' })).code, 'pin_required');
  assert.equal(bank.savePin('w', pin(3, { newPin: '222222' })).code, 'ok');
  const audit = db.prepare("SELECT * FROM worker_bank_audit WHERE kind='PIN_RESET'").get();
  assert.equal(audit.actor, 'admin'); assert.equal(audit.reason, 'بررسی مدرک موجود');
});

test('failure of audit or notification rolls back encrypted bank, PIN, version and audit together', t => {
  const f = fixture(t); f.bank.savePin('w', pin());
  const before = f.bank.read('w'), user = f.getUser('w');
  f.failNotification(true);
  assert.throws(() => f.bank.saveBank('w', change()), /fixture notification/);
  assert.throws(() => f.bank.resetPin('w', { reason: 'بررسی مدرک موجود', identityVerified: true, expectedVersion: 1 }), /fixture notification/);
  assert.deepEqual(f.bank.read('w'), before); assert.deepEqual(f.getUser('w'), user);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM worker_bank_audit').get().n, 1);
  f.failNotification(false);
  f.db.exec("CREATE TRIGGER fail_bank_audit BEFORE INSERT ON worker_bank_audit BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
  assert.throws(() => f.bank.savePin('w', pin(1, { currentPin: '123456', newPin: '222222' })), /fixture audit/);
  assert.deepEqual(f.bank.read('w'), before);
});

test('SMS step-up is separate by worker/purpose, expires, is single-use and stays consumed only on committed changes', async t => {
  const f = fixture(t, { requireOtp: true });
  assert.equal(f.bank.savePin('w', pin()).code, 'otp_required');
  assert.equal((await f.bank.sendOtp('w', { purpose: 'bank-pin' })).code, 'ok');
  assert.equal(f.sentPhone(), '09120000001');
  let code = f.sentCode();
  assert.equal(f.bank.savePin('other', pin(0, { otp: code })).code, 'otp_invalid');
  assert.equal((await f.bank.sendOtp('w', { purpose: 'bank-pin' })).code, 'rate_limited');
  assert.equal(f.bank.savePin('w', pin(0, { otp: code })).code, 'ok');
  for (let i = 0; i < 4; i++) assert.equal(f.bank.saveBank('w', change(1, { pin: '654321', otp: code })).code, 'pin_invalid');
  assert.equal(f.bank.savePin('w', pin(1, { currentPin: '123456', otp: code })).code, 'otp_invalid');
  assert.equal(f.db.prepare('SELECT failedAttempts FROM worker_bank_security WHERE workerId=?').get('w').failedAttempts, 0);
  await f.bank.sendOtp('w', { purpose: 'bank-details' }); code = f.sentCode();
  assert.equal(f.bank.savePin('w', pin(1, { currentPin: '123456', otp: code })).code, 'otp_invalid');
  f.failNotification(true); assert.throws(() => f.bank.saveBank('w', change(1, { otp: code })), /fixture notification/);
  f.failNotification(false); assert.equal(f.bank.saveBank('w', change(1, { otp: code })).code, 'ok');
  assert.equal(f.bank.saveBank('w', change(2, { otp: code })).code, 'otp_invalid');
  await f.bank.sendOtp('w', { purpose: 'bank-details' }); code = f.sentCode();
  f.advance(5 * 60 * 1000);
  assert.equal(f.bank.saveBank('w', change(2, { otp: code })).code, 'otp_invalid');
  assert.equal(f.db.prepare('SELECT codeHash FROM worker_bank_otp').get().codeHash.includes(code), false);
});

test('failed SMS never enables changes; OTP attempt cap and production gate cannot be bypassed', async t => {
  const f = fixture(t, { requireOtp: true }); f.failSms(true);
  assert.equal((await f.bank.sendOtp('w', { purpose: 'bank-pin' })).code, 'sms_unavailable');
  assert.equal(f.bank.savePin('w', pin(0, { otp: f.sentCode() })).code, 'otp_invalid');
  f.advance(30000); f.failSms(false); await f.bank.sendOtp('w', { purpose: 'bank-pin' });
  const wrong = f.sentCode() === '1111' ? '2222' : '1111';
  for (let i = 0; i < 5; i++) assert.equal(f.bank.savePin('w', pin(0, { otp: wrong })).code, 'otp_invalid');
  assert.equal(f.bank.savePin('w', pin(0, { otp: f.sentCode() })).code, 'otp_locked');
  const old = { NODE_ENV: process.env.NODE_ENV, PAKSHO_DEV_OTP_BYPASS: process.env.PAKSHO_DEV_OTP_BYPASS, PAKSHO_SMS_MODE: process.env.PAKSHO_SMS_MODE };
  try { Object.assign(process.env, { NODE_ENV: 'production', PAKSHO_DEV_OTP_BYPASS: '1', PAKSHO_SMS_MODE: 'fake' }); assert.equal(smsStepUpRequired(), true); }
  finally { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test('security state and locks persist on disk reopen without changing old profiles or orders', t => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
  const filename = path.join(os.tmpdir(), 'paksho-bank-' + crypto.randomUUID() + '.sqlite');
  const { createDataStore } = require('./dataStore');
  let store = createDataStore(filename);
  t.after(() => { store.close(); fs.unlinkSync(filename); });
  store.createUser({ id: 'disk', role: 'WORKER', status: 'APPROVED', isProfileComplete: true, phone: '09120000001', bankSheba: SHEBA, nationalId: '1234567890', idDoc: 'existing', createdAt: new Date().toISOString() });
  const before = store.getUser('disk');
  const order = store.createOrder({ id: 'active-bank', customerId: 'customer', customerName: 'fixture', customerPhone: '09121111111', cleanerId: 'disk', serviceTitle: 'fixture', date: '2026-10-26', time: '10:00', price: 100000, address: 'existing', status: 'IN_PROGRESS', createdAt: new Date().toISOString() });
  store.workerBank.savePin('disk', pin());
  for (let i = 0; i < 5; i++) store.workerBank.saveBank('disk', change(1, { pin: '654321' }));
  const locked = store.workerBank.read('disk');
  store.close(); store = createDataStore(filename);
  assert.deepEqual(store.workerBank.read('disk'), locked);
  assert.equal(store.workerBank.saveBank('disk', change()).code, 'locked');
  assert.deepEqual(store.getUser('disk'), before); assert.deepEqual(store.getOrder(order.id), order);
});
