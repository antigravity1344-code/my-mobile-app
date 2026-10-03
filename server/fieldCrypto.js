const crypto = require('crypto');

const ENC_PREFIX = 'enc:v1:';
const HMAC_PREFIX = 'hmac:v1:';

let masterKeyCache;

function readMasterKey() {
  if (masterKeyCache) return masterKeyCache;
  const raw = typeof process.env.PAKSHO_DATA_ENCRYPTION_KEY === 'string'
    ? process.env.PAKSHO_DATA_ENCRYPTION_KEY.trim()
    : '';
  if (!raw) {
    const error = new Error('PAKSHO_DATA_ENCRYPTION_KEY تنظیم نشده است. سرور بدون کلید رمزنگاری اجرا نمی‌شود.');
    error.code = 'MISSING_DATA_KEY';
    throw error;
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    const error = new Error('PAKSHO_DATA_ENCRYPTION_KEY باید ۳۲ بایت باشد.');
    error.code = 'INVALID_DATA_KEY';
    throw error;
  }
  masterKeyCache = key;
  return key;
}

function assertKeyConfigured() {
  readMasterKey();
}

function derive(info) {
  return Buffer.from(crypto.hkdfSync('sha256', readMasterKey(), Buffer.alloc(0), Buffer.from(info), 32));
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

function isHashed(value) {
  return typeof value === 'string' && value.startsWith(HMAC_PREFIX);
}

function encryptString(plain) {
  if (plain == null || plain === '') return '';
  const text = String(plain);
  if (isEncrypted(text)) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derive('paksho-aes-v1'), iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptString(stored) {
  if (stored == null || stored === '') return '';
  const text = String(stored);
  if (!isEncrypted(text)) {
    const error = new Error('داده حساس بدون رمز ذخیره شده است.');
    error.code = 'PLAINTEXT_SENSITIVE_DATA';
    throw error;
  }
  const packed = Buffer.from(text.slice(ENC_PREFIX.length), 'base64');
  if (packed.length < 12 + 16 + 1) {
    const error = new Error('رمزگشایی داده ممکن نشد.');
    error.code = 'DECRYPT_FAILED';
    throw error;
  }
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', derive('paksho-aes-v1'), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (error) {
    const failure = new Error('رمزگشایی داده ممکن نشد.');
    failure.code = 'DECRYPT_FAILED';
    throw failure;
  }
}

function hashSecret(plain) {
  const text = String(plain);
  if (isHashed(text)) return text;
  const mac = crypto.createHmac('sha256', derive('paksho-hmac-v1')).update(text, 'utf8').digest('base64');
  return HMAC_PREFIX + mac;
}

function secretsMatch(plain, stored) {
  if (!isHashed(stored)) return false;
  const candidate = Buffer.from(hashSecret(plain));
  const actual = Buffer.from(String(stored));
  if (candidate.length !== actual.length) return false;
  return crypto.timingSafeEqual(candidate, actual);
}

module.exports = {
  ENC_PREFIX,
  HMAC_PREFIX,
  assertKeyConfigured,
  isEncrypted,
  isHashed,
  encryptString,
  decryptString,
  hashSecret,
  secretsMatch,
};
