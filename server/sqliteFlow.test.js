const { isMainThread, workerData, parentPort, Worker } = require('node:worker_threads');

if (!isMainThread) {
  const { createDataStore } = require('./dataStore');
  const raceStore = createDataStore(workerData.sqlite);
  const result = raceStore.tryAcceptOrder(workerData.orderId, workerData.cleaner);
  raceStore.close();
  parentPort.postMessage(result.code);
} else {
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const http = require('node:http');
  const os = require('node:os');
  const path = require('node:path');
  const { createDataStore } = require('./dataStore');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-sqlite-'));
  process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
  process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
  process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
  process.env.NODE_ENV = 'test';

  const { app, store } = require('./index.js');
  const { after } = require('node:test');
  after(() => {
    store.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  function request(server, { method = 'GET', pathname, token, body }) {
    const payload = body === undefined ? null : JSON.stringify(body);
    const { port } = server.address();
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: pathname,
          method,
          headers: {
            ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            const type = String(res.headers['content-type'] || '');
            resolve({
              status: res.statusCode,
              json: type.includes('application/json') ? JSON.parse(buf.toString('utf8')) : null,
              buf,
            });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function login(server, phone, role) {
    await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone } });
    const code = store.getOtp(phone).code;
    const verified = await request(server, {
      method: 'POST',
      pathname: '/api/auth/verify-otp',
      body: { phone, code, role },
    });
    assert.equal(verified.status, 200);
    return verified.json;
  }

  test('sqlite keeps the current API behavior', async (t) => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());

    const customer = await login(server, '09130000021', 'CUSTOMER');
    const profile = await request(server, {
      method: 'PUT',
      pathname: '/api/users/customer-profile',
      token: customer.token,
      body: { name: 'مشتری آزمایشی', nationalId: '1234567890', birthDate: '1370/01/01', address: 'تهران، تست' },
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.json.user.name, 'مشتری آزمایشی');
    assert.equal(Object.hasOwn(profile.json.user, 'nationalId'), false);

    const addresses = await request(server, {
      method: 'PUT',
      pathname: '/api/users/addresses',
      token: customer.token,
      body: {
        addresses: [{ title: 'خانه', fullAddress: 'تهران، خیابان تست', isDefault: true }],
      },
    });
    assert.equal(addresses.status, 200);
    assert.equal(addresses.json.addresses.length, 1);

    const created = await request(server, {
      method: 'POST',
      pathname: '/api/orders',
      token: customer.token,
      body: {
        serviceTitle: 'نظافت',
        serviceId: 'hourly_labor',
        customerName: 'گیرنده آزمایشی',
        customerPhone: '۰۹۱۲۱۱۱۱۱۱۱',
        durationHours: 5,
        genderPreference: 'MALE',
        serviceOptions: { hours: 5, workerCount: '۲ نفر' },
        addressNotes: '  زنگ واحد ۳  ',
        recurringFrequency: 'WEEKLY',
        customerTier: 'SILVER',
        pricing: { subtotal: 60000, total: 50000, recurringDiscountAmount: 10000 },
        address: 'تهران، تست',
        date: '1405/01/01',
        time: '10:00',
        price: 50000,
        notes: '  لطفاً قبل از ورود تماس بگیرید  ',
      },
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.order.status, 'PENDING');
    assert.equal(created.json.order.notes, 'لطفاً قبل از ورود تماس بگیرید');
    assert.equal(created.json.order.serviceId, 'hourly_labor');
    assert.equal(created.json.order.customerName, 'گیرنده آزمایشی');
    assert.equal(created.json.order.customerPhone, '09121111111');
    assert.equal(created.json.order.durationHours, 5);
    assert.equal(created.json.order.genderPreference, 'MALE');
    assert.deepEqual(created.json.order.serviceOptions, { hours: 5, workerCount: '۲ نفر' });
    assert.equal(created.json.order.addressNotes, 'زنگ واحد ۳');
    assert.equal(created.json.order.recurringFrequency, 'WEEKLY');
    assert.equal(created.json.order.customerTier, 'SILVER');
    assert.equal(created.json.order.pricing.total, 50000);
    assert.equal(created.json.order.pricing.subtotal, 60000);
    const orderId = created.json.order.id;
    const listed = await request(server, { pathname: '/api/orders', token: customer.token });
    assert.equal(listed.status, 200);
    const listedOrder = listed.json.orders.find((order) => order.id === orderId);
    assert.equal(listedOrder.notes, 'لطفاً قبل از ورود تماس بگیرید');
    assert.equal(listedOrder.serviceId, 'hourly_labor');
    assert.equal(listedOrder.durationHours, 5);
    assert.equal(listedOrder.addressNotes, 'زنگ واحد ۳');
    assert.deepEqual(listedOrder.serviceOptions, { hours: 5, workerCount: '۲ نفر' });

    const worker = await login(server, '09130000022', 'WORKER');
    const onboard = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: worker.token,
      body: {
        name: 'متخصص آزمایشی',
        nationalId: '1098765432',
        birthDate: '1368/05/12',
        address: 'تهران',
        city: 'تهران',
        bankSheba: 'IR120000000000000000000000',
        idDocFile: { mimeType: 'image/jpeg', data: jpeg.toString('base64') },
      },
    });
    assert.equal(onboard.status, 200);
    assert.equal(onboard.json.user.status, 'PENDING_VERIFICATION');
    assert.equal(Object.hasOwn(onboard.json.user, 'idDoc'), false);

    const admin = await request(server, {
      method: 'POST',
      pathname: '/api/admin/login',
      body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
    });
    const approved = await request(server, {
      method: 'PUT',
      pathname: '/api/admin/approve-worker/' + worker.user.id,
      token: admin.json.token,
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.user.status, 'APPROVED');

    const workerAgain = await login(server, '09130000022', 'WORKER');
    const openOrders = await request(server, {
      pathname: '/api/orders/available',
      token: workerAgain.token,
    });
    assert.equal(openOrders.status, 200);
    const visible = openOrders.json.orders.find((order) => order.id === orderId);
    assert.equal(visible.customerPhone, '');
    assert.equal(visible.durationHours, 5);
    assert.equal(visible.serviceId, 'hourly_labor');

    const accepted = await request(server, {
      method: 'PUT',
      pathname: '/api/orders/' + orderId + '/accept',
      token: workerAgain.token,
      body: {},
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.json.order.status, 'ACCEPTED');
    assert.equal(accepted.json.order.serviceId, 'hourly_labor');
    assert.equal(accepted.json.order.customerPhone, '09121111111');
    assert.equal(accepted.json.order.durationHours, 5);

    const completed = await request(server, {
      method: 'PUT',
      pathname: '/api/orders/' + orderId + '/complete',
      token: workerAgain.token,
      body: {},
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.json.order.status, 'COMPLETED');

    const rated = await request(server, {
      method: 'PUT',
      pathname: '/api/orders/' + orderId + '/rate',
      token: customer.token,
      body: { rating: 5, comment: 'خوب', tags: ['دقت'] },
    });
    assert.equal(rated.status, 200);
    assert.equal(rated.json.order.ratings.customerRating, 5);
    assert.equal(rated.json.order.ratings.cleanerId, worker.user.id);

    const duplicate = await request(server, {
      method: 'PUT',
      pathname: '/api/orders/' + orderId + '/rate',
      token: customer.token,
      body: { rating: 4 },
    });
    assert.equal(duplicate.status, 400);

    const second = await request(server, {
      method: 'POST',
      pathname: '/api/orders',
      token: customer.token,
      body: { serviceTitle: 'لغو', address: 'تهران، تست', date: '1405/01/02', time: '11:00', price: 60000 },
    });
    assert.equal(second.status, 200);
    assert.equal(second.json.order.serviceId, null);
    assert.equal(second.json.order.durationHours, null);
    assert.equal(second.json.order.genderPreference, null);
    assert.equal(second.json.order.serviceOptions, null);
    assert.equal(second.json.order.addressNotes, null);
    assert.equal(second.json.order.recurringFrequency, null);
    assert.equal(second.json.order.pricing, null);
    const cancelled = await request(server, {
      method: 'PUT',
      pathname: '/api/orders/' + second.json.order.id + '/cancel',
      token: customer.token,
      body: { reason: 'انصراف' },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.order.status, 'CANCELLED');
    assert.equal(cancelled.json.order.serviceId, null);

    const stats = await request(server, { pathname: '/api/admin/stats', token: admin.json.token });
    assert.equal(stats.status, 200);
    assert.equal(stats.json.stats.totalCustomers >= 1, true);
    const hidden = await request(server, { pathname: '/data/paksho.sqlite' });
    assert.equal(hidden.status, 404);
    assert.equal(hidden.buf.includes(Buffer.from('SQLite format')), false);
  });

  test('data survives closing and reopening sqlite', () => {
    const file = path.join(tmp, 'restart.sqlite');
    const first = createDataStore(file);
    first.createUser({
      id: 'USER-RESTART',
      phone: '09130000023',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      isProfileComplete: true,
      name: 'پایدار',
      nationalId: '',
      birthDate: '',
      avatar: '',
      address: '',
      city: 'تهران',
      skills: [],
      bankSheba: '',
      idDoc: '',
      addresses: [],
      savedAddresses: [],
      createdAt: new Date().toISOString(),
    });
    first.close();
    const second = createDataStore(file);
    assert.equal(second.getUser('USER-RESTART').name, 'پایدار');
    second.close();
  });

  test('two concurrent accepts leave one accepted order', async () => {
    const file = path.join(tmp, 'race.sqlite');
    const setup = createDataStore(file);
    const order = setup.createOrder({
      id: 'ORD-RACE',
      customerId: 'USER-RACE',
      customerName: 'مشتری',
      customerPhone: '09130000024',
      serviceTitle: 'هم‌زمان',
      address: 'تهران',
      date: '1405/01/01',
      time: '12:00',
      price: 50000,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    setup.close();
    const run = (id) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: {
            sqlite: file,
            orderId: order.id,
            cleaner: { id, name: id, avatar: '', phone: '09120000000' },
          },
        });
        worker.on('message', resolve);
        worker.on('error', reject);
      });
    const results = await Promise.all([run('WORKER-A'), run('WORKER-B')]);
    assert.deepEqual(results.sort(), ['conflict', 'ok']);
    const check = createDataStore(file);
    const saved = check.getOrder(order.id);
    assert.equal(saved.status, 'ACCEPTED');
    assert.equal(['WORKER-A', 'WORKER-B'].includes(saved.cleanerId), true);
    check.close();
  });

  test('an older orders table gains a null serviceId and still stores new values', () => {
    const { DatabaseSync } = require('node:sqlite');
    const file = path.join(tmp, 'legacy.sqlite');
    const legacy = new DatabaseSync(file);
    legacy.exec(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL,
        customerName TEXT NOT NULL,
        customerPhone TEXT NOT NULL,
        customerAvatar TEXT,
        serviceTitle TEXT NOT NULL,
        address TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        price INTEGER NOT NULL,
        notes TEXT,
        status TEXT NOT NULL,
        paymentStatus TEXT,
        paymentMethod TEXT,
        cleanerId TEXT,
        cleanerName TEXT,
        cleanerAvatar TEXT,
        cleanerPhone TEXT,
        ratingsJson TEXT,
        createdAt TEXT NOT NULL,
        completedAt TEXT,
        cancelledAt TEXT,
        cancelledBy TEXT,
        cancelReason TEXT,
        seq INTEGER NOT NULL
      );
    `);
    legacy.prepare(`
      INSERT INTO orders (
        id, customerId, customerName, customerPhone, serviceTitle, address, date, time, price, status, createdAt, seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'ORD-OLD',
      'USER-OLD',
      'مشتری قدیمی',
      '09120000000',
      'نظافت',
      'تهران',
      '1404/01/01',
      '09:00',
      40000,
      'PENDING',
      '2026-01-01T00:00:00.000Z',
      1
    );
    legacy.close();

    const migrated = createDataStore(file);
    const oldOrder = migrated.getOrder('ORD-OLD');
    assert.equal(oldOrder.serviceTitle, 'نظافت');
    assert.equal(oldOrder.serviceId, null);
    assert.equal(oldOrder.durationHours, null);
    assert.equal(oldOrder.genderPreference, null);
    assert.equal(oldOrder.serviceOptions, null);
    assert.equal(oldOrder.addressNotes, null);
    assert.equal(oldOrder.recurringFrequency, null);
    assert.equal(oldOrder.pricing, null);
    const created = migrated.createOrder({
      id: 'ORD-NEW',
      customerId: 'USER-OLD',
      customerName: 'مشتری قدیمی',
      customerPhone: '09120000000',
      serviceTitle: 'کارگر ساعتی',
      serviceId: 'hourly_labor',
      address: 'تهران',
      date: '1405/01/01',
      time: '10:00',
      price: 50000,
      status: 'PENDING',
      createdAt: '2026-02-01T00:00:00.000Z',
    });
    assert.equal(created.serviceId, 'hourly_labor');
    const plain = migrated.createOrder({
      id: 'ORD-PLAIN',
      customerId: 'USER-OLD',
      customerName: 'مشتری قدیمی',
      customerPhone: '09120000000',
      serviceTitle: 'بدون شناسه',
      address: 'تهران',
      date: '1405/01/02',
      time: '11:00',
      price: 50000,
      status: 'PENDING',
      createdAt: '2026-02-02T00:00:00.000Z',
    });
    assert.equal(plain.serviceId, null);
    assert.equal(migrated.getOrder('ORD-OLD').serviceId, null);
    assert.equal(migrated.getOrder('ORD-NEW').serviceId, 'hourly_labor');
    migrated.close();
  });
}
