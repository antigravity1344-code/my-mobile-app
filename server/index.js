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
const kavenegarSms = require('./kavenegarSms');
const { assertKeyConfigured, secretsMatch } = require('./fieldCrypto');

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
const ADMIN_ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ADMIN_USER_STATUSES = ['REGISTERED', 'PENDING_VERIFICATION', 'APPROVED', 'ACTIVE', 'REJECTED', 'BLOCKED'];
const MIN_ORDER_PRICE = 50000;
const MAX_ORDER_PRICE = 20000000;
const MAX_DOC_CHARS = 400000;
const MAX_ID_DOC_BYTES = 600 * 1024;
const workerDocuments = createWorkerDocumentStorage(
  process.env.PAKSHO_WORKER_DOC_DIR
    ? path.resolve(process.env.PAKSHO_WORKER_DOC_DIR)
    : path.join(__dirname, 'uploads', 'worker-docs')
);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
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
    res.status(403).json({ success: false, message: 'حساب شما مسدود شده است.' });
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
    return { error: 'حجم مدرک باید حداکثر ۶۰۰ کیلوبایت باشد.' };
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

  const code = generateOtpCode();
  let delivery;
  if (kavenegarSms.useFakeSms()) {
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
  window.count += 1;
  otpSendWindow.set(windowKey, window);

  res.json({
    success: true,
    message: 'کد تایید پیامک شد.'
  });
});

// 2. بررسی OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const phone = kavenegarSms.normalizeIranMobile(req.body?.phone);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const role = req.body?.role;

  if (!phone || !code) {
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
  } = req.body || {};
  if (userId && userId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'ثبت سفارش برای کاربر دیگر مجاز نیست.' });
  }
  const user = authUser;
  const orderAddress = typeof address === 'string' ? address.trim().slice(0, 500) : '';
  if (!orderAddress) {
    return res.status(400).json({ success: false, message: 'آدرس سفارش الزامی است.' });
  }
  const parsedPrice = parseOrderPrice(price);
  if (parsedPrice == null) {
    return res.status(400).json({
      success: false,
      message: `مبلغ سفارش باید عدد صحیح بین ${MIN_ORDER_PRICE} و ${MAX_ORDER_PRICE} تومان باشد.`
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
  const storedPricing = sanitizePricing(pricing);
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
    date: typeof date === 'string' ? date.trim().slice(0, 40) : 'امروز',
    time: typeof time === 'string' ? time.trim().slice(0, 40) : '14:00',
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
    createdAt: new Date().toISOString()
  };

  const savedOrder = store.transaction(() => {
    const order = store.createOrder(newOrder);
    store.addNotification(
      user.id,
      order.id,
      'ORDER_CREATED',
      'سفارش ثبت شد',
      'سفارش ' + order.id + ' ثبت شد و در انتظار متخصص است.'
    );
    return order;
  });

  res.json({ success: true, order: savedOrder });
});

// ------------------- نمای سفارش برای متخصص (حریم خصوصی مشتری) -------------------
// تلفن و آدرس دقیق مشتری فقط بعد از پذیرش موفق و فقط برای کار فعالِ همان متخصص فرستاده می‌شود.
const WORKER_ACTIVE_ORDER_STATUSES = ['ACCEPTED', 'IN_PROGRESS', 'CONFIRMED', 'ASSIGNED'];

/** محدوده/محله: اولین بخش آدرس (قبل از «،»). بخشی که عدد دارد یا بلند است (احتمالاً نشانی دقیق) فرستاده نمی‌شود. */
function orderAreaFromAddress(address) {
  const first = String(address || '').split(/[،,]/)[0].trim();
  if (!first || first.length > 40 || /[0-9۰-۹٠-٩]/.test(first)) return '';
  return first;
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
    paymentMethod: order.paymentMethod,
    // notes (متن آزاد مشتری) قبل از پذیرش فرستاده نمی‌شود؛ ممکن است شماره یا اطلاعات خصوصی داشته باشد.
    createdAt: order.createdAt,
    area,
    address: area,
    addressNotes: null,
    customerName: '',
    customerPhone: '',
    customerAvatar: '',
    cleanerId: null,
    cleanerName: null,
    cleanerAvatar: null,
  };
}

/** سفارش‌های خود متخصص: برای کار لغوشده/تمام‌شده تلفن و آدرس دقیق حذف می‌شود. */
function workerAssignedOrderView(order) {
  const area = orderAreaFromAddress(order.address);
  // notes (یادداشت آزاد مشتری) در نمای کاری متخصص، حتی بعد از پذیرش، فرستاده نمی‌شود (D-05).
  const { notes, ...workerVisible } = order;
  if (WORKER_ACTIVE_ORDER_STATUSES.includes(order.status)) {
    return { ...workerVisible, area };
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
  PENDING: 'در انتظار تأیید',
  ACCEPTED: 'در حال انجام',
  CONFIRMED: 'تأیید شده',
  ASSIGNED: 'تخصیص متخصص',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'انجام شده',
  CANCELLED: 'لغو شده',
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
  if (authUser.role === 'CUSTOMER') {
    return res.json({ success: true, orders: store.getOrders({ customerId: authUser.id }) });
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
  if (accepted.code === 'missing') return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
  if (accepted.code === 'conflict') {
    return res.status(400).json({ success: false, message: acceptConflictMessage(accepted.order, cleaner.id) });
  }
  res.json({ success: true, order: workerAssignedOrderView(accepted.order) });
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
  const cancelled = store.tryCancelOrder(orderId, trimmedUserId, CUSTOMER_CANCELLABLE_STATUSES, cancelReason);
  if (cancelled.code === 'missing') return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });
  if (cancelled.code === 'forbidden') {
    return res.status(403).json({ success: false, message: 'فقط صاحب سفارش می‌تواند آن را لغو کند.' });
  }
  if (cancelled.code === 'bad-status') {
    return res.status(400).json({ success: false, message: 'این سفارش در وضعیتی نیست که قابل لغو باشد.' });
  }
  res.json({ success: true, order: cancelled.order });
});

// تکمیل سفارش توسط متخصص پذیرنده (ACCEPTED → COMPLETED)
app.put('/api/orders/:orderId/complete', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'WORKER') {
    return res.status(403).json({ success: false, message: 'فقط متخصص پذیرنده می‌تواند خدمت را تکمیل کند.' });
  }
  const { orderId } = req.params;
  const cleanerId = req.body && req.body.cleanerId;
  if (cleanerId && cleanerId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'تکمیل سفارش با شناسه متخصص دیگر مجاز نیست.' });
  }

  const cleaner = authUser;
  if (!cleaner || (cleaner.status !== 'APPROVED' && cleaner.status !== 'ACTIVE')) {
    return res.status(403).json({ success: false, message: 'حساب متخصص شما هنوز تایید نشده است.' });
  }

  const completed = store.tryCompleteOrder(orderId, cleaner);
  if (completed.code === 'missing') return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
  if (completed.code === 'bad-status') {
    return res.status(400).json({ success: false, message: 'فقط سفارش‌های پذیرفته‌شده قابل تکمیل هستند.' });
  }
  if (completed.code === 'forbidden') {
    return res.status(403).json({ success: false, message: 'فقط متخصص پذیرنده می‌تواند این سفارش را تکمیل کند.' });
  }
  // سفارش تمام‌شده: همان نمای GET /orders (بدون تلفن و آدرس دقیق مشتری).
  res.json({ success: true, order: workerAssignedOrderView(completed.order) });
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
  res.json({ success: true, order: rated.order });
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

app.use('/api/admin', requireAdmin);

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

  res.json({ success: true, user: adminUserView(user), message: `وضعیت کاربر به ${status} تغییر یافت.` });
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
  res.json({ success: true, orders: store.listOrders() });
});

app.put('/api/admin/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const { status, cleanerId } = req.body || {};

  const updated = store.transaction(() => {
    const order = store.getOrder(orderId);
    if (!order) return { code: 'missing' };
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
      saved = store.clearAcceptanceForReturnToPending(saved.id);
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
        'سفارش ' + saved.id + ' توسط پشتیبانی به متخصص دیگری واگذار شد.'
      );
      store.addNotification(
        saved.cleanerId,
        saved.id,
        'ORDER_ASSIGNED',
        'واگذاری سفارش جدید',
        'سفارش ' + saved.id + ' توسط پشتیبانی به شما واگذار شد.'
      );
    }

    // متخصصی که با برگشت به PENDING کنار گذاشته شده، اعلان تغییر وضعیت را می‌گیرد (فقط اگر قبلاً متخصصی منتسب بوده باشد).
    const notifiedWorkerId = savesAsPending ? previousCleanerId : saved.cleanerId;
    if (saved.status !== previousStatus) {
      const statusText = 'وضعیت سفارش ' + saved.id + ' به «' + orderStatusLabel(saved.status) + '» تغییر کرد.';
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
  res.json({ success: true, order: updated.order });
});

app.delete('/api/admin/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  if (!store.deleteOrder(orderId)) {
    return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });
  }
  res.json({ success: true, message: 'سفارش با موفقیت حذف شد.' });
});

// ------------------- مسیر وب داشبورد ادمین (ADMIN WEB DASHBOARD) -------------------
app.get('/admin', (req, res) => {
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

  </div>

  <script>
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

      } catch (e) {
        console.error(e);
      }
    }

    function renderWorkers(workers) {
      const container = document.getElementById('workersList');
      if (!workers || workers.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400">هیچ متخصصی ثبت‌نام نکرده است.</p>';
        return;
      }

      container.innerHTML = workers.map(w => \`
        <div class="bg-slate-800 border \${w.status === 'PENDING_VERIFICATION' ? 'border-amber-500/50 bg-amber-950/10' : 'border-slate-700'} rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex items-center gap-3">
            <img src="\${w.avatar || 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150'}" class="w-12 h-12 rounded-full border-2 border-emerald-500 object-cover" />
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-white text-base">\${w.name || 'متخصص بدون نام'}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold \${getStatusBadge(w.status)}">\${getStatusTitle(w.status)}</span>
              </div>
              <p class="text-xs text-slate-400 mt-1">تلفن: \${w.phone} | کد ملی: \${w.nationalId || 'ثبت نشده'} | شبا: \${w.bankSheba || 'ثبت نشده'}</p>
              <p class="text-xs text-slate-400">آدرس: \${w.address || 'ثبت نشده'}</p>
            </div>
          </div>
          <div class="flex gap-2">
            \${w.status !== 'APPROVED' ? \`
              <button onclick="updateWorkerStatus('\${w.id}', 'APPROVED')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                ✅ تایید مدارک و فعال‌سازی
              </button>
            \` : \`
              <button onclick="updateWorkerStatus('\${w.id}', 'BLOCKED')" class="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                ⛔ غیرفعال‌سازی
              </button>
            \`}
          </div>
        </div>
      \`).join('');
    }

    function renderOrders(orders) {
      const container = document.getElementById('ordersList');
      if (!orders || orders.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400">هیچ سفارشی وجود ندارد.</p>';
        return;
      }

      container.innerHTML = orders.map(o => \`
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-sky-400 font-mono">\${o.id}</span>
              <span class="font-bold text-white">\${o.serviceTitle}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold \${getOrderStatusBadge(o.status)}">\${getOrderStatusTitle(o.status)}</span>
            </div>
            <p class="text-xs text-slate-400 mt-1">مشتری: \${o.customerName} (\${o.customerPhone})</p>
            <p class="text-xs text-slate-400">آدرس: \${o.address} | تاریخ: \${o.date} ساعت \${o.time}</p>
            \${o.cleanerName ? \`<p class="text-xs text-emerald-400 mt-1">متخصص پذیرنده: \${o.cleanerName}</p>\` : ''}
          </div>
          <div class="text-left font-bold text-purple-400 text-sm">
            \${(o.price || 0).toLocaleString('fa-IR')} تومان
          </div>
        </div>
      \`).join('');
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
      if (status === 'ACCEPTED') return 'پذیرفته شده';
      if (status === 'PENDING') return 'در انتظار متخصص';
      return status;
    }

    async function updateWorkerStatus(userId, status) {
      const res = await fetch(\`/api/admin/users/\${userId}/status\`, {
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
      if (tab === 'workers') {
        document.getElementById('tabWorkers').classList.remove('hidden');
        document.getElementById('tabOrders').classList.add('hidden');
        document.getElementById('tabWorkersBtn').className = 'pb-3 border-b-2 border-sky-400 text-sky-400';
        document.getElementById('tabOrdersBtn').className = 'pb-3 border-b-2 border-transparent text-slate-400 hover:text-white';
      } else {
        document.getElementById('tabWorkers').classList.add('hidden');
        document.getElementById('tabOrders').classList.remove('hidden');
        document.getElementById('tabWorkersBtn').className = 'pb-3 border-b-2 border-transparent text-slate-400 hover:text-white';
        document.getElementById('tabOrdersBtn').className = 'pb-3 border-b-2 border-sky-400 text-sky-400';
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

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Paksho Secure Backend & Admin Dashboard running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = { app, store };
