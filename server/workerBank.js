'use strict';

const crypto = require('node:crypto');
const fieldCrypto = require('./fieldCrypto');
const sms = require('./kavenegarSms');
const LOCK_MS = 15 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;

function maskedSheba(value) { return typeof value === 'string' && /^IR\d{24}$/.test(value) ? value.slice(0, 4) + '****' + value.slice(-4) : null; }
function validSheba(value) {
  if (typeof value !== 'string' || !/^IR\d{24}$/.test(value)) return false;
  let remainder = 0;
  for (const digit of value.slice(4) + '1827' + value.slice(2, 4)) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
function validPin(value) { return typeof value === 'string' && /^\d{6}$/.test(value); }
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt:v1:' + salt + ':' + crypto.scryptSync(pin, salt, 32).toString('hex');
}
function pinMatches(pin, stored) {
  if (!validPin(pin) || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== 'v1'
    || !/^[a-f0-9]{32}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(pin, parts[2], 32), Buffer.from(parts[3], 'hex'));
}
function strict(input, required, optional = []) {
  return input && typeof input === 'object' && !Array.isArray(input)
    && required.every(key => Object.hasOwn(input, key))
    && Object.keys(input).every(key => required.includes(key) || optional.includes(key));
}
function smsStepUpRequired() {
  if (process.env.NODE_ENV === 'production') return true;
  if (sms.devFixedOtp() || sms.useFakeSms()) return false;
  const config = sms.readConfig();
  return Boolean(config.apiKey || config.template);
}

function createWorkerBank({ database, transaction, getUser, addNotification,
  now = Date.now, otpRequired = smsStepUpRequired, smsGateway = sms }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS worker_bank_security (
      workerId TEXT PRIMARY KEY REFERENCES users(id), pinHash TEXT,
      version INTEGER NOT NULL DEFAULT 0, failedAttempts INTEGER NOT NULL DEFAULT 0,
      lockedUntil INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS worker_bank_audit (
      id TEXT PRIMARY KEY, workerId TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL,
      previousShebaMasked TEXT, nextShebaMasked TEXT, reason TEXT,
      version INTEGER NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS worker_bank_audit_no_update BEFORE UPDATE ON worker_bank_audit
      BEGIN SELECT RAISE(ABORT, 'bank audit is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS worker_bank_audit_no_delete BEFORE DELETE ON worker_bank_audit
      BEGIN SELECT RAISE(ABORT, 'bank audit is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS worker_bank_audit_no_replace BEFORE INSERT ON worker_bank_audit
      WHEN EXISTS (SELECT 1 FROM worker_bank_audit WHERE id = NEW.id)
      BEGIN SELECT RAISE(ABORT, 'bank audit is immutable'); END;
    CREATE TABLE IF NOT EXISTS worker_bank_otp (
      workerId TEXT NOT NULL, purpose TEXT NOT NULL, codeHash TEXT NOT NULL,
      attempts INTEGER NOT NULL, lastSent INTEGER NOT NULL, expires INTEGER NOT NULL,
      windowStarted INTEGER NOT NULL, sendCount INTEGER NOT NULL,
      PRIMARY KEY (workerId, purpose)
    );
  `);
  const security = database.prepare('SELECT * FROM worker_bank_security WHERE workerId=?');
  const ensure = database.prepare('INSERT OR IGNORE INTO worker_bank_security (workerId) VALUES (?)');
  const failures = database.prepare('UPDATE worker_bank_security SET failedAttempts=?,lockedUntil=? WHERE workerId=?');
  const setPin = database.prepare('UPDATE worker_bank_security SET pinHash=?,version=version+1,failedAttempts=0,lockedUntil=0 WHERE workerId=?');
  const versionUp = database.prepare('UPDATE worker_bank_security SET version=version+1,failedAttempts=0,lockedUntil=0 WHERE workerId=?');
  const bank = database.prepare('UPDATE users SET bankSheba=? WHERE id=?');
  const audit = database.prepare('INSERT INTO worker_bank_audit VALUES (?,?,?,?,?,?,?,?,?)');
  const challenge = database.prepare('SELECT * FROM worker_bank_otp WHERE workerId=? AND purpose=?');
  const saveChallenge = database.prepare(`INSERT INTO worker_bank_otp VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(workerId,purpose) DO UPDATE SET codeHash=excluded.codeHash,attempts=excluded.attempts,
    lastSent=excluded.lastSent,expires=excluded.expires,windowStarted=excluded.windowStarted,sendCount=excluded.sendCount`);
  const consume = database.prepare('DELETE FROM worker_bank_otp WHERE workerId=? AND purpose=?');
  const consumeAll = database.prepare('DELETE FROM worker_bank_otp WHERE workerId=?');
  const otpFailure = database.prepare('UPDATE worker_bank_otp SET attempts=attempts+1 WHERE workerId=? AND purpose=?');
  const readyOtp = database.prepare('UPDATE worker_bank_otp SET expires=? WHERE workerId=? AND purpose=? AND codeHash=?');

  function worker(workerId) {
    const user = getUser(workerId);
    return user?.role === 'WORKER' && user.status !== 'BLOCKED' ? user : null;
  }
  function read(workerId) {
    const user = worker(workerId);
    if (!user) return { code: 'forbidden' };
    const state = security.get(workerId);
    return { code: 'ok', bankDetails: { bankShebaMasked: maskedSheba(user.bankSheba), hasPin: Boolean(state?.pinHash),
      lockedUntil: state?.lockedUntil > now() ? new Date(state.lockedUntil).toISOString() : null,
      version: state?.version || 0 }, otpRequired: Boolean(otpRequired()) };
  }
  function current(workerId, expectedVersion) {
    const user = worker(workerId);
    if (!user) return { code: 'forbidden' };
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { code: 'invalid' };
    ensure.run(workerId);
    let state = security.get(workerId);
    if (state.version !== expectedVersion) return { code: 'conflict' };
    if (state.lockedUntil > now()) return { code: 'locked', lockedUntil: new Date(state.lockedUntil).toISOString() };
    if (state.lockedUntil) { failures.run(0, 0, workerId); state = security.get(workerId); }
    return { user, state };
  }
  function checkPin(workerId, state, pin) {
    if (!state.pinHash) return { code: 'pin_required' };
    if (pinMatches(pin, state.pinHash)) {
      // The policy counts consecutive wrong PINs, independently of SMS mistakes.
      if (state.failedAttempts) failures.run(0, 0, workerId);
      return null;
    }
    const attempts = state.failedAttempts + 1;
    const lockedUntil = attempts >= 5 ? now() + LOCK_MS : 0;
    failures.run(attempts, lockedUntil, workerId);
    return lockedUntil ? { code: 'locked', lockedUntil: new Date(lockedUntil).toISOString() } : { code: 'pin_invalid' };
  }
  function checkOtp(workerId, purpose, value) {
    if (!otpRequired()) return null;
    if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return { code: 'otp_required' };
    const row = challenge.get(workerId, purpose);
    if (!row || row.expires <= now()) return { code: 'otp_invalid' };
    if (row.attempts >= 5) return { code: 'otp_locked' };
    if (!fieldCrypto.secretsMatch(value, row.codeHash)) { otpFailure.run(workerId, purpose); return { code: 'otp_invalid' }; }
    return null;
  }
  function record(workerId, kind, actor, before, after, reason = null) {
    const version = security.get(workerId).version;
    audit.run(crypto.randomUUID(), workerId, kind, actor, maskedSheba(before), maskedSheba(after), reason, version, new Date(now()).toISOString());
    const title = kind === 'SHEBA_CHANGED' ? 'شماره شبا تغییر کرد' : kind === 'PIN_RESET' ? 'رمز شبا بازنشانی شد' : 'رمز شبا تعیین یا تغییر کرد';
    addNotification(workerId, '', kind, title,
      kind === 'PIN_RESET' ? 'مدیریت پس از بررسی هویت، رمز شما را بازنشانی کرد. رمز تازه تعیین کنید.' : 'این تغییر در حساب شما ثبت شد. اگر درخواست شما نبوده، با پشتیبانی تماس بگیرید.');
  }
  function saveBank(workerId, input) {
    if (!strict(input, ['bankSheba', 'pin', 'expectedVersion'], ['otp']) || !validSheba(input.bankSheba) || !validPin(input.pin)
      || (Object.hasOwn(input, 'otp') && (typeof input.otp !== 'string' || !/^\d{4}$/.test(input.otp)))) return { code: 'invalid' };
    return transaction(() => {
      const state = current(workerId, input.expectedVersion); if (state.code) return state;
      const pinError = checkPin(workerId, state.state, input.pin); if (pinError) return pinError;
      const otpError = checkOtp(workerId, 'bank-details', input.otp); if (otpError) return otpError;
      bank.run(fieldCrypto.encryptString(input.bankSheba), workerId);
      versionUp.run(workerId);
      consume.run(workerId, 'bank-details');
      record(workerId, 'SHEBA_CHANGED', 'worker', state.user.bankSheba, input.bankSheba);
      return read(workerId);
    });
  }
  function savePin(workerId, input) {
    if (!strict(input, ['newPin', 'expectedVersion'], ['currentPin', 'otp']) || !validPin(input.newPin)
      || (Object.hasOwn(input, 'currentPin') && !validPin(input.currentPin))
      || (Object.hasOwn(input, 'otp') && (typeof input.otp !== 'string' || !/^\d{4}$/.test(input.otp)))) return { code: 'invalid' };
    return transaction(() => {
      const state = current(workerId, input.expectedVersion); if (state.code) return state;
      if (state.state.pinHash) {
        if (!validPin(input.currentPin)) return { code: 'pin_required' };
        const pinError = checkPin(workerId, state.state, input.currentPin); if (pinError) return pinError;
      } else if (Object.hasOwn(input, 'currentPin')) return { code: 'invalid' };
      const otpError = checkOtp(workerId, 'bank-pin', input.otp); if (otpError) return otpError;
      setPin.run(hashPin(input.newPin), workerId);
      consumeAll.run(workerId);
      record(workerId, state.state.pinHash ? 'PIN_CHANGED' : 'PIN_CREATED', 'worker', state.user.bankSheba, state.user.bankSheba);
      return read(workerId);
    });
  }
  function resetPin(workerId, input) {
    if (!strict(input, ['reason', 'identityVerified', 'expectedVersion']) || input.identityVerified !== true
      || typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.length > 500
      || /[\u0000-\u001f\u007f]/.test(input.reason) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return { code: 'invalid' };
    return transaction(() => {
      const user = worker(workerId); if (!user) return { code: 'forbidden' };
      if (!user.nationalId || !user.idDoc) return { code: 'identity_missing' };
      ensure.run(workerId);
      if (security.get(workerId).version !== input.expectedVersion) return { code: 'conflict' };
      setPin.run(null, workerId);
      consumeAll.run(workerId);
      record(workerId, 'PIN_RESET', 'admin', user.bankSheba, user.bankSheba, input.reason.trim());
      return read(workerId);
    });
  }
  async function sendOtp(workerId, input) {
    if (!strict(input, ['purpose']) || !['bank-details', 'bank-pin'].includes(input.purpose)) return { code: 'invalid' };
    const user = worker(workerId); if (!user) return { code: 'forbidden' };
    if (!otpRequired()) return { code: 'ok', otpRequired: false };
    const phone = smsGateway.normalizeIranMobile(user.phone); if (!phone) return { code: 'invalid' };
    const code = smsGateway.devFixedOtp() || String(crypto.randomInt(1000, 10000));
    const codeHash = fieldCrypto.hashSecret(code);
    const reserved = transaction(() => {
      const time = now(), old = challenge.get(workerId, input.purpose);
      if (security.get(workerId)?.lockedUntil > time) return { code: 'locked' };
      if (old && time - old.lastSent < 30000) return { code: 'rate_limited' };
      const windowStarted = old && time - old.windowStarted < 3600000 ? old.windowStarted : time;
      const sendCount = old && windowStarted === old.windowStarted ? old.sendCount : 0;
      if (sendCount >= 8) return { code: 'rate_limited' };
      saveChallenge.run(workerId, input.purpose, codeHash, 0, time, 0, windowStarted, sendCount + 1);
      return { code: 'ok' };
    });
    if (reserved.code !== 'ok') return reserved;
    let delivery;
    try {
      if (smsGateway.devFixedOtp() || smsGateway.useFakeSms()) {
        delivery = { ok: true }; smsGateway.writeFakeSmsOutbox(phone, code);
      } else delivery = await smsGateway.sendOtp(phone, code);
    } catch { delivery = { ok: false }; }
    if (!delivery?.ok) return { code: 'sms_unavailable' };
    readyOtp.run(now() + OTP_TTL_MS, workerId, input.purpose, codeHash);
    return { code: 'ok', otpRequired: true };
  }
  return { read, saveBank, savePin, resetPin, sendOtp };
}
module.exports = { createWorkerBank, validSheba, smsStepUpRequired };
