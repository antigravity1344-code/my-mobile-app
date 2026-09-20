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

// ------------------- API عمومی و احراز هویت -------------------

// 1. ارسال OTP
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.trim().length < 10) {
    return res.status(400).json({ success: false, message: 'شماره همراه معتبر وارد کنید.' });
  }

  const now = Date.now();
  const existingOtp = db.otpStore[phone];

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

// 2. بررسی OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, code, role } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ success: false, message: 'شماره تلفن و کد تایید الزامی است.' });
  }

  const otpData = db.otpStore[phone];
  if (!otpData) {
    return res.status(400).json({ success: false, message: 'درخواستی برای این شماره یافت نشد.' });
  }

  if (otpData.attempts >= 3) {
    return res.status(429).json({ success: false, message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است.' });
  }

  if (code !== '1234') {
    otpData.attempts += 1;
    return res.status(400).json({ success: false, message: 'کد تایید اشتباه است.' });
  }

  delete db.otpStore[phone];

  let user = db.users.find(u => u.phone === phone && u.role === role);

  if (!user) {
    user = {
      id: 'USER-' + Date.now(),
      phone,
      role: role || 'CUSTOMER',
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

// 3. پروفایل مشتری
app.put('/api/users/customer-profile', (req, res) => {
  const { userId, name, nationalId, birthDate, address } = req.body;
  const user = db.users.find(u => u.id === userId);

  if (!user) return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });

  if (name) user.name = name;
  if (nationalId) user.nationalId = nationalId;
  if (birthDate) user.birthDate = birthDate;
  if (address) {
    user.address = address;
    if (!user.addresses) user.addresses = [];
    if (!user.addresses.includes(address)) user.addresses.push(address);
  }

  user.isProfileComplete = !!(user.name && user.nationalId);
  saveDb();

  res.json({ success: true, user });
});

// 4. آنبوردینگ متخصص
app.put('/api/users/worker-onboarding', (req, res) => {
  const { userId, name, nationalId, birthDate, avatar, idDoc, address, city, skills, bankSheba } = req.body;
  const user = db.users.find(u => u.id === userId);

  if (!user) return res.status(404).json({ success: false, message: 'متخصص یافت نشد.' });

  user.name = name || user.name;
  user.nationalId = nationalId || user.nationalId;
  user.birthDate = birthDate || user.birthDate;
  if (avatar) user.avatar = avatar;
  if (idDoc) user.idDoc = idDoc;
  user.address = address || user.address;
  user.city = city || user.city;
  user.skills = skills || user.skills;
  user.bankSheba = bankSheba || user.bankSheba;

  user.status = 'PENDING_VERIFICATION';
  user.isProfileComplete = true;

  saveDb();

  res.json({ success: true, user, message: 'مدارک شما ثبت شد و در انتظار بررسی مدیریت قرار گرفت.' });
});

// 5. سفارش جدید
app.post('/api/orders', (req, res) => {
  const { userId, customerName, customerPhone, serviceTitle, address, date, time, price, notes } = req.body;
  const user = db.users.find(u => u.id === userId);

  const newOrder = {
    id: 'ORD-' + Math.floor(100 + Math.random() * 900),
    customerId: userId,
    customerName: user ? user.name : 'کاربر مشتری',
    customerPhone: customerPhone || (user ? user.phone : '09120000000'),
    customerAvatar: user ? user.avatar : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    serviceTitle: serviceTitle || 'نظافت عادی منزل',
    address: address || 'تهران، خیابان ولیعصر',
    date: date || 'امروز',
    time: time || '14:00',
    price: price || 350000,
    notes: notes || '',
    status: 'PENDING',
    cleanerId: null,
    cleanerName: null,
    cleanerAvatar: null,
    createdAt: new Date().toISOString()
  };

  db.orders.unshift(newOrder);
  saveDb();

  res.json({ success: true, order: newOrder });
});

// 6. سفارش‌های آماده (متخصصین تایید شده)
app.get('/api/orders', (req, res) => {
  const { userId, role } = req.query;
  let userOrders = db.orders;
  
  if (role === 'CUSTOMER' && userId) {
    userOrders = db.orders.filter(o => o.customerId === userId);
  } else if (role === 'WORKER' && userId) {
    userOrders = db.orders.filter(o => o.cleanerId === userId);
  }

  res.json({ success: true, orders: userOrders });
});

app.get('/api/orders/available', (req, res) => {
  const availableOrders = db.orders.filter(o => o.status === 'PENDING');
  res.json({ success: true, orders: availableOrders });
});

// 7. پذیرش سفارش
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
    res.json({ success: true, order });
});

// تکمیل سفارش توسط متخصص پذیرنده (ACCEPTED → COMPLETED)
app.put('/api/orders/:orderId/complete', (req, res) => {
  const { orderId } = req.params;
  const { cleanerId } = req.body;

  const order = db.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });

  if (order.status !== 'ACCEPTED') {
    return res.status(400).json({ success: false, message: 'فقط سفارش‌های پذیرفته‌شده قابل تکمیل هستند.' });
  }

  if (!cleanerId || order.cleanerId !== cleanerId) {
    return res.status(403).json({ success: false, message: 'فقط متخصص پذیرنده می‌تواند این سفارش را تکمیل کند.' });
  }

  const cleaner = db.users.find(u => u.id === cleanerId);
  if (!cleaner || (cleaner.status !== 'APPROVED' && cleaner.status !== 'ACTIVE')) {
    return res.status(403).json({ success: false, message: 'حساب متخصص شما هنوز تایید نشده است.' });
  }

  order.status = 'COMPLETED';
  order.completedAt = new Date().toISOString();
  // ثبت/تأیید متخصص انجام‌دهنده
  order.cleanerId = cleanerId;
  order.cleanerName = cleaner.name;
  order.cleanerAvatar = cleaner.avatar;

  saveDb();
  res.json({ success: true, order });
});

// ------------------- API اختصاصی پنل مدیریت (ADMIN API) -------------------

// آمار کلی داشبورد ادمین
app.get('/api/admin/stats', (req, res) => {
  const customers = db.users.filter(u => u.role === 'CUSTOMER');
  const workers = db.users.filter(u => u.role === 'WORKER');
  const pendingWorkers = db.users.filter(u => u.role === 'WORKER' && u.status === 'PENDING_VERIFICATION');
  const totalRevenue = db.orders.reduce((sum, o) => sum + (o.price || 0), 0);

  res.json({
    success: true,
    stats: {
      totalCustomers: customers.length,
      totalWorkers: workers.length,
      pendingWorkersCount: pendingWorkers.length,
      totalOrders: db.orders.length,
      pendingOrdersCount: db.orders.filter(o => o.status === 'PENDING').length,
      acceptedOrdersCount: db.orders.filter(o => o.status === 'ACCEPTED').length,
      completedOrdersCount: db.orders.filter(o => o.status === 'COMPLETED').length,
      totalRevenue
    }
  });
});

// دریافت لیست کامل کاربران (مشتریان یا متخصصین)
app.get('/api/admin/users', (req, res) => {
  const { role } = req.query;
  let result = db.users;
  if (role) {
    result = result.filter(u => u.role === role);
  }
  res.json({ success: true, users: result });
});

// تغییر وضعیت کاربر / تایید مدارک متخصص / مسدودسازی
app.put('/api/admin/users/:userId/status', (req, res) => {
  const { userId } = req.params;
  const { status } = req.body; // APPROVED, REJECTED, BLOCKED, ACTIVE

  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });

  user.status = status;
  saveDb();

  res.json({ success: true, user, message: `وضعیت کاربر به ${status} تغییر یافت.` });
});

// تایید سریع متخصص (متد قدیمی برای سازگاری)
app.put('/api/admin/approve-worker/:userId', (req, res) => {
  const { userId } = req.params;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });

  user.status = 'APPROVED';
  saveDb();

  res.json({ success: true, user, message: 'متخصص با موفقیت تایید شد.' });
});

// لیست کامل سفارش‌ها جهت مدیریت
app.get('/api/admin/orders', (req, res) => {
  res.json({ success: true, orders: db.orders });
});

// تغییر وضعیت سفارش یا تخصیص دستی متخصص
app.put('/api/admin/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const { status, cleanerId } = req.body;

  const order = db.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });

  if (cleanerId) {
    const cleaner = db.users.find(u => u.id === cleanerId);
    if (cleaner) {
      order.cleanerId = cleanerId;
      order.cleanerName = cleaner.name;
      order.cleanerAvatar = cleaner.avatar;
      if (!status || status === 'ACCEPTED') {
        order.status = 'ACCEPTED';
      }
    }
  }
  if (status) {
    order.status = status;
    if (status === 'COMPLETED' && !order.completedAt) {
      order.completedAt = new Date().toISOString();
    }
  }

  saveDb();
  res.json({ success: true, order });
});

// حذف/لغو سفارش
app.delete('/api/admin/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const index = db.orders.findIndex(o => o.id === orderId);
  if (index === -1) return res.status(404).json({ success: false, message: 'سفارش یافت نشد.' });

  db.orders.splice(index, 1);
  saveDb();
  res.json({ success: true, message: 'سفارش با موفقیت لغو شد.' });
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
    async function loadAllData() {
      try {
        const statsRes = await fetch('/api/admin/stats');
        const statsData = await statsRes.json();
        if (statsData.success) {
          const s = statsData.stats;
          document.getElementById('totalOrders').innerText = s.totalOrders;
          document.getElementById('pendingWorkers').innerText = s.pendingWorkersCount;
          document.getElementById('totalWorkers').innerText = s.totalWorkers;
          document.getElementById('totalRevenue').innerText = s.totalRevenue.toLocaleString('fa-IR');
        }

        const workersRes = await fetch('/api/admin/users?role=WORKER');
        const workersData = await workersRes.json();
        if (workersData.success) renderWorkers(workersData.users);

        const ordersRes = await fetch('/api/admin/orders');
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
        headers: { 'Content-Type': 'application/json' },
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
