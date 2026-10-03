const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const DB_FILE = path.join(__dirname, 'db.json');
const otpSendWindow = new Map();
const adminLoginAttempts = new Map();

let db = {
  users: [
    {
      id: 'USER-101',
      phone: '09121111111',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      isProfileComplete: true,
      name: 'علی رضایی',
      nationalId: '0012345678',
      birthDate: '1370/01/01',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      address: 'تهران، خیابان آزادی، پلاک ۱۲',
      city: 'تهران',
      addresses: ['تهران، خیابان آزادی، پلاک ۱۲'],
      createdAt: new Date().toISOString()
    },
    {
      id: 'USER-102',
      phone: '09122222222',
      role: 'WORKER',
      status: 'PENDING_VERIFICATION',
      isProfileComplete: true,
      name: 'رضا محمدی',
      nationalId: '0087654321',
      birthDate: '1368/05/12',
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
      idDoc: 'کارت ملی و شناسنامه ثبت شده',
      address: 'تهران، خیابان شریعتی، خیابان ملک',
      city: 'تهران',
      skills: ['نظافت منزل', 'نظافت راه پله'],
      bankSheba: 'IR120000000000000000000000',
      createdAt: new Date().toISOString()
    }
  ],
  orders: [
    {
      id: 'ORD-101',
      customerId: 'USER-101',
      customerName: 'علی رضایی',
      customerPhone: '09121111111',
      customerAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      serviceTitle: 'نظافت عادی منزل',
      address: 'تهران، خیابان آزادی، پلاک ۱۲',
      date: '۱۴۰۳/۰۷/۰۱',
      time: '۱۰:۰۰',
      price: 350000,
      status: 'PENDING', // PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED
      cleanerId: null,
      cleanerName: null,
      cleanerAvatar: null,
      createdAt: new Date().toISOString()
    }
  ],
  otpStore: {}
};

if (fs.existsSync(DB_FILE)) {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    db = JSON.parse(data);
    if (!db.otpStore) db.otpStore = {};
    if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
  } catch (e) {
    console.error('Error reading db.json', e);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Error saving db.json', e);
  }
}

function pruneExpiredSessions() {
  if (!db.sessions || typeof db.sessions !== 'object') return;
  const now = Date.now();
  let changed = false;
  for (const [token, session] of Object.entries(db.sessions)) {
    if (!session || session.expires < now) {
      delete db.sessions[token];
      changed = true;
    }
  }
  if (changed) saveDb();
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
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = {
    userId: user.id,
    role: user.role,
    expires: Date.now() + USER_SESSION_MS
  };
  saveDb();
  return token;
}

function revokeUserSession(token) {
  if (!token || !db.sessions) return false;
  if (!db.sessions[token]) return false;
  delete db.sessions[token];
  saveDb();
  return true;
}

function authUserFromRequest(req) {
  const token = bearerToken(req);
  if (!token || !db.sessions) return null;
  const session = db.sessions[token];
  if (!session) return null;
  if (session.expires < Date.now()) {
    delete db.sessions[token];
    saveDb();
    return null;
  }
  return db.users.find(u => u.id === session.userId && u.role === session.role) || null;
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
  } while (db.orders.some(o => o.id === id));
  return id;
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
app.post('/api/auth/send-otp', (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  if (!phone || phone.length < 10 || phone.length > 15) {
    return res.status(400).json({ success: false, message: 'شماره همراه معتبر وارد کنید.' });
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

  const existingOtp = db.otpStore[phone];
  if (existingOtp && now - existingOtp.lastSent < OTP_RESEND_MS) {
    const waitSec = Math.ceil((OTP_RESEND_MS - (now - existingOtp.lastSent)) / 1000);
    return res.status(429).json({
      success: false,
      message: `لطفاً ${waitSec} ثانیه دیگر جهت درخواست مجدد کد شکیبایی ورزید.`
    });
  }

  const code = generateOtpCode();
  db.otpStore[phone] = {
    code,
    attempts: 0,
    lastSent: now,
    expires: now + OTP_TTL_MS
  };
  window.count += 1;
  otpSendWindow.set(windowKey, window);
  saveDb();

  if (!IS_PRODUCTION) {
    console.log(`[Paksho DEV OTP] phone=${phone} code=${code} (SMS واقعی وصل نیست)`);
  }

  res.json({
    success: true,
    message: IS_PRODUCTION
      ? 'اگر پیامک واقعی پیکربندی شده باشد، کد ارسال می‌شود.'
      : 'پیامک واقعی وصل نیست. کد تایید فقط در کنسول سرور توسعه چاپ شده است.'
  });
});

// 2. بررسی OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const role = req.body?.role;

  if (!phone || !code) {
    return res.status(400).json({ success: false, message: 'شماره تلفن و کد تایید الزامی است.' });
  }

  const otpData = db.otpStore[phone];
  if (!otpData) {
    return res.status(400).json({ success: false, message: 'درخواستی برای این شماره یافت نشد.' });
  }

  if (otpData.expires && Date.now() > otpData.expires) {
    delete db.otpStore[phone];
    saveDb();
    return res.status(400).json({ success: false, message: 'کد تایید منقضی شده است. دوباره درخواست دهید.' });
  }

  if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ success: false, message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است.' });
  }

  if (code !== otpData.code) {
    otpData.attempts += 1;
    saveDb();
    return res.status(400).json({ success: false, message: 'کد تایید اشتباه است.' });
  }

  delete db.otpStore[phone];

  const requestedRole = role === 'WORKER' ? 'WORKER' : 'CUSTOMER';
  let user = db.users.find(u => u.phone === phone && u.role === requestedRole);

  if (!user) {
    user = {
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
    };
    db.users.push(user);
  }

  saveDb();

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
  const user = authUser;

  const nextName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  const nextNationalId = typeof nationalId === 'string' ? nationalId.trim() : '';
  const nextBirthDate = typeof birthDate === 'string' ? birthDate.trim().slice(0, 20) : '';
  const nextAddress = typeof address === 'string' ? address.trim().slice(0, 300) : '';

  if (nextName) user.name = nextName;
  if (nextNationalId) {
    if (!/^\d{10}$/.test(nextNationalId)) {
      return res.status(400).json({ success: false, message: 'کد ملی باید ۱۰ رقم باشد.' });
    }
    user.nationalId = nextNationalId;
  }
  if (nextBirthDate) user.birthDate = nextBirthDate;
  if (nextAddress) {
    user.address = nextAddress;
    if (!user.addresses) user.addresses = [];
    if (!user.addresses.includes(nextAddress)) user.addresses.push(nextAddress);
  }

  user.isProfileComplete = !!(user.name && user.nationalId);
  saveDb();

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
  res.json({ success: true, addresses: Array.isArray(authUser.savedAddresses) ? authUser.savedAddresses : [] });
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
  authUser.savedAddresses = addresses;
  const defaultAddress = addresses.find(address => address.isDefault) || addresses[0];
  if (defaultAddress) authUser.address = defaultAddress.fullAddress;
  saveDb();
  res.json({ success: true, addresses });
});

app.put('/api/users/worker-onboarding', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'WORKER') {
    return res.status(403).json({ success: false, message: 'فقط متخصص می‌تواند مدارک خودش را ثبت کند.' });
  }
  const { userId, name, nationalId, birthDate, avatar, idDoc, address, city, skills, bankSheba } = req.body || {};
  if (userId && userId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'تغییر مدارک متخصص دیگر مجاز نیست.' });
  }
  const user = authUser;
  const nextName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  const nextNationalId = typeof nationalId === 'string' ? nationalId.trim() : '';
  const nextBankSheba = typeof bankSheba === 'string' ? bankSheba.trim().toUpperCase() : '';
  const nextAvatar = typeof avatar === 'string' ? avatar.trim() : '';
  const nextIdDoc = typeof idDoc === 'string' ? idDoc.trim() : '';

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
  if (nextIdDoc && nextIdDoc.length > MAX_DOC_CHARS) {
    return res.status(400).json({ success: false, message: 'حجم مدرک بیش از حد مجاز است.' });
  }
  if (nextAvatar && nextAvatar.startsWith('data:') && !/^data:image\/(png|jpeg|jpg|webp);/i.test(nextAvatar)) {
    return res.status(400).json({ success: false, message: 'فرمت تصویر پروفایل مجاز نیست.' });
  }

  user.name = nextName;
  user.nationalId = nextNationalId;
  user.birthDate = typeof birthDate === 'string' ? birthDate.trim().slice(0, 20) : user.birthDate;
  if (nextAvatar) user.avatar = nextAvatar;
  if (nextIdDoc) user.idDoc = nextIdDoc;
  user.address = typeof address === 'string' ? address.trim().slice(0, 300) : user.address;
  user.city = typeof city === 'string' ? city.trim().slice(0, 80) : user.city;
  user.skills = Array.isArray(skills) ? skills.slice(0, 20).map(s => String(s).slice(0, 40)) : user.skills;
  user.bankSheba = nextBankSheba;

  user.status = 'PENDING_VERIFICATION';
  user.isProfileComplete = true;

  saveDb();

  res.json({
    success: true,
    user: publicUser(user),
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
  const { userId, serviceTitle, address, date, time, price, notes } = req.body || {};
  if (userId && userId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'ثبت سفارش برای کاربر دیگر مجاز نیست.' });
  }
  const user = authUser;
  const orderAddress = typeof address === 'string' ? address.trim().slice(0, 400) : '';
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

  const newOrder = {
    id: createOrderId(),
    customerId: user.id,
    customerName: user.name || 'کاربر مشتری',
    customerPhone: user.phone,
    customerAvatar: user.avatar || '',
    serviceTitle: title,
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
    createdAt: new Date().toISOString()
  };

  db.orders.unshift(newOrder);
  saveDb();

  res.json({ success: true, order: newOrder });
});

// 6. سفارش‌های آماده (متخصصین تایید شده)
app.get('/api/orders', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role === 'CUSTOMER') {
    return res.json({ success: true, orders: db.orders.filter(o => o.customerId === authUser.id) });
  }
  if (authUser.role === 'WORKER') {
    return res.json({ success: true, orders: db.orders.filter(o => o.cleanerId === authUser.id) });
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
  const availableOrders = db.orders.filter(o => o.status === 'PENDING');
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

  const order = db.orders.find(o => o.id === orderId);
  const cleaner = authUser;

  if (!order) return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });

  if (!cleaner || (cleaner.status !== 'APPROVED' && cleaner.status !== 'ACTIVE')) {
    return res.status(403).json({ success: false, message: 'حساب متخصص شما هنوز تایید نشده است.' });
  }

  if (order.status !== 'PENDING') {
    return res.status(400).json({ success: false, message: 'این سفارش قبلاً پذیرفته شده است.' });
  }

  order.status = 'ACCEPTED';
  order.cleanerId = cleaner.id;
  order.cleanerName = cleaner.name;
  order.cleanerAvatar = cleaner.avatar;
  order.cleanerPhone = cleaner.phone || '';
  saveDb();
  res.json({ success: true, order });
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
  const order = db.orders.find(o => o.id === orderId);

  if (!order) return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });
  if (!trimmedUserId || order.customerId !== trimmedUserId) {
    return res.status(403).json({ success: false, message: 'فقط صاحب سفارش می‌تواند آن را لغو کند.' });
  }
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    return res.status(400).json({ success: false, message: 'این سفارش در وضعیتی نیست که قابل لغو باشد.' });
  }

  order.status = 'CANCELLED';
  order.cancelledAt = new Date().toISOString();
  order.cancelledBy = trimmedUserId;
  order.cancelReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'لغو توسط کاربر';
  saveDb();
  res.json({ success: true, order });
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

  const order = db.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });

  if (order.status !== 'ACCEPTED') {
    return res.status(400).json({ success: false, message: 'فقط سفارش‌های پذیرفته‌شده قابل تکمیل هستند.' });
  }

  if (order.cleanerId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'فقط متخصص پذیرنده می‌تواند این سفارش را تکمیل کند.' });
  }

  const cleaner = authUser;
  if (!cleaner || (cleaner.status !== 'APPROVED' && cleaner.status !== 'ACTIVE')) {
    return res.status(403).json({ success: false, message: 'حساب متخصص شما هنوز تایید نشده است.' });
  }

  order.status = 'COMPLETED';
  order.completedAt = new Date().toISOString();
  order.cleanerId = cleaner.id;
  order.cleanerName = cleaner.name;
  order.cleanerAvatar = cleaner.avatar;
  order.cleanerPhone = cleaner.phone || '';

  saveDb();
  res.json({ success: true, order });
});

app.put('/api/orders/:orderId/rate', (req, res) => {
  const authUser = requireUser(req, res);
  if (!authUser) return;
  if (authUser.role !== 'CUSTOMER') {
    return res.status(403).json({ success: false, message: 'فقط مشتری صاحب سفارش می‌تواند امتیاز بدهد.' });
  }
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });
  if (order.customerId !== authUser.id) {
    return res.status(403).json({ success: false, message: 'امتیازدهی به سفارش دیگران مجاز نیست.' });
  }
  if (order.status !== 'COMPLETED') {
    return res.status(400).json({ success: false, message: 'فقط سفارش تکمیل‌شده قابل امتیازدهی است.' });
  }
  if (order.ratings && order.ratings.customerRating) {
    return res.status(400).json({ success: false, message: 'برای این سفارش قبلاً امتیاز ثبت شده است.' });
  }
  const rating = Number(req.body && req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'امتیاز باید عدد صحیح بین ۱ تا ۵ باشد.' });
  }
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 400) : '';
  const tags = Array.isArray(req.body?.tags)
    ? req.body.tags.slice(0, 8).map(t => String(t).slice(0, 40))
    : [];
  order.ratings = {
    customerRating: rating,
    customerComment: comment,
    customerTags: tags,
    ratedAt: new Date().toISOString()
  };
  saveDb();
  res.json({ success: true, order });
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

app.use('/api/admin', requireAdmin);

app.get('/api/admin/stats', (req, res) => {
  const customers = db.users.filter(u => u.role === 'CUSTOMER');
  const workers = db.users.filter(u => u.role === 'WORKER');
  const pendingWorkers = db.users.filter(u => u.role === 'WORKER' && u.status === 'PENDING_VERIFICATION');
  const completedOrders = db.orders.filter(o => o.status === 'COMPLETED');
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.price || 0), 0);

  res.json({
    success: true,
    stats: {
      totalCustomers: customers.length,
      totalWorkers: workers.length,
      pendingWorkersCount: pendingWorkers.length,
      totalOrders: db.orders.length,
      pendingOrdersCount: db.orders.filter(o => o.status === 'PENDING').length,
      acceptedOrdersCount: db.orders.filter(o => o.status === 'ACCEPTED').length,
      completedOrdersCount: completedOrders.length,
      totalRevenue
    }
  });
});

app.get('/api/admin/users', (req, res) => {
  const { role } = req.query;
  let result = db.users;
  if (role) {
    result = result.filter(u => u.role === role);
  }
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

  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });

  user.status = status;
  saveDb();

  res.json({ success: true, user: adminUserView(user), message: `وضعیت کاربر به ${status} تغییر یافت.` });
});

app.put('/api/admin/approve-worker/:userId', (req, res) => {
  const { userId } = req.params;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });
  if (user.role !== 'WORKER') {
    return res.status(400).json({ success: false, message: 'این کاربر متخصص نیست.' });
  }

  user.status = 'APPROVED';
  saveDb();

  res.json({ success: true, user: adminUserView(user), message: 'متخصص با موفقیت تایید شد.' });
});

app.get('/api/admin/orders', (req, res) => {
  res.json({ success: true, orders: db.orders });
});

app.put('/api/admin/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const { status, cleanerId } = req.body || {};

  const order = db.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });

  if (cleanerId) {
    const cleaner = db.users.find(u => u.id === cleanerId && u.role === 'WORKER');
    if (!cleaner) {
      return res.status(400).json({ success: false, message: 'متخصص معتبر یافت نشد.' });
    }
    if (cleaner.status !== 'APPROVED' && cleaner.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'متخصص هنوز تایید نشده است.' });
    }
    order.cleanerId = cleanerId;
    order.cleanerName = cleaner.name;
    order.cleanerAvatar = cleaner.avatar;
    order.cleanerPhone = cleaner.phone || '';
    if (!status || status === 'ACCEPTED') {
      order.status = 'ACCEPTED';
    }
  }
  if (status) {
    if (!ADMIN_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'وضعیت سفارش معتبر نیست.',
        allowed: ADMIN_ORDER_STATUSES
      });
    }
    order.status = status;
    if (status === 'COMPLETED' && !order.completedAt) {
      order.completedAt = new Date().toISOString();
    }
  }

  saveDb();
  res.json({ success: true, order });
});

app.delete('/api/admin/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const index = db.orders.findIndex(o => o.id === orderId);
  if (index === -1) return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });

  db.orders.splice(index, 1);
  saveDb();
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Paksho Secure Backend & Admin Dashboard running on http://0.0.0.0:${PORT}`);
});
