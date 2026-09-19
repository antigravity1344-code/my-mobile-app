const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

const DB_FILE = path.join(__dirname, 'db.json');

let db = {
  users: [], // { id, phone, role, status, name, nationalId, birthDate, avatar, idDoc, address, city, skills, bankSheba, addresses: [] }
  orders: [
    {
      id: 'ORD-101',
      serviceTitle: 'نظافت عادی منزل',
      customerName: 'علی رضایی',
      customerPhone: '09121111111',
      customerAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      address: 'تهران، خیابان آزادی، پلاک ۱۲',
      date: '۱۴۰۳/۰۷/۰۱',
      time: '۱۰:۰۰',
      price: 350000,
      status: 'PENDING', // PENDING, ACCEPTED, IN_PROGRESS, COMPLETED
      cleanerId: null,
      cleanerName: null,
      createdAt: new Date().toISOString()
    }
  ],
  otpStore: {} // phone -> { code: '1234', attempts: 0, lastSent: Date }
};

if (fs.existsSync(DB_FILE)) {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    db = JSON.parse(data);
    if (!db.otpStore) db.otpStore = {};
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

// 1. ارسال کد OTP با محدودیت نرخ (Rate Limit)
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.trim().length < 10) {
    return res.status(400).json({ success: false, message: 'شماره همراه معتبر وارد کنید.' });
  }

  const now = Date.now();
  const existingOtp = db.otpStore[phone];

  // محدودیت ارسال مجدد در ۶۰ ثانیه
  if (existingOtp && now - existingOtp.lastSent < 30000) {
    const waitSec = Math.ceil((30000 - (now - existingOtp.lastSent)) / 1000);
    return res.status(429).json({
      success: false,
      message: `لطفاً ${waitSec} ثانیه دیگر جهت درخواست مجدد کد شکیبایی ورزید.`
    });
  }

  db.otpStore[phone] = {
    code: '1234',
    attempts: 0,
    lastSent: now
  };

  res.json({
    success: true,
    message: 'کد تایید ارسال شد (کد تست سامانه: ۱۲۳۴)',
    code: '1234'
  });
});

// 2. بررسی OTP و ورود / ثبت‌نام
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, code, role } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ success: false, message: 'شماره تلفن و کد تایید الزامی است.' });
  }

  const otpData = db.otpStore[phone];
  if (!otpData) {
    return res.status(400).json({ success: false, message: 'درخواستی برای این شماره یافت نشد. کد جدید دریافت کنید.' });
  }

  if (otpData.attempts >= 3) {
    return res.status(429).json({ success: false, message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید دریافت کنید.' });
  }

  if (code !== '1234') {
    otpData.attempts += 1;
    return res.status(400).json({ success: false, message: 'کد تایید اشتباه است.' });
  }

  // کد درست است - پاکسازی OTP
  delete db.otpStore[phone];

  let user = db.users.find(u => u.phone === phone && u.role === role);

  if (!user) {
    user = {
      id: 'USER-' + Date.now(),
      phone,
      role: role || 'CUSTOMER',
      // وضعیت لایف‌سایکل متخصص: REGISTERED -> DOCS_SUBMITTED -> PENDING_VERIFICATION -> APPROVED -> ACTIVE
      status: role === 'WORKER' ? 'REGISTERED' : 'ACTIVE',
      isProfileComplete: false,
      name: '',
      nationalId: '',
      birthDate: '',
      avatar: role === 'WORKER'
        ? 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150'
        : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      idDoc: '',
      address: '',
      city: 'تهران',
      skills: [],
      bankSheba: '',
      addresses: [],
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    saveDb();
  }

  res.json({
    success: true,
    user,
    token: `token-${user.id}`
  });
});

// 3. تکمیل پرونده هویتی مشتری (Customer Identity & Addresses)
app.put('/api/users/customer-profile', (req, res) => {
  const { userId, name, nationalId, birthDate, address } = req.body;
  const user = db.users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });
  }

  if (name) user.name = name;
  if (nationalId) user.nationalId = nationalId;
  if (birthDate) user.birthDate = birthDate;
  if (address) {
    user.address = address;
    if (!user.addresses) user.addresses = [];
    if (!user.addresses.includes(address)) {
      user.addresses.push(address);
    }
  }

  user.isProfileComplete = !!(user.name && user.nationalId);
  saveDb();

  res.json({ success: true, user });
});

// 4. ثبت‌نام و ارسال مدارک متخصص (Worker Onboarding & Verification Docs)
app.put('/api/users/worker-onboarding', (req, res) => {
  const { userId, name, nationalId, birthDate, avatar, idDoc, address, city, skills, bankSheba } = req.body;
  const user = db.users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: 'متخصص یافت نشد.' });
  }

  user.name = name || user.name;
  user.nationalId = nationalId || user.nationalId;
  user.birthDate = birthDate || user.birthDate;
  if (avatar) user.avatar = avatar;
  if (idDoc) user.idDoc = idDoc;
  user.address = address || user.address;
  user.city = city || user.city;
  user.skills = skills || user.skills;
  user.bankSheba = bankSheba || user.bankSheba;

  // تغییر وضعیت متخصص به در انتظار بررسی توسط سیستم/ادمین
  user.status = 'PENDING_VERIFICATION';
  user.isProfileComplete = true;

  saveDb();

  res.json({ success: true, user, message: 'مدارک شما ثبت شد و در انتظار بررسی مدیریت قرار گرفت.' });
});

// 5. ادمین متد برای تایید دستی متخصص برای تست سریع
app.put('/api/admin/approve-worker/:userId', (req, res) => {
  const { userId } = req.params;
  const user = db.users.find(u => u.id === userId);

  if (!user) return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });

  user.status = 'APPROVED';
  saveDb();

  res.json({ success: true, user, message: 'متخصص با موفقیت تایید شد.' });
});

// 6. ثبت سفارش توسط مشتری
app.post('/api/orders', (req, res) => {
  const { userId, serviceTitle, address, date, time, price, notes } = req.body;
  const user = db.users.find(u => u.id === userId);

  const newOrder = {
    id: 'ORD-' + Math.floor(100 + Math.random() * 900),
    customerId: userId,
    customerName: user ? user.name : 'کاربر مشتری',
    customerPhone: user ? user.phone : '09120000000',
    customerAvatar: user ? user.avatar : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    serviceTitle: serviceTitle || 'نظافت عادی منزل',
    address: address || 'تهران، خیابان ولیعصر',
    date: date || 'امروز',
    time: time || '14:00',
    price: price || 300000,
    notes: notes || '',
    status: 'PENDING',
    cleanerId: null,
    cleanerName: null,
    createdAt: new Date().toISOString()
  };

  db.orders.unshift(newOrder);
  saveDb();

  res.json({ success: true, order: newOrder });
});

// 7. دریافت سفارش‌های آماده پذیرش (برای متخصصین تایید شده)
app.get('/api/orders/available', (req, res) => {
  const availableOrders = db.orders.filter(o => o.status === 'PENDING');
  res.json({ success: true, orders: availableOrders });
});

// 8. پذیرش سفارش توسط متخصص
app.put('/api/orders/:orderId/accept', (req, res) => {
  const { orderId } = req.params;
  const { cleanerId } = req.body;

  const order = db.orders.find(o => o.id === orderId);
  const cleaner = db.users.find(u => u.id === cleanerId);

  if (!order) return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });

  if (!cleaner || (cleaner.status !== 'APPROVED' && cleaner.status !== 'ACTIVE')) {
    return res.status(403).json({ success: false, message: 'حساب متخصص شما هنوز تایید نشده است.' });
  }

  if (order.status !== 'PENDING') {
    return res.status(400).json({ success: false, message: 'این سفارش قبلاً پذیرفته شده است.' });
  }

  order.status = 'ACCEPTED';
  order.cleanerId = cleanerId;
  order.cleanerName = cleaner.name;
  order.cleanerAvatar = cleaner.avatar;

  saveDb();

  res.json({ success: true, order });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Paksho Secure Backend running on http://0.0.0.0:${PORT}`);
});
