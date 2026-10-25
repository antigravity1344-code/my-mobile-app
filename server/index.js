const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  createWorkerDocumentStorage,
  rememberDocument,
  assignDocument,
} = require('./workerDocumentStorage');
const { createDataStore, normalizeIsoTimestamp } = require('./dataStore');
const { registerCommissionRoutes } = require('./commissionRoutes');
const { registerCompletionRoutes } = require('./completionRoutes');
const { registerWorkerWalletRoutes } = require('./workerWalletRoutes');
const { registerPaymentSettingsRoutes } = require('./paymentSettingsRoutes');
const kavenegarSms = require('./kavenegarSms');
const { assertKeyConfigured, secretsMatch } = require('./fieldCrypto');
const { resolvePricingMode } = require('./pricing/pricingMode');
const {
  issueOrderQuote,
  confirmOrderQuote,
  matchExistingServerOrder,
  mapPricingError,
  serverRequestConflicts,
} = require('./pricing/orderQuote');
const { registerDraft, publishVersion, readAdminTariff } = require('./pricing/tariffPublication');
const { readSourceIdentity, sourceIdentityScriptJson } = require('../tools/sourceIdentity.cjs');
const SOURCE_IDENTITY = readSourceIdentity();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '..', '.env'));
assertKeyConfigured();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ADMIN_PASSWORD =
  typeof process.env.PAKSHO_ADMIN_PASSWORD === 'string' && process.env.PAKSHO_ADMIN_PASSWORD.trim()
    ? process.env.PAKSHO_ADMIN_PASSWORD.trim()
    : '';
const USER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const ADMIN_ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ADMIN_USER_STATUSES = ['REGISTERED', 'PENDING_VERIFICATION', 'APPROVED', 'ACTIVE', 'REJECTED', 'BLOCKED'];
// برچسب فارسی وضعیت کاربر برای پیام‌ها؛ وضعیت خام انگلیسی به کاربر نشان داده نمی‌شود (D-06).
const USER_STATUS_LABELS = {
  REGISTERED: 'ثبت‌نام اولیه',
  PENDING_VERIFICATION: 'در انتظار بررسی مدارک',
  APPROVED: 'تأیید شده',
  ACTIVE: 'فعال',
  REJECTED: 'رد شده',
  BLOCKED: 'مسدود شده',
};
const MIN_ORDER_PRICE = 50000;
const MAX_ORDER_PRICE = 20000000;
const MAX_DOC_CHARS = 400000;
const MAX_ID_DOC_BYTES = 8 * 1024 * 1024;
const workerDocuments = createWorkerDocumentStorage(
  process.env.PAKSHO_WORKER_DOC_DIR
    ? path.resolve(process.env.PAKSHO_WORKER_DOC_DIR)
    : path.join(__dirname, 'uploads', 'worker-docs')
);

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', (req, res) => {
  res.status(404).json({ success: false, message: 'یافت نشد.' });
});
app.use('/data', (req, res) => {
  res.status(404).json({ success: false, message: 'یافت نشد.' });
});

const store = createDataStore(
  process.env.PAKSHO_SQLITE_PATH
    ? path.resolve(process.env.PAKSHO_SQLITE_PATH)
    : path.join(__dirname, 'data', 'paksho.sqlite')
);
const otpSendWindow = new Map();
const adminLoginAttempts = new Map();

function pruneExpiredSessions() {
  store.pruneSessions(Date.now());
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function clientKey(req) {
  return String(req.ip || req.socket.remoteAddress || 'unknown');
}

function issueUserSession(user) {
  pruneExpiredSessions();
  const token = crypto.randomBytes(24).toString('hex');
  store.createSession(token, {
    userId: user.id,
    role: user.role,
    expires: Date.now() + USER_SESSION_MS
  });
  return token;
}

function revokeUserSession(token) {
  if (!token) return false;
  return store.deleteSession(token);
}

function authUserFromRequest(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const session = store.getSession(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    store.deleteSession(token);
    return null;
  }
  const user = store.getUser(session.userId);
  if (!user || user.role !== session.role) return null;
  return user;
}

function requireUser(req, res) {
  const user = authUserFromRequest(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'ورود لازم است.' });
    return null;
  }
  if (user.status === 'BLOCKED') {
    res.status(403).json({ success: false, code: 'ACCOUNT_BLOCKED', message: 'حساب شما مسدود شده است.' });
    return null;
  }
  return user;
}

function detectImageKind(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function parseIdDocFile(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'مدرک هویتی الزامی است.' };
  }
  const mime = typeof payload.mimeType === 'string' ? payload.mimeType.trim().toLowerCase() : '';
  const allowed = { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!allowed[mime]) {
    return { error: 'فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود.' };
  }
  const raw = typeof payload.data === 'string' ? payload.data.trim() : '';
  if (!raw) return { error: 'مدرک هویتی الزامی است.' };
  const cleaned = raw.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!cleaned || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    return { error: 'فایل مدرک معتبر نیست.' };
  }
  const buffer = Buffer.from(cleaned, 'base64');
  if (!buffer.length || buffer.length > MAX_ID_DOC_BYTES) {
    return { error: 'حجم این تصویر بیشتر از ۸ مگابایت است. لطفاً فایل کوچک‌تری انتخاب کنید.' };
  }
  const kind = detectImageKind(buffer);
  if (!kind || kind !== allowed[mime]) {
    return { error: 'محتوای فایل با نوع تصویر اعلام‌شده یکی نیست.' };
  }
  return { buffer, ext: kind === 'jpeg' ? 'jpg' : kind };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone,
    role: user.role,
    status: user.status,
    isProfileComplete: !!user.isProfileComplete,
    name: user.name || '',
    birthDate: user.birthDate || '',
    avatar: user.avatar || '',
    address: user.address || '',
    city: user.city || '',
    skills: Array.isArray(user.skills) ? user.skills : [],
    addresses: Array.isArray(user.addresses) ? user.addresses : [],
    savedAddresses: Array.isArray(user.savedAddresses) ? user.savedAddresses : [],
    createdAt: user.createdAt
  };
}

function adminUserView(user) {
  const base = publicUser(user);
  if (!base) return null;
  return {
    ...base,
    nationalIdMasked: user.nationalId
      ? String(user.nationalId).slice(0, 3) + '****' + String(user.nationalId).slice(-3)
      : '',
    bankShebaMasked: user.bankSheba
      ? String(user.bankSheba).slice(0, 4) + '****' + String(user.bankSheba).slice(-4)
      : '',
    hasNationalId: !!user.nationalId,
    hasBankSheba: !!user.bankSheba,
    hasIdDoc: !!user.idDoc
  };
}

function createOrderId() {
  let id = '';
  do {
    id = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex');
  } while (store.getOrder(id));
  return id;
}

function sanitizePricing(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const numericKeys = [
    'subtotal',
    'earlyBirdDiscountRate',
    'earlyBirdDiscountAmount',
    'tierDiscountRate',
    'tierDiscountAmount',
    'recurringDiscountRate',
    'recurringDiscountAmount',
    'discountRate',
    'discountAmount',
    'total',
  ];
  const pricing = {};
  for (const key of numericKeys) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) pricing[key] = value[key];
  }
  if (typeof value.recurringDiscountDeferred === 'boolean') {
    pricing.recurringDiscountDeferred = value.recurringDiscountDeferred;
  }
  return typeof pricing.total === 'number' ? pricing : null;
}

function sanitizeServiceOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const options = {};
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(key)) continue;
    if (typeof raw === 'string') {
      const text = raw.trim().slice(0, 80);
      if (text) options[key] = text;
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      options[key] = raw;
    } else if (typeof raw === 'boolean') {
      options[key] = raw;
    }
  }
  return Object.keys(options).length ? options : null;
}

function parseOrderPrice(raw) {
  const price = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(price) || !Number.isInteger(price)) return null;
  if (price < MIN_ORDER_PRICE || price > MAX_ORDER_PRICE) return null;
  return price;
}

function generateOtpCode() {
  return String(crypto.randomInt(1000, 10000));
}

function checkAdminLoginRate(key) {
  const now = Date.now();
  const entry = adminLoginAttempts.get(key) || { fails: 0, lockedUntil: 0 };
  if (entry.lockedUntil > now) {
    return { ok: false, waitSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  return { ok: true, entry };
}

function recordAdminLoginFailure(key, entry) {
  entry.fails += 1;
  if (entry.fails >= 5) {
    entry.lockedUntil = Date.now() + 15 * 60 * 1000;
    entry.fails = 0;
  }
  adminLoginAttempts.set(key, entry);
}

if (!ADMIN_PASSWORD) {
  console.warn(
    '[Paksho] PAKSHO_ADMIN_PASSWORD تنظیم نشده؛ ورود مدیر غیرفعال است. مقدار را در server/.env قرار دهید.'
  );
} else if (IS_PRODUCTION) {
  console.log('[Paksho] رمز مدیر از محیط خوانده شد.');
}

// ------------------- API عمومی و احراز هویت -------------------

// 1. ارسال OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const phone = kavenegarSms.normalizeIranMobile(req.body?.phone);
  if (!phone) {
    return res.status(400).json({ success: false, message: 'شماره همراه باید با ۰۹ و ۱۱ رقم باشد.' });
  }

  const now = Date.now();
  const windowKey = phone;
  const window = otpSendWindow.get(windowKey) || { count: 0, startedAt: now };
  if (now - window.startedAt > 60 * 60 * 1000) {
    window.count = 0;
    window.startedAt = now;
  }
  if (window.count >= 8) {
    return res.status(429).json({
      success: false,
      message: 'تعداد درخواست کد برای این شماره بیش از حد مجاز است. یک ساعت دیگر تلاش کنید.'
    });
  }

  const existingOtp = store.getOtp(phone);
  if (existingOtp && now - existingOtp.lastSent < OTP_RESEND_MS) {
    const waitSec = Math.ceil((OTP_RESEND_MS - (now - existingOtp.lastSent)) / 1000);
    return res.status(429).json({
      success: false,
      message: `لطفاً ${waitSec} ثانیه دیگر جهت درخواست مجدد کد شکیبایی ورزید.`
    });
  }

  const devCode = kavenegarSms.devFixedOtp();
  const code = devCode || generateOtpCode();
  let delivery;
  if (devCode || kavenegarSms.useFakeSms()) {
    delivery = { ok: true };
  } else {
    delivery = await kavenegarSms.sendOtp(phone, code);
  }
  if (!delivery.ok) {
    const message = delivery.status === 424
      ? 'قالب پیامک تایید آماده نیست. کد تایید صادر نشد.'
      : 'ارسال پیامک انجام نشد. کد تایید صادر نشد.';
    return res.status(503).json({ success: false, message });
  }

  store.saveOtp(phone, {
    code,
    attempts: 0,
    lastSent: now,
    expires: now + OTP_TTL_MS
  });
  if (kavenegarSms.useFakeSms()) {
    try {
      kavenegarSms.writeFakeSmsOutbox(phone, code);
    } catch {
      console.error('[Paksho] صندوق پیامک آزمایشی نوشته نشد.');
    }
  }
  window.count += 1;
  otpSendWindow.set(windowKey, window);

  if (devCode) {
    return res.json({ success: true, message: 'حالت توسعه: پیامک ارسال نشد. کد ۱۲۳۴ را وارد کنید.' });
  }
  res.json({
    success: true,
    message: 'کد تایید پیامک شد.'
  });
});

// 2. بررسی OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const phone = kavenegarSms.normalizeIranMobile(req.body?.phone);
  const code = typeof req.body?.code === 'string'
    ? req.body.code.trim()
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    : '';
  const role = req.body?.role;

  // Only a human-entered four-digit OTP is a valid credential; stored HMACs are never input codes.
  if (!phone || !/^\d{4}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'شماره تلفن و کد تایید الزامی است.' });
  }

  const otpData = store.getOtp(phone);
  if (!otpData) {
    return res.status(400).json({ success: false, message: 'درخواستی برای این شماره یافت نشد.' });
  }

  if (otpData.expires && Date.now() > otpData.expires) {
    store.deleteOtp(phone);
    return res.status(400).json({ success: false, message: 'کد تایید منقضی شده است. دوباره درخواست دهید.' });
  }

  if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ success: false, message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است.' });
  }

  if (!secretsMatch(code, otpData.code)) {
    store.saveOtp(phone, { ...otpData, attempts: otpData.attempts + 1 });
    return res.status(400).json({ success: false, message: 'کد تایید اشتباه است.' });
  }

  const requestedRole = role === 'WORKER' ? 'WORKER' : 'CUSTOMER';
  let user = store.transaction(() => {
    store.deleteOtp(phone);
    let nextUser = store.getUserByPhone(phone, requestedRole);
    if (!nextUser) {
      nextUser = store.createUser({
        id: 'USER-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
        phone,
        role: requestedRole,
        status: requestedRole === 'WORKER' ? 'REGISTERED' : 'ACTIVE',
        isProfileComplete: false,
        name: '',
        nationalId: '',
        birthDate: '',
        avatar: '',
        idDoc: '',
        address: '',
        city: 'تهران',
        skills: [],
        bankSheba: '',
        addresses: [],
        savedAddresses: [],
        createdAt: new Date().toISOString()
      });
    }
    return nextUser;
  });

  res.json({
    success: true,
    user: publicUser(user),
    token: issueUserSession(user)
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = bearerToken(req);
  revokeUserSession(token);
  res.json({ success: true });
});

app.get('/api/users/me', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  res.json({ success: true, user: publicUser(authUser) });
});

// درجهٔ داخلی خود متخصص (D-67، D-71). فقط برای خود او؛ آستانه، امتیاز و موجودی فرستاده نمی‌شود.
// خواندن ردیفی نمی‌سازد و نبودن ردیف یعنی خاکستری (D-40).
app.get('/api/workers/me/tier', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'WORKER') {
    return res.status(403).json({ success: false, message: 'درجه فقط برای متخصص است.' });
  }
  const account = store.getUserPoints(authUser.id);
  const progress = store.workerTierProgress(authUser.id);
  res.json({
    success: true,
    tierKey: account && account.tierKey ? account.tierKey : 'gray',
    tierSince: account && account.tierSince ? account.tierSince : null,
    // D-75: درجهٔ بعد و مقدار باقی‌مانده؛ قانون نامعتبر یعنی null.
    next: progress ? progress.next : null,
  });
});

// میانگین ستارهٔ خود متخصص (D-73). فقط برای خود او؛ نظر و برچسب مشتری فرستاده نمی‌شود (D-32).
app.get('/api/workers/me/rating', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'WORKER') {
    return res.status(403).json({ success: false, message: 'میانگین ستاره فقط برای متخصص است.' });
  }
  const stats = store.workerRatingStats(authUser.id);
  res.json({ success: true, average: stats.average, count: stats.count });
});

// D-63: residence only; independent of onboarding and its verification transitions.
app.route('/api/workers/me/address')
  .all((req, res, next) => {
    const authUser = requireUser(req, res);
    if (!authUser) return;
    if (authUser.role !== 'WORKER') {
      return res.status(403).json({ success: false, message: 'این بخش فقط برای متخصص است.' });
    }
    if (Object.keys(req.query).length) {
      return res.status(400).json({ success: false, message: 'پارامتر اضافی مجاز نیست.' });
    }
    res.set('Cache-Control', 'no-store');
    res.locals.workerAddressUser = authUser;
    next();
  })
  .get((req, res) => {
    res.json({ success: true, address: res.locals.workerAddressUser.address });
  })
  .put((req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.hasOwn(body, 'address')) {
      return res.status(400).json({ success: false, message: 'فقط فیلد آدرس مجاز است.' });
    }
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address || address.length > 300 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(address)) {
      return res.status(400).json({ success: false, message: 'آدرس باید متن معتبر بین ۱ تا ۳۰۰ نویسه باشد.' });
    }
    try {
      const saved = store.updateWorkerAddress(res.locals.workerAddressUser.id, address);
      res.json({ success: true, address: saved });
    } catch {
      res.status(500).json({ success: false, message: 'ذخیره آدرس انجام نشد. دوباره تلاش کنید.' });
    }
  });

// 3. پروفایل مشتری
app.put('/api/users/customer-profile', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'فقط مشتری می‌تواند این پروفایل را تغییر دهد.' });
  }
  const { userId, name, nationalId, birthDate, address } = req.body || {};
  if (userId && userId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'تغییر پروفایل کاربر دیگر مجاز نیست.' });
  }
  const nextName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  const nextNationalId = typeof nationalId === 'string' ? nationalId.trim() : '';
  const nextBirthDate = typeof birthDate === 'string' ? birthDate.trim().slice(0, 20) : '';
  const nextAddress = typeof address === 'string' ? address.trim().slice(0, 300) : '';

  if (nextNationalId && !/^\d{10}$/.test(nextNationalId)) {
    return res.status(400).json({ success: false, message: 'کد ملی باید ۱۰ رقم باشد.' });
  }

  const user = store.transaction(() => {
    const current = store.getUser(authUser.id);
    if (nextName) current.name = nextName;
    if (nextNationalId) current.nationalId = nextNationalId;
    if (nextBirthDate) current.birthDate = nextBirthDate;
    if (nextAddress) {
      current.address = nextAddress;
      if (!current.addresses) current.addresses = [];
      if (!current.addresses.includes(nextAddress)) current.addresses.push(nextAddress);
    }
    current.isProfileComplete = !!(current.name && current.nationalId);
    return store.updateUser(current);
  });

  res.json({ success: true, user: publicUser(user) });
});

// 4. آنبوردینگ متخصص
function sanitizeSavedAddress(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const title = text(raw.title, 80);
  const fullAddress = text(raw.fullAddress, 300);
  if (!title || !fullAddress) return null;
  return {
    id: text(raw.id, 80) || ('addr-' + crypto.randomBytes(6).toString('hex')),
    title,
    district: text(raw.district, 80),
    fullAddress,
    plaque: text(raw.plaque, 20),
    unit: text(raw.unit, 20),
    recipientName: text(raw.recipientName, 80),
    contactPhone: text(raw.contactPhone, 20),
    isDefault: raw.isDefault === true
  };
}

app.get('/api/users/addresses', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'فقط مشتری به آدرس‌های خودش دسترسی دارد.' });
  }
  res.json({ success: true, addresses: store.getAddresses(authUser.id) });
});

app.put('/api/users/addresses', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'فقط مشتری می‌تواند آدرس خودش را ذخیره کند.' });
  }
  const incoming = Array.isArray(req.body && req.body.addresses) ? req.body.addresses : null;
  if (!incoming) {
    return res.status(400).json({ success: false, message: 'فهرست آدرس معتبر نیست.' });
  }
  const addresses = incoming.slice(0, 20).map(sanitizeSavedAddress).filter(Boolean);
  let defaultSeen = false;
  addresses.forEach((address) => {
    if (address.isDefault && !defaultSeen) {
      defaultSeen = true;
      return;
    }
    address.isDefault = false;
  });
  const savedAddresses = store.updateAddresses(authUser.id, addresses);
  res.json({ success: true, addresses: savedAddresses });
});

app.put('/api/users/worker-onboarding', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'WORKER') {
    return res.status(403).json({ success: false, message: 'فقط متخصص می‌تواند مدارک خودش را ثبت کند.' });
  }
  const { userId, name, nationalId, birthDate, avatar, idDocFile, address, city, skills, bankSheba } = req.body || {};
  if (userId && userId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'تغییر مدارک متخصص دیگر مجاز نیست.' });
  }
  const user = authUser;
  const nextName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  const nextNationalId = typeof nationalId === 'string' ? nationalId.trim() : '';
  const nextBankSheba = typeof bankSheba === 'string' ? bankSheba.trim().toUpperCase() : '';
  const nextAvatar = typeof avatar === 'string' ? avatar.trim() : '';
  const uploadedIdDoc = parseIdDocFile(idDocFile);

  if (!nextName) {
    return res.status(400).json({ success: false, message: 'نام متخصص الزامی است.' });
  }
  if (!/^\d{10}$/.test(nextNationalId)) {
    return res.status(400).json({ success: false, message: 'کد ملی باید ۱۰ رقم باشد.' });
  }
  if (!/^IR\d{24}$/.test(nextBankSheba)) {
    return res.status(400).json({ success: false, message: 'شماره شبا باید با IR و ۲۴ رقم باشد.' });
  }
  if (nextAvatar && nextAvatar.length > MAX_DOC_CHARS) {
    return res.status(400).json({ success: false, message: 'حجم تصویر پروفایل بیش از حد مجاز است.' });
  }
  if (uploadedIdDoc.error) {
    return res.status(400).json({ success: false, message: uploadedIdDoc.error });
  }
  if (nextAvatar && nextAvatar.startsWith('data:') && !/^data:image\/(png|jpeg|jpg|webp);/i.test(nextAvatar)) {
    return res.status(400).json({ success: false, message: 'فرمت تصویر پروفایل مجاز نیست.' });
  }

  const previousDocument = rememberDocument(user);
  let storedDocument;
  try {
    storedDocument = workerDocuments.uploadWorkerDocument({
      buffer: uploadedIdDoc.buffer,
      ext: uploadedIdDoc.ext,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'ذخیره مدرک هویتی ممکن نشد.' });
  }

  let savedUser;
  try {
    savedUser = store.transaction(() => {
      const current = store.getUser(user.id);
      current.name = nextName;
      current.nationalId = nextNationalId;
      current.birthDate = typeof birthDate === 'string' ? birthDate.trim().slice(0, 20) : current.birthDate;
      if (nextAvatar) current.avatar = nextAvatar;
      assignDocument(current, storedDocument.documentId);
      current.address = typeof address === 'string' ? address.trim().slice(0, 300) : current.address;
      current.city = typeof city === 'string' ? city.trim().slice(0, 80) : current.city;
      current.skills = Array.isArray(skills) ? skills.slice(0, 20).map(s => String(s).slice(0, 40)) : current.skills;
      current.bankSheba = nextBankSheba;
      current.status = 'PENDING_VERIFICATION';
      current.isProfileComplete = true;
      return store.updateUser(current);
    });
  } catch (error) {
    try {
      workerDocuments.deleteWorkerDocument(storedDocument.documentId);
    } catch (cleanupError) {
      // فایل جدید بدون رکورد معتبر باقی نمی‌ماند.
    }
    return res.status(500).json({ success: false, message: 'ذخیره مدرک هویتی ممکن نشد.' });
  }
  if (previousDocument.idDoc && previousDocument.idDoc !== storedDocument.documentId) {
    try {
      workerDocuments.deleteWorkerDocument(previousDocument.idDoc);
    } catch (error) {
      // شناسه جدید ذخیره شده است و مدرک قبلی دیگر مرجع نیست.
    }
  }
  if (previousDocument.hadPath) {
    try {
      workerDocuments.discardLegacyPath(previousDocument.idDocPath);
    } catch (error) {
      // مسیر قدیمی دیگر در رکورد کارگر نیست.
    }
  }

  res.json({
    success: true,
    user: publicUser(savedUser),
    message: 'مدارک شما ثبت شد و در انتظار بررسی مدیریت قرار گرفت.'
  });
});

// پیش‌نمایش قیمت. مبلغ فقط از تعرفه همین استقرار محاسبه می‌شود.
app.post('/api/pricing/quote', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'فقط مشتری می‌تواند قیمت را ببیند.' });
  }
  if (resolvePricingMode() !== 'server') {
    return res.status(409).json({
      success: false,
      code: 'PRICING_UNAVAILABLE',
      message: 'نمایش قیمت سرور در این حالت فعال نیست.',
    });
  }
  try {
    const priced = issueOrderQuote(req.body || {}, new Date());
    return res.json({ success: true, quote: priced });
  } catch (error) {
    const mapped = mapPricingError(error);
    return res.status(mapped.status).json(mapped.body);
  }
});

// 5. سفارش جدید
app.post('/api/orders', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'فقط مشتری می‌تواند سفارش ثبت کند.' });
  }
  const {
    userId,
    serviceTitle,
    serviceId,
    address,
    date,
    time,
    price,
    notes,
    customerName,
    customerPhone,
    durationHours,
    genderPreference,
    serviceOptions,
    addressNotes,
    recurringFrequency,
    customerTier,
    pricing,
    expectedStartAt,
    clientRequestId,
  } = req.body || {};
  if (userId && userId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'ثبت سفارش برای کاربر دیگر مجاز نیست.' });
  }
  const user = authUser;
  // کلید تکرارنشدنی ثبت سفارش (D-07): اختیاری برای اپ‌های قدیمی؛ مقدار بدشکل رد می‌شود.
  let storedClientRequestId = null;
  if (clientRequestId !== undefined && clientRequestId !== null && clientRequestId !== '') {
    if (typeof clientRequestId !== 'string' || !CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)) {
      return res.status(400).json({ success: false, message: 'درخواست ثبت سفارش معتبر نیست. لطفاً دوباره تلاش کنید.' });
    }
    storedClientRequestId = clientRequestId;
  }
  const serverMode = resolvePricingMode() === 'server';
  let serverPriced = null;
  // بازیابی سفارش موجود به تعرفه جاری یا مهلت نقل‌قول وابسته نیست. سفارش جدید پایین‌تر اعتبارسنجی می‌شود.
  if (serverMode && storedClientRequestId) {
    const existing = store.findOrderByClientRequest(user.id, storedClientRequestId);
    if (existing) {
      try {
        const match = matchExistingServerOrder(req.body || {}, existing);
        if (match.conflict) {
          return res.status(409).json({
            success: false,
            code: 'ORDER_REQUEST_CONFLICT',
            message: 'این درخواست قبلاً با مبلغ دیگری ثبت شده است و مبلغ آن تغییر نمی‌کند.',
          });
        }
      } catch (error) {
        const mapped = mapPricingError(error);
        return res.status(mapped.status).json(mapped.body);
      }
      return res.json({ success: true, order: customerOrderView(existing), duplicate: true });
    }
  }
  if (serverMode) {
    try {
      serverPriced = confirmOrderQuote(req.body || {}, new Date());
    } catch (error) {
      const mapped = mapPricingError(error);
      return res.status(mapped.status).json(mapped.body);
    }
  }
  if (storedClientRequestId) {
    const existing = store.findOrderByClientRequest(user.id, storedClientRequestId);
    if (existing) {
      if (serverPriced && serverRequestConflicts(existing, serverPriced)) {
        return res.status(409).json({
          success: false,
          code: 'ORDER_REQUEST_CONFLICT',
          message: 'این درخواست قبلاً با مبلغ دیگری ثبت شده است و مبلغ آن تغییر نمی‌کند.',
        });
      }
      return res.json({ success: true, order: customerOrderView(existing), duplicate: true });
    }
  }
  const orderAddress = typeof address === 'string' ? address.trim().slice(0, 500) : '';
  if (!orderAddress) {
    return res.status(400).json({ success: false, message: 'آدرس سفارش الزامی است.' });
  }
  const parsedPrice = serverPriced ? serverPriced.price : parseOrderPrice(price);
  if (!serverPriced && parsedPrice == null) {
    return res.status(400).json({
      success: false,
      message: `مبلغ سفارش باید عدد صحیح بین ${MIN_ORDER_PRICE} و ${MAX_ORDER_PRICE} تومان باشد.`
    });
  }
  const storedDate = typeof date === 'string' ? date.trim().slice(0, 40) : '';
  const storedTime = typeof time === 'string' ? time.trim().slice(0, 40) : '';
  if (!storedDate || !storedTime) {
    return res.status(400).json({
      success: false,
      message: 'تاریخ و ساعت سفارش الزامی است.',
    });
  }
  const title =
    typeof serviceTitle === 'string' && serviceTitle.trim()
      ? serviceTitle.trim().slice(0, 120)
      : 'نظافت عادی منزل';
  const storedServiceId = typeof serviceId === 'string' ? serviceId.trim().slice(0, 80) : '';
  const requestedName = typeof customerName === 'string' ? customerName.trim().slice(0, 80) : '';
  const requestedPhone = kavenegarSms.normalizeIranMobile(customerPhone);
  const allowedGenders = ['FEMALE', 'MALE', 'NO_PREFERENCE'];
  const storedGender = allowedGenders.includes(genderPreference) ? genderPreference : null;
  const parsedDuration = typeof durationHours === 'number' ? durationHours : Number.NaN;
  const storedDuration = Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 24
    ? parsedDuration
    : null;
  const storedOptions = sanitizeServiceOptions(serviceOptions);
  const storedAddressNotes = typeof addressNotes === 'string' ? addressNotes.trim().slice(0, 300) : '';
  const frequencies = ['ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'];
  const tiers = ['NEW', 'SILVER', 'GOLD', 'VIP'];
  const storedFrequency = frequencies.includes(recurringFrequency) ? recurringFrequency : null;
  const storedTier = tiers.includes(customerTier) ? customerTier : null;
  const storedPricing = serverPriced ? serverPriced.pricing : sanitizePricing(pricing);
  // زمان مورد انتظار ساختاریافته (D-50): اختیاری برای اپ‌های قدیمی؛ مقدار نامعتبر رد می‌شود. هیچ قانون زمانی اعمال نمی‌شود.
  let storedExpectedStartAt = null;
  if (expectedStartAt !== undefined && expectedStartAt !== null && expectedStartAt !== '') {
    storedExpectedStartAt = normalizeIsoTimestamp(expectedStartAt);
    if (!storedExpectedStartAt) {
      return res.status(400).json({
        success: false,
        message: 'زمان انتخاب‌شده برای شروع کار معتبر نیست. لطفاً تاریخ و ساعت را دوباره انتخاب کنید.'
      });
    }
  }

  const newOrder = {
    id: createOrderId(),
    customerId: user.id,
    customerName: requestedName || user.name || 'کاربر مشتری',
    customerPhone: requestedPhone || user.phone,
    customerAvatar: user.avatar || '',
    serviceTitle: title,
    serviceId: storedServiceId || null,
    durationHours: storedDuration,
    genderPreference: storedGender,
    serviceOptions: storedOptions,
    addressNotes: storedAddressNotes || null,
    recurringFrequency: storedFrequency,
    customerTier: storedTier,
    pricing: storedPricing,
    address: orderAddress,
    date: storedDate,
    time: storedTime,
    price: parsedPrice,
    notes: typeof notes === 'string' ? notes.trim().slice(0, 500) : '',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'CASH',
    cleanerId: null,
    cleanerName: null,
    cleanerAvatar: null,
    cleanerPhone: null,
    expectedStartAt: storedExpectedStartAt,
    clientRequestId: storedClientRequestId,
    createdAt: new Date().toISOString()
  };

  const savedOrder = store.transaction(() => {
    // بررسی دوباره داخل تراکنش: دو درخواست هم‌زمان با یک کلید فقط یک سفارش می‌سازند.
    const repeated = store.findOrderByClientRequest(user.id, storedClientRequestId);
    if (repeated) {
      if (serverPriced && serverRequestConflicts(repeated, serverPriced)) return { requestConflict: true };
      return repeated;
    }
    const order = store.createOrder(newOrder);
    store.addNotification(
      user.id,
      order.id,
      'ORDER_CREATED',
      'سفارش ثبت شد',
      'سفارش ثبت شد و در انتظار متخصص است.'
    );
    return order;
  });

  if (savedOrder && savedOrder.requestConflict) {
    return res.status(409).json({
      success: false,
      code: 'ORDER_REQUEST_CONFLICT',
      message: 'این درخواست قبلاً با مبلغ دیگری ثبت شده است و مبلغ آن تغییر نمی‌کند.',
    });
  }
  res.json({ success: true, order: customerOrderView(savedOrder) });
});

// ------------------- نمای سفارش برای مشتری -------------------
// مشتری فقط با پشتیبانی تماس می‌گیرد؛ شماره متخصص در هیچ پاسخ مشتری فرستاده نمی‌شود (D-05).
function customerOrderView(order) {
  if (!order) return order;
  const { cleanerPhone, cancelQuote, cancelInitiator, cancelFault, ...rest } = order;
  return { ...rest, completion: store.completionFor(order), startPrompt: store.startPromptFor(order), startPromptEventId: store.startPromptEventId(order) };
}

// ------------------- نمای سفارش برای متخصص (حریم خصوصی مشتری) -------------------
// تلفن و آدرس دقیق مشتری فقط بعد از پذیرش موفق و فقط برای کار فعالِ همان متخصص فرستاده می‌شود.
const WORKER_ACTIVE_ORDER_STATUSES = ['ACCEPTED', 'IN_PROGRESS', 'CONFIRMED', 'ASSIGNED'];

/** محدوده/محله: اولین بخش آدرس (قبل از «،»). بخشی که عدد دارد یا بلند است (احتمالاً نشانی دقیق) فرستاده نمی‌شود. */
function orderAreaFromAddress(address) {
  const first = String(address || '').split(/[،,]/)[0].trim();
  if (!first || first.length > 40 || /[0-9۰-۹٠-٩]/.test(first)) return '';
  return first;
}

function workerOrderCurrencyView(order) {
  const unit = order.pricing?.currencyUnit;
  return typeof unit === 'string' && unit.trim() ? { currencyUnit: unit } : {};
}

/** سفارش باز برای فهرست «سفارش‌های جدید»: فقط اطلاعات لازم برای تصمیم پذیرش. */
function workerAvailableOrderView(order) {
  const area = orderAreaFromAddress(order.address);
  return {
    id: order.id,
    status: order.status,
    serviceId: order.serviceId ?? null,
    serviceTitle: order.serviceTitle,
    durationHours: order.durationHours ?? null,
    genderPreference: order.genderPreference ?? null,
    serviceOptions: order.serviceOptions ?? null,
    recurringFrequency: order.recurringFrequency ?? null,
    date: order.date,
    time: order.time,
    price: order.price,
    ...workerOrderCurrencyView(order),
    paymentMethod: order.paymentMethod,
    // notes (متن آزاد مشتری) قبل از پذیرش فرستاده نمی‌شود؛ ممکن است شماره یا اطلاعات خصوصی داشته باشد.
    createdAt: order.createdAt,
    area,
    address: area,
    addressNotes: null,
    customerName: typeof order.customerName === 'string' ? order.customerName : '',
    customerPhone: '',
    customerAvatar: '',
    cleanerId: null,
    cleanerName: null,
    cleanerAvatar: null,
  };
}

/** سفارش‌های خود متخصص: برای کار لغوشده/تمام‌شده تلفن و آدرس دقیق حذف می‌شود. */
/** نظر و برچسب‌های امتیاز مشتری برای متخصص فرستاده نمی‌شود (D-32)؛ فقط عدد امتیاز و زمان آن می‌ماند. */
function workerVisibleRatings(ratings) {
  if (!ratings || typeof ratings !== 'object') return ratings;
  const { customerComment, customerTags, ...visible } = ratings;
  return visible;
}

function workerAssignedOrderView(order) {
  const area = orderAreaFromAddress(order.address);
  // notes (یادداشت آزاد مشتری) در نمای کاری متخصص، حتی بعد از پذیرش، فرستاده نمی‌شود (D-05).
  // سطح و ریز قیمت مشتری، شناسه مشتری و شناسه لغوکننده به متخصص فرستاده نمی‌شود (D-05، D-41، D-06).
  const { notes, ratings, customerId, customerTier, pricing, cancelledBy, cancelQuote, cancelInitiator, cancelFault, ...rest } = order;
  const workerVisible = { ...rest, ...workerOrderCurrencyView(order), completion: store.completionFor(order), completionAcceptanceKey: store.completionAcceptanceKey(order) };
  if (ratings !== undefined) workerVisible.ratings = workerVisibleRatings(ratings);
  if (WORKER_ACTIVE_ORDER_STATUSES.includes(order.status)) {
    return { ...workerVisible, area, startReported: store.workerStartReported(order), startAcceptanceKey: store.startAcceptanceKey(order) };
  }
  return {
    ...workerVisible,
    area,
    address: area,
    addressNotes: null,
    customerPhone: '',
    customerAvatar: '',
  };
}

// برچسب فارسی وضعیت برای متن اعلان تغییر وضعیت (D-06)؛ همان برچسب‌های صفحه اعلان‌های اپ.
const ORDER_STATUS_LABELS = {
  PENDING: 'در انتظار متخصص',
  ACCEPTED: 'پذیرفته‌شده',
  CONFIRMED: 'تأیید شده',
  ASSIGNED: 'تخصیص متخصص',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'انجام شده',
  CANCELLED: 'لغو شده',
  CANCEL_REQUESTED: 'درخواست لغو در حال بررسی',
};

function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || 'وضعیت جدید';
}

/** متخصص برای سپردن سفارش: باید وجود داشته باشد، متخصص باشد و تأییدشده و فعال باشد. */
function adminWorkerProblem(worker) {
  if (!worker || worker.role !== 'WORKER') return 'bad-cleaner';
  if (worker.status !== 'APPROVED' && worker.status !== 'ACTIVE') return 'unapproved';
  return null;
}

function acceptConflictMessage(order, cleanerId) {
  const status = order && order.status;
  if (status === 'CANCELLED') return 'این سفارش توسط مشتری لغو شده است.';
  if (WORKER_ACTIVE_ORDER_STATUSES.includes(status)) {
    return order.cleanerId && order.cleanerId === cleanerId
      ? 'این سفارش قبلاً توسط شما پذیرفته شده است.'
      : 'این سفارش قبلاً توسط متخصص دیگری پذیرفته شده است.';
  }
  if (status === 'COMPLETED') return 'این سفارش انجام شده است و دیگر قابل پذیرش نیست.';
  return 'این سفارش در حال حاضر قابل پذیرش نیست.';
}

// 6. سفارش‌های آماده (متخصصین تایید شده)
app.get('/api/orders', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  store.finalizeDueCancelRequests();
  if (authUser.role === 'CUSTOMER') {
    return res.json({ success: true, orders: store.getOrders({ customerId: authUser.id }).map(customerOrderView) });
  }
  if (authUser.role === 'WORKER') {
    return res.json({ success: true, orders: store.getOrders({ cleanerId: authUser.id }).map(workerAssignedOrderView) });
  }
  return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.', orders: [] });
});

app.get('/api/orders/available', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'WORKER') {
    return res.status(403).json({ success: false, message: 'فقط متخصص به سفارش‌های باز دسترسی دارد.', orders: [] });
  }
  if (authUser.status !== 'APPROVED' && authUser.status !== 'ACTIVE') {
    return res.status(403).json({ success: false, message: 'حساب متخصص شما هنوز تایید نشده است.', orders: [] });
  }
  store.finalizeDueCancelRequests();
  const availableOrders = store.getOrders({ status: 'PENDING' }).map(workerAvailableOrderView);
  res.json({ success: true, orders: availableOrders });
});

// 7. پذیرش سفارش
app.put('/api/orders/:orderId/accept', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  const { orderId } = req.params;
  const cleanerId = req.body && req.body.cleanerId;
  if (cleanerId && cleanerId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'پذیرش سفارش با شناسه متخصص دیگر مجاز نیست.' });
  }
  if (authUser.role !== 'WORKER') {
    return res.status(403).json({ success: false, message: 'فقط متخصص می‌تواند سفارش را بپذیرد.' });
  }

  const cleaner = authUser;

  if (!cleaner || (cleaner.status !== 'APPROVED' && cleaner.status !== 'ACTIVE')) {
    return res.status(403).json({ success: false, message: 'حساب متخصص شما هنوز تایید نشده است.' });
  }

  const accepted = store.tryAcceptOrder(orderId, cleaner);
  if (accepted.code === 'wallet-debt') return res.status(409).json({success:false,code:'WORKER_WALLET_DEBT',message:'کیف پول شما بدهکار است؛ پیش از پذیرش سفارش تازه، بدهی کمیسیون را تسویه کنید.'});
  if (accepted.code === 'missing') return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
  if (accepted.code === 'conflict') {
    return res.status(400).json({ success: false, message: acceptConflictMessage(accepted.order, cleaner.id) });
  }
  res.json({ success: true, order: workerAssignedOrderView(accepted.order) });
});

// ثبت شروع کار: رویدادی مستقل از وضعیت اصلی سفارش و مستقل از سیاست مالی.
const START_ERROR_RESPONSES = {
  missing: [404, 'سفارش یافت نشد.'],
  forbidden: [403, 'این کار فقط برای طرف همین سفارش مجاز است.'],
  'bad-status': [400, 'این سفارش در وضعیت مجاز شروع کار نیست.'],
  invalid: [400, 'پاسخ نامعتبر است.'],
  'already-answered': [409, 'پاسخ قبلاً ثبت شده و تغییر آن نیازمند پشتیبانی است.'],
  'no-question': [409, 'در حال حاضر سؤالی درباره شروع کار ثبت نشده است.'],
  'stale-acceptance': [409, 'پذیرش این سفارش تغییر کرده است. اطلاعات تازه را بررسی کنید.'],
  'stale-decision': [409, 'زمینه تصمیم مدیریتی تغییر کرده است. سوابق تازه را بررسی کنید.'],
  'key-conflict': [409, 'شناسه درخواست قبلاً با محتوای دیگری استفاده شده است.'],
  'stale-prompt': [409, 'گزارش شروع کار تغییر کرده است. اطلاعات تازه را بررسی کنید.'],
  resolved: [409, 'موضوع شروع کار توسط پشتیبانی بررسی شده است.'],
};
function sendStartError(res, code) {
  const [status, message] = START_ERROR_RESPONSES[code] || [400, 'درخواست انجام نشد.'];
  return res.status(status).json({ success: false, message });
}

app.put('/api/orders/:orderId/start', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== 'WORKER') return sendStartError(res, 'forbidden');
  if (user.status !== 'APPROVED' && user.status !== 'ACTIVE') return sendStartError(res, 'forbidden');
  const result = store.reportStart(req.params.orderId, user, req.body && req.body.acceptanceKey);
  if (result.code !== 'ok' && result.code !== 'duplicate') return sendStartError(res, result.code);
  return res.json({ success: true, order: workerAssignedOrderView(result.order) });
});

app.put('/api/orders/:orderId/start-response', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== 'CUSTOMER') return sendStartError(res, 'forbidden');
  const result = store.respondStart(req.params.orderId, user.id, req.body && req.body.answer, req.body && req.body.promptEventId);
  if (result.code === 'stale-prompt') {
    // Only the authenticated owner reaches this result; never expose another customer's order.
    const current = store.getOrder(req.params.orderId);
    return res.status(409).json({
      success: false, code: result.code, message: START_ERROR_RESPONSES[result.code][1],
      ...(current && current.customerId === user.id ? { order: customerOrderView(current) } : {}),
    });
  }
  if (result.code !== 'ok' && result.code !== 'duplicate') return sendStartError(res, result.code);
  return res.json({ success: true, order: customerOrderView(result.order) });
});

const CUSTOMER_CANCELLABLE_STATUSES = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];

app.put('/api/orders/:orderId/cancel', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'فقط مشتری صاحب سفارش می‌تواند آن را لغو کند.' });
  }
  const { orderId } = req.params;
  const { userId, reason } = req.body || {};
  if (userId && userId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'لغو سفارش کاربر دیگر مجاز نیست.' });
  }
  const trimmedUserId = authUser.id;
  const cancelReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'لغو توسط کاربر';
  store.finalizeDueCancelRequests();
  const cancelled = store.tryCancelOrder(orderId, trimmedUserId, CUSTOMER_CANCELLABLE_STATUSES, cancelReason, {
    confirmQuote: req.body && req.body.confirmQuote,
  });
  if (cancelled.code === 'missing') return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });
  if (cancelled.code === 'forbidden') {
    return res.status(403).json({ success: false, message: 'فقط صاحب سفارش می‌تواند آن را لغو کند.' });
  }
  if (cancelled.code === 'bad-status') {
    return res.status(400).json({ success: false, message: 'این سفارش در وضعیتی نیست که قابل لغو باشد.' });
  }
  if (cancelled.code === 'needs-confirmation') {
    return res.status(409).json({
      success: false,
      needsConfirmation: true,
      message: cancelled.message,
      quote: cancelled.quote,
    });
  }
  res.json({ success: true, order: customerOrderView(cancelled.order) });
});

app.put('/api/orders/:orderId/rate', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'فقط مشتری صاحب سفارش می‌تواند امتیاز بدهد.' });
  }
  const rating = Number(req.body && req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'امتیاز باید عدد صحیح بین ۱ تا ۵ باشد.' });
  }
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 400) : '';
  const tags = Array.isArray(req.body?.tags)
    ? req.body.tags.slice(0, 8).map(t => String(t).slice(0, 40))
    : [];
  const existing = store.getOrder(req.params.orderId);
  const rated = store.createRating(req.params.orderId, authUser.id, {
    customerRating: rating,
    customerComment: comment,
    customerTags: tags,
    cleanerId: existing && existing.cleanerId,
    ratedAt: new Date().toISOString()
  });
  if (rated.code === 'missing') return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });
  if (rated.code === 'forbidden') {
    return res.status(403).json({ success: false, message: 'امتیازدهی به سفارش دیگران مجاز نیست.' });
  }
  if (rated.code === 'bad-status') {
    return res.status(400).json({ success: false, message: 'فقط سفارش تکمیل‌شده قابل امتیازدهی است.' });
  }
  if (rated.code === 'no-cleaner') {
    return res.status(400).json({ success: false, message: 'برای این سفارش متخصص ثبت نشده است.' });
  }
  if (rated.code === 'duplicate') {
    return res.status(400).json({ success: false, message: 'برای این سفارش قبلاً امتیاز ثبت شده است.' });
  }
  res.json({ success: true, order: customerOrderView(rated.order) });
});

// ------------------- API اختصاصی پنل مدیریت (ADMIN API) -------------------
const adminSessions = new Map();

function requireAdmin(req, res, next) {
  const token = bearerToken(req);
  const session = token ? adminSessions.get(token) : null;
  if (!session || session.expires < Date.now()) {
    if (token && adminSessions.has(token)) adminSessions.delete(token);
    return res.status(401).json({ success: false, message: 'دسترسی مدیر لازم است.' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      success: false,
      message: 'ورود مدیر پیکربندی نشده است. متغیر PAKSHO_ADMIN_PASSWORD را تنظیم کنید.'
    });
  }
  const key = clientKey(req);
  const rate = checkAdminLoginRate(key);
  if (!rate.ok) {
    return res.status(429).json({
      success: false,
      message: `تلاش بیش از حد. ${rate.waitSec} ثانیه صبر کنید.`
    });
  }
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!password || password !== ADMIN_PASSWORD) {
    recordAdminLoginFailure(key, rate.entry);
    return res.status(401).json({ success: false, message: 'رمز مدیر نادرست است.' });
  }
  adminLoginAttempts.delete(key);
  const token = crypto.randomBytes(24).toString('hex');
  adminSessions.set(token, { expires: Date.now() + ADMIN_SESSION_MS });
  res.json({ success: true, token });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = bearerToken(req);
  if (token) adminSessions.delete(token);
  res.json({ success: true });
});

app.get('/api/support/messages', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  res.json({ success: true, messages: store.listSupportMessages(authUser.id) });
});

app.post('/api/support/messages', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim().slice(0, 120) : '';
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 2000) : '';
  if (!subject || !body) {
    return res.status(400).json({ success: false, message: 'موضوع و متن پیام الزامی است.' });
  }
  const message = store.addSupportMessage(authUser.id, authUser.role, subject, body);
  res.status(201).json({ success: true, message });
});

app.get('/api/notifications', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  const notifications = store.listNotifications(authUser.id);
  res.json({
    success: true,
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
  });
});

app.post('/api/notifications/:id/read', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (!store.markNotificationRead(req.params.id, authUser.id)) {
    return res.status(404).json({ success: false, message: 'اعلان یافت نشد.' });
  }
  res.json({ success: true });
});

app.get('/api/wallet', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'کیف پول فقط برای مشتری است.' });
  }
  const wallet = store.walletFor(authUser.id);
  res.json({
    success: true,
    balance: wallet.balance,
    transactions: wallet.transactions,
    topUpAvailable: false,
    message: 'شارژ کیف پول به درگاه پرداخت وصل نیست.',
  });
});

app.post('/api/wallet/topup', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  res.status(501).json({
    success: false,
    message: 'درگاه پرداخت وصل نیست. موجودی کیف پول تغییر نکرد.',
  });
});

app.get('/api/loyalty', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'باشگاه مشتریان فقط برای مشتری است.' });
  }
  res.json({ success: true, loyalty: store.loyaltyFor(authUser.id) });
});

registerCompletionRoutes(app, {store,requireUser,requireAdmin,customerView:customerOrderView,workerView:workerAssignedOrderView});
registerCommissionRoutes(app, { policy: store.commissionPolicy, requireUser, requireAdmin });
registerWorkerWalletRoutes(app, {store,requireUser});
registerPaymentSettingsRoutes(app, { settings: store.paymentSettings, requireAdmin });

app.use('/api/admin', requireAdmin);

app.get('/api/admin/tariff-versions', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = readAdminTariff();
  if (!result.ok) return res.status(409).json({ success: false, code: result.code });
  const { revision, companyId, currencyUnit, versions } = result;
  return res.json({ success: true, revision, companyId, currencyUnit, versions });
});

function sendTariffPublication(res, result) {
  if (result.ok) {
    return res.json({
      success: true,
      revision: result.revision,
      versionId: result.versionId,
      idempotent: result.idempotent === true,
    });
  }
  const status = result.code === 'INPUT_INVALID' ? 400 : 409;
  return res.status(status).json({ success: false, code: result.code });
}

app.post('/api/admin/tariff-versions', (req, res) => {
  const body = req.body || {};
  return sendTariffPublication(res, registerDraft({
    baseRevision: body.baseRevision,
    requestId: body.requestId,
    version: body.version,
    actor: 'admin',
    now: new Date(),
  }));
});

app.post('/api/admin/tariff-versions/:id/publish', (req, res) => {
  const body = req.body || {};
  return sendTariffPublication(res, publishVersion({
    versionId: req.params.id,
    baseRevision: body.baseRevision,
    requestId: body.requestId,
    validFrom: body.validFrom,
    validTo: body.validTo == null ? null : body.validTo,
    supersede: body.supersede == null ? null : body.supersede,
    actor: 'admin',
    now: new Date(),
  }));
});

// Read-only audit and command context, restricted to the existing authenticated admin role.
app.get('/api/admin/orders/:orderId/start-events', (req, res) => {
  const order = store.getOrder(req.params.orderId);
  if (!order) return sendStartError(res, 'missing');
  return res.json({ success: true, orderId: order.id, startDecisionContext: store.startDecisionContext(order),
    events: store.listOrderEvents(order.id) });
});

// تصمیم مدیر تنها بعد از میان‌افزار احراز هویت مدیریتی در دسترس است.
app.put('/api/admin/orders/:orderId/start-decision', (req, res) => {
  const result = store.adminStartDecision(req.params.orderId, req.body && req.body.started, {
    requestId: req.body && req.body.requestId,
    acceptanceKey: req.body && req.body.acceptanceKey,
    expectedDecisionEventId: req.body && req.body.expectedDecisionEventId,
  });
  if (result.code === 'stale-decision') {
    return res.status(409).json({ success: false, code: result.code, message: START_ERROR_RESPONSES[result.code][1],
      startDecisionContext: store.startDecisionContext(store.getOrder(req.params.orderId)) });
  }
  if (result.code !== 'ok' && result.code !== 'duplicate') return sendStartError(res, result.code);
  return res.json({ success: true, duplicate: result.code === 'duplicate', order: result.order,
    startDecisionContext: store.startDecisionContext(result.order) });
});

app.get('/api/admin/support/messages', (req, res) => {
  res.json({ success: true, messages: store.listAllSupportMessages() });
});

app.get('/api/admin/stats', (req, res) => {
  const users = store.listUsers();
  const orders = store.listOrders();
  const customers = users.filter(u => u.role === 'CUSTOMER');
  const workers = users.filter(u => u.role === 'WORKER');
  const pendingWorkers = workers.filter(u => u.status === 'PENDING_VERIFICATION');
  const completedOrders = orders.filter(o => o.status === 'COMPLETED');
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.price || 0), 0);

  res.json({
    success: true,
    stats: {
      totalCustomers: customers.length,
      totalWorkers: workers.length,
      pendingWorkersCount: pendingWorkers.length,
      totalOrders: orders.length,
      pendingOrdersCount: orders.filter(o => o.status === 'PENDING').length,
      acceptedOrdersCount: orders.filter(o => o.status === 'ACCEPTED').length,
      completedOrdersCount: completedOrders.length,
      totalRevenue
    }
  });
});

app.get('/api/admin/users', (req, res) => {
  const { role } = req.query;
  const result = store.listUsers(typeof role === 'string' && role ? role : undefined);
  res.json({ success: true, users: result.map(adminUserView) });
});

app.put('/api/admin/users/:userId/status', (req, res) => {
  const { userId } = req.params;
  const status = req.body && req.body.status;
  if (!ADMIN_USER_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'وضعیت کاربر معتبر نیست.',
      allowed: ADMIN_USER_STATUSES
    });
  }

  const existing = store.getUser(userId);
  if (!existing) return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });
  existing.status = status;
  const user = store.updateUser(existing);

  res.json({ success: true, user: adminUserView(user), message: `وضعیت کاربر به «${USER_STATUS_LABELS[status] || 'جدید'}» تغییر یافت.` });
});

app.get('/api/admin/workers/:userId/document', (req, res) => {
  const user = store.getUser(req.params.userId);
  if (!user || user.role !== 'WORKER') {
    return res.status(404).json({ success: false, message: 'متخصص یافت نشد.' });
  }
  const document = workerDocuments.getWorkerDocument(user.idDoc);
  if (!document) {
    return res.status(404).json({ success: false, message: 'مدرک هویتی یافت نشد.' });
  }
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(document.mimeType);
  res.send(document.data);
});

app.delete('/api/admin/workers/:userId/document', (req, res) => {
  const user = store.getUser(req.params.userId);
  if (!user || user.role !== 'WORKER') {
    return res.status(404).json({ success: false, message: 'متخصص یافت نشد.' });
  }
  const previous = rememberDocument(user);
  if (!previous.idDoc) {
    return res.status(404).json({ success: false, message: 'مدرک هویتی برای این متخصص ثبت نشده است.' });
  }
  const existing = workerDocuments.getWorkerDocument(previous.idDoc);
  try {
    store.transaction(() => {
      const current = store.getUser(user.id);
      current.idDoc = '';
      return store.updateUser(current);
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'حذف مدرک هویتی ممکن نشد.' });
  }
  if (!existing) {
    return res.status(404).json({ success: false, message: 'مدرک هویتی یافت نشد.' });
  }
  try {
    workerDocuments.deleteWorkerDocument(previous.idDoc);
  } catch (error) {
    try {
      store.transaction(() => {
        const current = store.getUser(user.id);
        current.idDoc = previous.idDoc;
        store.updateUser(current);
      });
    } catch (restoreError) {
      // شناسه مدرک اگر برنگردد، فایل خصوصی همچنان بدون URL عمومی است.
    }
    return res.status(500).json({ success: false, message: 'حذف مدرک هویتی ممکن نشد.' });
  }
  res.json({ success: true, message: 'مدرک هویتی حذف شد.' });
});

app.put('/api/admin/approve-worker/:userId', (req, res) => {
  const { userId } = req.params;
  const existing = store.getUser(userId);
  if (!existing) return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });
  if (existing.role !== 'WORKER') {
    return res.status(400).json({ success: false, message: 'این کاربر متخصص نیست.' });
  }
  if (existing.status !== 'PENDING_VERIFICATION') {
    return res.status(400).json({
      success: false,
      message: 'فقط متخصص با وضعیت «در انتظار بررسی مدارک» قابل تایید است.',
      status: existing.status
    });
  }

  existing.status = 'APPROVED';
  const user = store.updateUser(existing);

  res.json({ success: true, user: adminUserView(user), message: 'متخصص با موفقیت تایید شد.' });
});

app.get('/api/admin/orders', (req, res) => {
  store.finalizeDueCancelRequests();
  res.json({ success: true, orders: store.listOrders().map(order => ({...order,completion:store.completionFor(order)})) });
});

// قوانین امتیاز فقط از مسیر مدیر و فقط با نسخه جدید ثبت می‌شوند (D-04). ویرایش و حذف وجود ندارد.
app.get('/api/admin/point-rules', (req, res) => {
  res.json({
    success: true,
    rules: store.listPointRules(),
    effectiveWorkerTier: store.effectiveTierRule('tiers.worker'),
    effectiveEarn: store.effectiveEarnRule(),
  });
});

app.post('/api/admin/point-rules', (req, res) => {
  const body = req.body || {};
  const published = store.publishRule({
    ruleKey: body.ruleKey,
    value: body.value,
    active: body.active,
    actor: 'admin',
  });
  if (published.code !== 'ok') {
    return res.status(400).json({ success: false, message: 'قانون امتیاز معتبر نیست.' });
  }
  res.json({ success: true, rule: published.rule });
});

app.put('/api/admin/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const { status, cleanerId, cancelFault } = req.body || {};
  if (status === 'COMPLETED') return res.status(409).json({success:false,code:'COMPLETION_DECISION_REQUIRED',message:'اتمام سفارش فقط از مسیر تأیید پایان کار انجام می‌شود.'});
  const closed = store.getOrder(orderId);
  if (closed?.status === 'COMPLETED') return res.status(409).json({success:false,message:'سفارش تمام‌شده قابل بازگشایی نیست.'});
  store.finalizeDueCancelRequests();

  const updated = store.transaction(() => {
    const order = store.getOrder(orderId);
    if (!order) return { code: 'missing' };
    if (order.status === 'CANCEL_REQUESTED') {
      if (cleanerId && cleanerId !== order.cleanerId) return { code: 'worker-change-on-close' };
      if (status && status !== 'CANCELLED') return { code: 'cancel-request-locked' };
      if (cancelFault != null) {
        const faulted = store.setCancelFault(order.id, cancelFault, 'CANCEL_REQUESTED');
        if (faulted.code === 'invalid') return { code: 'bad-fault' };
        if (faulted.code !== 'ok') return faulted;
      }
      if (status === 'CANCELLED') return store.finalizeCancelRequest(order.id, { actor: 'admin' });
      return { code: 'ok', order: store.getOrder(order.id) };
    }
    if (order.status === 'CANCELLED' && cancelFault != null && (!status || status === 'CANCELLED') && !cleanerId) {
      return store.relaxCancelFault(order.id, cancelFault);
    }
    const previousStatus = order.status;
    // سفارش PENDING متخصص ندارد؛ اطلاعات متخصص باقی‌مانده روی یک ردیف PENDING قدیمی نادیده گرفته می‌شود
    // تا هیچ تغییر وضعیتی سفارش را بی‌صدا با آن متخصص فعال یا بسته نکند.
    if (previousStatus === 'PENDING') {
      order.cleanerId = null;
      order.cleanerName = null;
      order.cleanerAvatar = null;
      order.cleanerPhone = null;
    }
    const previousCleanerId = order.cleanerId;
    if (cleanerId) {
      const cleaner = store.getUser(cleanerId);
      const cleanerProblem = adminWorkerProblem(cleaner);
      if (cleanerProblem) return { code: cleanerProblem };
      order.cleanerId = cleanerId;
      order.cleanerName = cleaner.name;
      order.cleanerAvatar = cleaner.avatar;
      order.cleanerPhone = cleaner.phone || '';
      if (!status || status === 'ACCEPTED') order.status = 'ACCEPTED';
    }
    if (status) {
      if (!ADMIN_ORDER_STATUSES.includes(status)) return { code: 'bad-status' };
      order.status = status;
      if (status === 'COMPLETED' && !order.completedAt) {
        order.completedAt = new Date().toISOString();
      }
      // لغو توسط مدیر هم زمان و انجام‌دهنده لغو را ثبت می‌کند.
      if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
        order.cancelledAt = new Date().toISOString();
        order.cancelledBy = 'admin';
      }
    }
    // سفارشی که هنوز پذیرفته نشده مستقیم تکمیل‌شده ثبت نمی‌شود (D-50).
    if (previousStatus === 'PENDING' && order.status === 'COMPLETED') return { code: 'not-accepted' };
    // ورود از وضعیت غیرفعال به وضعیت فعال، یا اختصاص متخصص دیگر به سفارش فعال، پذیرش است و
    // فقط از تابع واحد recordAcceptance (D-50) می‌گذرد. پذیرش بدون متخصص مجاز نیست.
    // جابه‌جایی بین وضعیت‌های فعال با همان متخصص پذیرش جدید نیست.
    const wasActive = WORKER_ACTIVE_ORDER_STATUSES.includes(previousStatus);
    const isActive = WORKER_ACTIVE_ORDER_STATUSES.includes(order.status);
    const workerChanged = Boolean(cleanerId) && cleanerId !== previousCleanerId;
    // تکمیل یا لغو پذیرش نیست؛ پس تعویض متخصص در همان درخواست مجاز نیست تا متخصصی بدون پذیرش ثبت نشود.
    // مدیر اول متخصص جدید را با پذیرش معتبر اختصاص می‌دهد و بعد سفارش را تکمیل یا لغو می‌کند.
    if (workerChanged && (order.status === 'COMPLETED' || order.status === 'CANCELLED')) {
      return { code: 'worker-change-on-close' };
    }
    // ثبت سفارش لغوشده به‌عنوان انجام‌شده تا تصمیم نهایی (بخش ۱۰ سند) مجاز نیست.
    if (previousStatus === 'CANCELLED' && order.status === 'COMPLETED') return { code: 'cancelled-to-completed' };
    const isAcceptance = isActive && (!wasActive || workerChanged);
    // سفارش PENDING متخصص ندارد: هر ذخیره در PENDING پذیرش و متخصص را در همین تراکنش پاک می‌کند
    // (تاریخچه در order_events می‌ماند).
    const savesAsPending = order.status === 'PENDING';
    if (isAcceptance && !order.cleanerId) return { code: 'needs-worker' };
    // متخصص فعلی سفارش، نه فقط متخصص فرستاده‌شده، داخل همین تراکنش دوباره بررسی می‌شود تا
    // سفارش با متخصص حذف‌شده، تأییدنشده یا مسدود فعال نشود.
    if (isAcceptance) {
      const workerProblem = adminWorkerProblem(store.getUser(order.cleanerId));
      if (workerProblem) return { code: workerProblem };
      if (!store.workerWallet.read(order.cleanerId).canAcceptNewOrders) return { code: 'wallet-debt' };
    }
    if (savesAsPending) {
      // سفارش PENDING متخصص ندارد: فیلدهای متخصص و acceptedAt از شیء حافظه هم پاک می‌شوند
      // تا دیتابیس و حافظه همگام باشند و مقادیر cleanerId جدید ناخواسته ذخیره نشوند.
      order.cleanerId = null;
      order.cleanerName = null;
      order.cleanerAvatar = null;
      order.cleanerPhone = null;
      order.acceptedAt = null;
    }
    let saved = store.updateOrder(order);
    if (isAcceptance) {
      store.recordAcceptance(saved.id, { actorRole: 'admin', actorId: null });
      saved = store.getOrder(saved.id);
    }
    if (savesAsPending) {
      saved = store.clearAcceptanceForReturnToPending(
        saved.id,
        previousStatus === 'PENDING'
          ? undefined
          : { actorRole: 'admin', actorId: null, previousWorkerId: previousCleanerId || null }
      );
    }
    if (previousStatus !== 'COMPLETED' && saved.status === 'COMPLETED') {
      store.onOrderEvent({ name: 'completed', order: saved });
    }
    if (previousStatus !== 'CANCELLED' && saved.status === 'CANCELLED') {
      store.recordImmediateAdminCancel(saved.id);
      saved = store.getOrder(saved.id);
    }

    const isWorkerReassigned =
      Boolean(previousCleanerId) &&
      Boolean(cleanerId) &&
      cleanerId !== previousCleanerId &&
      saved.cleanerId === cleanerId &&
      WORKER_ACTIVE_ORDER_STATUSES.includes(saved.status);

    if (isWorkerReassigned) {
      store.addNotification(
        previousCleanerId,
        saved.id,
        'ORDER_REASSIGNED',
        'تغییر متخصص سفارش',
        'این سفارش توسط پشتیبانی به متخصص دیگری واگذار شد.'
      );
      store.addNotification(
        saved.cleanerId,
        saved.id,
        'ORDER_ASSIGNED',
        'واگذاری سفارش جدید',
        'این سفارش توسط پشتیبانی به شما واگذار شد.'
      );
    }

    // متخصصی که با برگشت به PENDING کنار گذاشته شده، اعلان تغییر وضعیت را می‌گیرد (فقط اگر قبلاً متخصصی منتسب بوده باشد).
    const notifiedWorkerId = savesAsPending ? previousCleanerId : saved.cleanerId;
    if (saved.status !== previousStatus) {
      const statusText = 'وضعیت سفارش به «' + orderStatusLabel(saved.status) + '» تغییر کرد.';
      store.addNotification(
        saved.customerId,
        saved.id,
        'ORDER_STATUS',
        'وضعیت سفارش تغییر کرد',
        statusText
      );
      if (notifiedWorkerId && !isWorkerReassigned) {
        store.addNotification(
          notifiedWorkerId,
          saved.id,
          'ORDER_STATUS',
          'وضعیت سفارش تغییر کرد',
          statusText
        );
      }
    }
    return { code: 'ok', order: saved };
  });

  if (updated.code === 'wallet-debt') return res.status(409).json({success:false,code:'WORKER_WALLET_DEBT',message:'متخصص بدهی کمیسیون دارد و تا تسویه نمی‌تواند سفارش تازه بپذیرد.'});
  if (updated.code === 'missing') return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });
  if (updated.code === 'bad-cleaner') {
    return res.status(400).json({ success: false, message: 'متخصص معتبر یافت نشد.' });
  }
  if (updated.code === 'unapproved') {
    return res.status(400).json({ success: false, message: 'متخصص هنوز تایید نشده است.' });
  }
  if (updated.code === 'not-accepted') {
    return res.status(400).json({
      success: false,
      message: 'این سفارش هنوز توسط متخصصی پذیرفته نشده است و نمی‌توان آن را تکمیل‌شده ثبت کرد.'
    });
  }
  if (updated.code === 'cancelled-to-completed') {
    return res.status(400).json({
      success: false,
      message: 'سفارش لغوشده را نمی‌توان انجام‌شده ثبت کرد.'
    });
  }
  if (updated.code === 'worker-change-on-close') {
    return res.status(400).json({
      success: false,
      message: 'تغییر متخصص همراه با تکمیل یا لغو سفارش ممکن نیست. اول متخصص جدید را به سفارش اختصاص دهید، بعد وضعیت را تغییر دهید.'
    });
  }
  if (updated.code === 'needs-worker') {
    return res.status(400).json({
      success: false,
      message: 'برای فعال کردن این سفارش، اول یک متخصص تأییدشده به آن اختصاص دهید.'
    });
  }
  if (updated.code === 'bad-status') {
    return res.status(400).json({
      success: false,
      message: 'وضعیت سفارش معتبر نیست.',
      allowed: ADMIN_ORDER_STATUSES
    });
  }
  if (updated.code === 'cancel-request-locked') {
    return res.status(400).json({
      success: false,
      message: 'درخواست لغو مشتری رد نمی‌شود. فقط تأیید آن ممکن است.'
    });
  }
  if (updated.code === 'bad-fault') {
    return res.status(400).json({ success: false, message: 'مسئول لغو معتبر نیست.' });
  }
  if (updated.code === 'fault-increase-unsupported') {
    return res.status(400).json({
      success: false,
      message: 'افزایش جریمه بعد از لغو نهایی در این نسخه انجام نمی‌شود.'
    });
  }
  res.json({ success: true, order: updated.order });
});

app.delete('/api/admin/orders/:orderId', (_req, res) => {
  res.status(405).json({
    success: false,
    message: 'حذف سفارش ممکن نیست. برای بستن سفارش، وضعیت آن را لغو کنید.',
  });
});

// ------------------- مسیر وب داشبورد ادمین (ADMIN WEB DASHBOARD) -------------------
app.get('/admin/tariff.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'adminTariff.js'));
});

app.get('/admin/tiers.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'adminTiers.js'));
});

app.get('/admin/completion.js', (req,res) => res.type('application/javascript').sendFile(path.join(__dirname,'adminCompletion.js')));
app.get('/admin/commission.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'adminCommission.js'));
});
app.get('/admin/payment.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'adminPayment.js'));
});

app.get('/admin/points.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'adminPoints.js'));
});

app.get('/admin', (req, res) => {
  const identityJson = sourceIdentityScriptJson(SOURCE_IDENTITY);
  res.send(`
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>داشبورد مدیریت پاکشو (Paksho Admin)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
  <style>
    body { font-family: Vazirmatn, sans-serif; background-color: #0f172a; color: #f8fafc; }
  </style>
</head>
<body class="min-h-screen p-4 md:p-8">
  <div class="max-w-6xl mx-auto space-y-6">
    
    <!-- هدر -->
    <header class="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex justify-between items-center shadow-lg">
      <div>
        <h1 class="text-2xl font-black text-sky-400">داشبورد مدیریت پاکشو (Admin Panel)</h1>
        <p class="text-xs text-slate-400 mt-1">مدیریت سفارش‌ها، تایید مدارک متخصصین و آمار کل سامانه</p>
      </div>
      <button onclick="logoutAdmin()" class="bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow">خروج مدیر</button>
      <button onclick="loadAllData()" class="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow">
        🔄 بروزرسانی اطلاعات
      </button>
    </header>

    <!-- کارت‌های آمار -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="statsGrid">
      <div class="bg-slate-800 border border-slate-700 p-4 rounded-xl text-center">
        <span class="text-xs text-slate-400">کل سفارش‌ها</span>
        <h2 id="totalOrders" class="text-2xl font-black text-sky-400 mt-1">-</h2>
      </div>
      <div class="bg-slate-800 border border-slate-700 p-4 rounded-xl text-center">
        <span class="text-xs text-slate-400">در انتظار بررسی مدارک</span>
        <h2 id="pendingWorkers" class="text-2xl font-black text-amber-400 mt-1">-</h2>
      </div>
      <div class="bg-slate-800 border border-slate-700 p-4 rounded-xl text-center">
        <span class="text-xs text-slate-400">تعداد متخصصین</span>
        <h2 id="totalWorkers" class="text-2xl font-black text-emerald-400 mt-1">-</h2>
      </div>
      <div class="bg-slate-800 border border-slate-700 p-4 rounded-xl text-center">
        <span class="text-xs text-slate-400">درآمد کل (تومان)</span>
        <h2 id="totalRevenue" class="text-xl font-black text-purple-400 mt-1">-</h2>
      </div>
    </div>

    <!-- تب‌ها -->
    <div class="flex border-b border-slate-700 gap-4 text-sm font-bold">
      <button id="tabWorkersBtn" onclick="switchTab('workers')" class="pb-3 border-b-2 border-sky-400 text-sky-400">
        👨‍🔧 مدیریت متخصصین و تایید مدارک
      </button>
      <button id="tabOrdersBtn" onclick="switchTab('orders')" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-white">
        📦 مدیریت سفارش‌ها
      </button>
      <button id="tabTariffsBtn" onclick="switchTab('tariffs')" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-white">
        تعرفه خدمات
      </button>
      <button id="tabTiersBtn" onclick="switchTab('tiers'); loadAdminTiers()" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-white">
        قانون درجه‌ها
      </button>
      <button id="tabCompletionBtn" onclick="switchTab('completion'); loadAdminCompletion()" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-white">سیاست پایان کار</button>
      <button id="tabCommissionBtn" onclick="switchTab('commission'); loadAdminCommission()" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-white">کمیسیون شرکت</button>
      <button id="tabPaymentBtn" onclick="switchTab('payment'); loadAdminPayment()" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-white">تنظیمات پرداخت</button>
      <button id="tabPointsBtn" onclick="switchTab('points'); loadAdminPoints()" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-white">
        قانون امتیاز
      </button>
    </div>

    <!-- محتوای متخصصین -->
    <div id="tabWorkers" class="space-y-4">
      <h3 class="text-lg font-bold text-white">لیست متخصصین و درخواست‌های احراز هویت</h3>
      <div id="workersList" class="space-y-3">
        <p class="text-xs text-slate-400">در حال بارگذاری...</p>
      </div>
    </div>

    <!-- محتوای سفارش‌ها -->
    <div id="tabOrders" class="space-y-4 hidden">
      <h3 class="text-lg font-bold text-white">لیست تمامی سفارش‌ها</h3>
      <div id="ordersList" class="space-y-3">
        <p class="text-xs text-slate-400">در حال بارگذاری...</p>
      </div>
    </div>

    <section id="tabTariffs" class="space-y-4 hidden" hidden>
      <h3 class="text-lg font-bold">تعرفه خدمات</h3>
      <p class="text-sm text-slate-300">نرخ‌های تازه را ابتدا در پیش‌نویس ذخیره کنید و سپس زمان انتشار را تأیید کنید. مبلغ سفارش‌های ثبت‌شده تغییر نمی‌کند.</p>
      <p id="tariffMessage" role="status" aria-live="polite" class="text-sm text-amber-300"></p>
      <button id="tariffRefresh" type="button" onclick="loadAdminTariff()" class="bg-sky-700 px-4 py-2 rounded-xl">بازخوانی تعرفه</button>
      <button id="tariffRetry" type="button" onclick="retryAdminTariff()" hidden class="bg-amber-700 px-4 py-2 rounded-xl">بررسی نتیجه تلاش قبلی</button>
      <div id="tariffContent" class="space-y-4"></div>
    </section>

    <section id="tabTiers" class="space-y-4 hidden" hidden>
      <h3 class="text-lg font-bold">قانون درجه‌های متخصص</h3>
      <p class="text-sm text-slate-300">تا وقتی نسخهٔ فعالی ثبت نشده، پیش‌فرض سامانه به کار می‌رود: نقره‌ای با ۲۰ سفارش موفق و میانگین ستارهٔ حداقل ۴، طلایی با ۱۰۰ سفارش موفق و میانگین حداقل ۴٫۵. متخصصی که هنوز ستاره‌ای نگرفته شرط میانگین را ندارد. هر تغییر نسخهٔ جدید می‌سازد و نسخه‌های قبلی می‌مانند. درجهٔ متخصص پایین نمی‌آید و با تکمیل سفارش بعدی‌اش به‌روز می‌شود.</p>
      <p id="tierMessage" role="status" aria-live="polite" class="text-sm text-amber-300"></p>
      <button id="tierRefresh" type="button" onclick="loadAdminTiers()" class="bg-sky-700 px-4 py-2 rounded-xl">بازخوانی قانون درجه‌ها</button>
      <div id="tierContent" class="space-y-4"></div>
    </section>

    <section id="tabCompletion" class="space-y-4 hidden" hidden>
      <h3 class="text-lg font-bold">سیاست پایان کار</h3>
      <p>پیش‌فرض: ثبت متخصص و تأیید مشتری؛ اختلاف با مدیر. تغییر سیاست فقط برای درخواست‌های پایان کار جدید است.</p>
      <label for="completionMode">روش تأیید پایان کار</label>
      <select id="completionMode" disabled class="bg-slate-900 border rounded p-2">
        <option value="customer_confirmation">ثبت متخصص و تأیید مشتری</option>
        <option value="worker_only">فقط تأیید متخصص</option>
      </select>
      <p id="completionMessage" role="status" aria-live="polite"></p>
      <button id="completionRefresh" onclick="loadAdminCompletion()">بازخوانی سیاست جاری</button>
      <button id="completionSave" disabled onclick="saveAdminCompletion()">ذخیره سیاست</button>
    </section>
    <section id="tabCommission" class="space-y-4 hidden" hidden>
      <h3 class="text-lg font-bold">کمیسیون شرکت</h3>
      <p class="text-sm text-slate-300">درصد کمیسیون همه خدمات این شرکت را ثبت کنید. پیش‌فرض ۲۵٪ است. گزارش دستمزد و واریز در این مرحله هنوز فعال نیست.</p>
      <label for="commissionRate" class="block text-sm">درصد کمیسیون</label>
      <input id="commissionRate" type="text" inputmode="decimal" dir="ltr" disabled class="block bg-slate-900 border border-slate-600 rounded-lg p-2" />
      <p id="commissionMessage" role="status" aria-live="polite" class="text-sm text-amber-300"></p>
      <button id="commissionRefresh" type="button" onclick="loadAdminCommission()" class="bg-sky-700 px-4 py-2 rounded-xl">بازخوانی درصد جاری</button>
      <button id="commissionSave" type="button" onclick="saveAdminCommission()" disabled class="bg-emerald-700 px-4 py-2 rounded-xl">ذخیره درصد</button>
    </section>
    <section id="tabPayment" class="space-y-4 hidden" hidden>
      <h3 class="text-lg font-bold">تنظیمات پرداخت شرکت</h3>
      <p class="text-sm text-slate-300">هر استقرار تنظیم درگاه و حساب تسویه خودش را جدا نگه می‌دارد. تا وقتی درگاه پیاده‌سازی‌شده‌ای انتخاب و نزد همان درگاه تأیید نشده باشد، شارژ کیف پول متخصص انجام نمی‌شود. وارد کردن شماره حساب، مقصد تسویه بانکی را عوض نمی‌کند. رمز اتصال پس از ذخیره نمایش داده نمی‌شود و نباید در کد یا مخزن قرار بگیرد.</p>
      <p id="paymentState" class="text-sm text-slate-300"></p>
      <label for="paymentMerchantId" class="block text-sm">شناسه پذیرنده</label>
      <input id="paymentMerchantId" type="text" dir="ltr" autocomplete="off" disabled class="block bg-slate-900 border border-slate-600 rounded-lg p-2" />
      <label for="paymentSettlementLabel" class="block text-sm">عنوان حساب تسویه اعلام‌شده</label>
      <input id="paymentSettlementLabel" type="text" autocomplete="off" disabled class="block bg-slate-900 border border-slate-600 rounded-lg p-2" />
      <label for="paymentSettlementReference" class="block text-sm">شماره حساب اعلام‌شده</label>
      <input id="paymentSettlementReference" type="text" dir="ltr" autocomplete="off" disabled class="block bg-slate-900 border border-slate-600 rounded-lg p-2" />
      <label for="paymentConnectionSecret" class="block text-sm">اطلاعات محرمانه اتصال</label>
      <input id="paymentConnectionSecret" type="password" dir="ltr" autocomplete="new-password" disabled class="block bg-slate-900 border border-slate-600 rounded-lg p-2" />
      <label for="paymentClearSecret" class="block text-sm"><input id="paymentClearSecret" type="checkbox" disabled /> حذف رمز ذخیره‌شده</label>
      <p id="paymentMessage" role="status" aria-live="polite" class="text-sm text-amber-300"></p>
      <button id="paymentRefresh" type="button" onclick="loadAdminPayment()" class="bg-sky-700 px-4 py-2 rounded-xl">بازخوانی تنظیمات پرداخت</button>
      <button id="paymentSave" type="button" onclick="saveAdminPayment()" disabled class="bg-emerald-700 px-4 py-2 rounded-xl">ذخیره تنظیمات پرداخت</button>
    </section>

    <section id="tabPoints" class="space-y-4 hidden" hidden>
      <h3 class="text-lg font-bold">قانون امتیاز</h3>
      <p class="text-sm text-slate-300">تا وقتی نسخهٔ فعالی ثبت نشده، پیش‌فرض سامانه به کار می‌رود: هر سفارش موفق ۵ امتیاز برای مشتری و ۵ امتیاز برای متخصص، و ۲ امتیاز اضافه برای متخصص وقتی مشتری ۵ ستاره بدهد. هر تغییر نسخهٔ جدید می‌سازد و امتیازهای قبلی عوض نمی‌شوند.</p>
      <p id="pointsMessage" role="status" aria-live="polite" class="text-sm text-amber-300"></p>
      <button id="pointsRefresh" type="button" onclick="loadAdminPoints()" class="bg-sky-700 px-4 py-2 rounded-xl">بازخوانی قانون امتیاز</button>
      <div id="pointsContent" class="space-y-4"></div>
    </section>

  </div>

  <details class="max-w-6xl mx-auto mt-6 text-xs text-slate-300">
    <summary id="sourceIdentitySummary" class="cursor-pointer">نسخه اجرا: مدیریت · نامشخص</summary>
    <pre id="sourceIdentityDetails" class="whitespace-pre-wrap select-text mt-2"></pre>
    <p>شناسه هنگام شروع سرور ثبت شده است.</p>
  </details>

  <script src="/admin/tariff.js"></script>
  <script src="/admin/tiers.js"></script>
<script src="/admin/points.js"></script>
  <script src="/admin/commission.js"></script>
  <script src="/admin/payment.js"></script>
  <script src="/admin/completion.js"></script>
  <script>
    const sourceIdentity = ${identityJson};
    const identityState = !sourceIdentity.commit || sourceIdentity.dirty == null ? 'منبع نامشخص'
      : sourceIdentity.dirty ? 'تغییرات ثبت‌نشده' : 'بدون تغییر ثبت‌نشده';
    const identityBranch = sourceIdentity.detached ? 'بدون شاخه (detached)' : sourceIdentity.branch || 'نامشخص';
    document.getElementById('sourceIdentitySummary').textContent = 'نسخه اجرا: مدیریت · ' +
      (sourceIdentity.commit ? sourceIdentity.commit.slice(0, 7) : 'نامشخص') + ' · ' + identityState;
    document.getElementById('sourceIdentityDetails').textContent = 'نسخه: ' + (sourceIdentity.commit || 'نامشخص') +
      '\\nشاخه: ' + identityBranch + '\\nوضعیت: ' + identityState;
    let adminToken = sessionStorage.getItem('paksho_admin_token') || '';

    async function ensureAdmin() {
      if (adminToken) return true;
      const password = window.prompt('رمز مدیر را وارد کنید (از متغیر محیط سرور)');
      if (!password) return false;
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!data.success || !data.token) {
        window.alert(data.message || 'ورود مدیر ناموفق بود');
        return false;
      }
      adminToken = data.token;
      sessionStorage.setItem('paksho_admin_token', adminToken);
      return true;
    }

    async function logoutAdmin() {
      if (adminToken) {
        try {
          await fetch('/api/admin/logout', { method: 'POST', headers: adminHeaders() });
        } catch (e) {}
      }
      adminToken = '';
      sessionStorage.removeItem('paksho_admin_token');
      window.location.reload();
    }

    function adminHeaders() {
      return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      };
    }

    async function loadAllData() {
      try {
        if (!(await ensureAdmin())) return;
        const statsRes = await fetch('/api/admin/stats', { headers: adminHeaders() });
        const statsData = await statsRes.json();
        if (statsData.success) {
          const s = statsData.stats;
          document.getElementById('totalOrders').innerText = s.totalOrders;
          document.getElementById('pendingWorkers').innerText = s.pendingWorkersCount;
          document.getElementById('totalWorkers').innerText = s.totalWorkers;
          document.getElementById('totalRevenue').innerText = s.totalRevenue.toLocaleString('fa-IR');
        }

        const workersRes = await fetch('/api/admin/users?role=WORKER', { headers: adminHeaders() });
        const workersData = await workersRes.json();
        if (workersData.success) renderWorkers(workersData.users);

        const ordersRes = await fetch('/api/admin/orders', { headers: adminHeaders() });
        const ordersData = await ordersRes.json();
        if (ordersData.success) renderOrders(ordersData.orders);

        await loadAdminTariff();

      } catch (e) {
        console.error(e);
      }
    }

    // All API values remain data: text nodes, validated image URLs and event closures.
    function adminElement(tag, className, text) {
      const element = document.createElement(tag);
      element.className = className;
      if (arguments.length === 3) element.textContent = String(text);
      return element;
    }

    function safeWorkerAvatar(value) {
      const fallback = 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150';
      if (typeof value !== 'string' || !value.trim()) return fallback;
      const source = value.trim();
      // Do not reinterpret markup, control characters or backslashes as a URL.
      if (/[<>"']/.test(source) || source.includes(String.fromCharCode(92)) ||
          Array.from(source).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
        return fallback;
      }
      const rasterPrefixes = ['data:image/png;base64,', 'data:image/jpeg;base64,',
        'data:image/jpg;base64,', 'data:image/webp;base64,'];
      const prefix = rasterPrefixes.find(candidate => source.toLowerCase().startsWith(candidate));
      if (prefix) {
        const data = source.slice(prefix.length);
        return data.length % 4 === 0 && new RegExp('^[A-Za-z0-9+/]+={0,2}$').test(data)
          ? source : fallback;
      }
      try {
        const url = new URL(source, window.location.href);
        return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
          ? url.href : fallback;
      } catch {
        return fallback;
      }
    }

    function renderWorkers(workers) {
      const container = document.getElementById('workersList');
      if (!workers || workers.length === 0) {
        container.replaceChildren(adminElement('p', 'text-xs text-slate-400', 'هیچ متخصصی ثبت‌نام نکرده است.'));
        return;
      }

      const rows = document.createDocumentFragment();
      for (const w of workers) {
        const card = adminElement('div', 'bg-slate-800 border ' +
          (w.status === 'PENDING_VERIFICATION' ? 'border-amber-500/50 bg-amber-950/10' : 'border-slate-700') +
          ' rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4');
        const identity = adminElement('div', 'flex items-center gap-3');
        const avatar = adminElement('img', 'w-12 h-12 rounded-full border-2 border-emerald-500 object-cover');
        avatar.src = safeWorkerAvatar(w.avatar);
        const details = adminElement('div', '');
        const heading = adminElement('div', 'flex items-center gap-2');
        heading.append(
          adminElement('span', 'font-bold text-white text-base', w.name || 'متخصص بدون نام'),
          adminElement('span', 'text-[10px] px-2 py-0.5 rounded-full font-bold ' + getStatusBadge(w.status), getStatusTitle(w.status))
        );
        details.append(
          heading,
          adminElement('p', 'text-xs text-slate-400 mt-1', 'تلفن: ' + w.phone + ' | کد ملی: ' + (w.nationalId || 'ثبت نشده') + ' | شبا: ' + (w.bankSheba || 'ثبت نشده')),
          adminElement('p', 'text-xs text-slate-400', 'آدرس: ' + (w.address || 'ثبت نشده'))
        );
        identity.append(avatar, details);
        const actions = adminElement('div', 'flex gap-2');
        const approve = w.status !== 'APPROVED';
        const button = adminElement('button',
          (approve ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500') +
          ' text-white text-xs font-bold px-3 py-2 rounded-xl transition',
          approve ? '✅ تایید مدارک و فعال‌سازی' : '⛔ غیرفعال‌سازی');
        button.addEventListener('click', () => updateWorkerStatus(w.id, approve ? 'APPROVED' : 'BLOCKED'));
        actions.append(button);
        card.append(identity, actions);
        rows.append(card);
      }
      container.replaceChildren(rows);
    }

    function renderOrders(orders) {
      const container = document.getElementById('ordersList');
      if (!orders || orders.length === 0) {
        container.replaceChildren(adminElement('p', 'text-xs text-slate-400', 'هیچ سفارشی وجود ندارد.'));
        return;
      }

      const rows = document.createDocumentFragment();
      for (const o of orders) {
        const card = adminElement('div', 'bg-slate-800 border border-slate-700 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4');
        const details = adminElement('div', '');
        const heading = adminElement('div', 'flex items-center gap-2');
        heading.append(
          adminElement('span', 'font-bold text-sky-400 font-mono', o.id),
          adminElement('span', 'font-bold text-white', o.serviceTitle),
          adminElement('span', 'text-[10px] px-2 py-0.5 rounded-full font-bold ' + getOrderStatusBadge(o.status), getOrderStatusTitle(o.status))
        );
        details.append(
          heading,
          adminElement('p', 'text-xs text-slate-400 mt-1', 'مشتری: ' + o.customerName + ' (' + o.customerPhone + ')'),
          adminElement('p', 'text-xs text-slate-400', 'آدرس: ' + o.address + ' | تاریخ: ' + o.date + ' ساعت ' + o.time)
        );
        if (o.cleanerName) {
          details.append(adminElement('p', 'text-xs text-emerald-400 mt-1', 'متخصص پذیرنده: ' + o.cleanerName));
        }
        const actions = adminElement('div', 'flex flex-col items-end gap-2');
        if (o.completion?.status === 'disputed') {
          details.append(adminElement('p','text-amber-300','اختلاف پایان کار — ساعات: '+(o.completion.actualHours ?? 'غیرساعتی')+' | مبلغ اعلام‌شده: '+o.completion.finalAmount));
          for (const approve of [true,false]) {
            const decision = adminElement('button','bg-sky-700 px-3 py-2 rounded',approve ? 'تأیید پایان کار و مبلغ' : 'رد درخواست پایان کار');
            decision.addEventListener('click',()=>decideAdminCompletion(o,approve,decision));actions.append(decision);
          }
        }
        if (o.status === 'CANCEL_REQUESTED') {
          const button = adminElement('button', 'bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-2 rounded-xl', 'تأیید لغو');
          button.addEventListener('click', () => confirmCustomerCancel(o.id));
          actions.append(button);
        }
        actions.append(adminElement('div', 'text-left font-bold text-purple-400 text-sm', (o.price || 0).toLocaleString('fa-IR') + ' تومان'));
        card.append(details, actions);
        rows.append(card);
      }
      container.replaceChildren(rows);
    }

    async function confirmCustomerCancel(orderId) {
      const res = await fetch('/api/admin/orders/' + encodeURIComponent(orderId), {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ status: 'CANCELLED' })
      });
      const data = await res.json();
      if (data.success) loadAllData();
    }

    function getStatusBadge(status) {
      if (status === 'APPROVED' || status === 'ACTIVE') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      if (status === 'PENDING_VERIFICATION') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      return 'bg-slate-700 text-slate-400';
    }

    function getStatusTitle(status) {
      if (status === 'APPROVED' || status === 'ACTIVE') return 'تایید شده و فعال';
      if (status === 'PENDING_VERIFICATION') return 'در انتظار بررسی مدارک';
      return 'ثبت‌نام اولیه';
    }

    function getOrderStatusBadge(status) {
      if (status === 'ACCEPTED') return 'bg-emerald-500/20 text-emerald-400';
      if (status === 'PENDING') return 'bg-amber-500/20 text-amber-400';
      return 'bg-slate-700 text-slate-400';
    }

    function getOrderStatusTitle(status) {
      if (status === 'ACCEPTED') return 'پذیرفته‌شده';
      if (status === 'PENDING') return 'در انتظار متخصص';
      if (status === 'CONFIRMED') return 'تأیید شده';
      if (status === 'ASSIGNED') return 'تخصیص متخصص';
      if (status === 'IN_PROGRESS') return 'در حال انجام';
      if (status === 'COMPLETED') return 'انجام شده';
      if (status === 'CANCELLED') return 'لغو شده';
      if (status === 'CANCEL_REQUESTED') return 'درخواست لغو در حال بررسی';
      return 'وضعیت نامشخص';
    }

    async function updateWorkerStatus(userId, status) {
      const res = await fetch('/api/admin/users/' + encodeURIComponent(userId) + '/status', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        loadAllData();
      }
    }

    function switchTab(tab) {
      for (const name of ['workers', 'orders', 'tariffs', 'tiers', 'points', 'commission', 'completion', 'payment']) {
        const suffix = name[0].toUpperCase() + name.slice(1);
        const panel = document.getElementById('tab' + suffix);
        panel.hidden = name !== tab;
        panel.classList.toggle('hidden', name !== tab);
        document.getElementById('tab' + suffix + 'Btn').className = name === tab
          ? 'pb-3 border-b-2 border-sky-400 text-sky-400'
          : 'pb-3 border-b-2 border-transparent text-slate-400 hover:text-white';
      }
    }

    loadAllData();
  </script>
</body>
</html>
  `);
});

// ------------------- خطای پیش‌بینی‌نشده -------------------
// بدون این بخش، Express در حالت development متن خطا و مسیر فایل‌های سرور را برای کاربر می‌فرستد.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err && (err.status || err.statusCode));
  if (status === 413) {
    return res.status(413).json({ success: false, message: 'حجم اطلاعات ارسالی بیش از حد مجاز است.' });
  }
  if (status >= 400 && status < 500) {
    return res.status(status).json({ success: false, message: 'درخواست نامعتبر است. لطفاً دوباره تلاش کنید.' });
  }
  console.error('[Paksho] خطای پیش‌بینی‌نشده:', err);
  return res.status(500).json({ success: false, message: 'مشکلی پیش آمد. لطفاً دوباره تلاش کنید.' });
});

function listenHost(env = process.env) {
  const raw = env.PAKSHO_BIND_HOST;
  if (typeof raw !== 'string' || raw.trim() === '') return '0.0.0.0';
  const requested = raw.trim();
  if (requested === '127.0.0.1' || requested === 'localhost' || requested === '::1') return '127.0.0.1';
  if (requested === '0.0.0.0') return '0.0.0.0';
  const error = new Error('PAKSHO_BIND_HOST نامعتبر است.');
  error.code = 'INVALID_BIND_HOST';
  throw error;
}

if (require.main === module) {
  const { startCancelDueScheduler } = require('./cancelDueScheduler');
  startCancelDueScheduler(store);
  let host;
  try {
    host = listenHost();
  } catch {
    console.error('[Paksho] میزبان شنود نامعتبر است. سرور بالا نمی‌آید.');
    process.exit(1);
  }
  app.listen(PORT, host, () => {
    console.log(`Paksho Secure Backend & Admin Dashboard running on http://${host}:${PORT}`);
  });
}

module.exports = { app, store, listenHost };
