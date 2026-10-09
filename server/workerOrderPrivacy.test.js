const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-worker-privacy-'));
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
process.env.NODE_ENV = 'test';

const { app, store } = require('./index.js');
after(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const CUSTOMER_PHONE = '09121234567';
const FULL_ADDRESS = 'سعادت‌آباد، خیابان سرو غربی، کوچه ۵، پلاک ۱۲، واحد ۳';
const ADDRESS_NOTE = 'کد درب ۴۴۵۵';
const NOTE_PHONE_ASCII = '09351112233';
const NOTE_PHONE_FA = '۰۹۳۶۲۲۲۳۳۴۴';
const ORDER_NOTE = 'لطفاً وسایل نظافت همراه داشته باشید؛ تماس ' + NOTE_PHONE_ASCII + ' یا ' + NOTE_PHONE_FA;

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
            text: buf.toString('utf8'),
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
  const verified = await request(server, {
    method: 'POST',
    pathname: '/api/auth/verify-otp',
    body: { phone, code: store.getOtp(phone).code, role },
  });
  assert.equal(verified.status, 200);
  return verified.json;
}

async function approvedWorker(server, phone, adminToken) {
  const worker = await login(server, phone, 'WORKER');
  const onboard = await request(server, {
    method: 'PUT',
    pathname: '/api/users/worker-onboarding',
    token: worker.token,
    body: {
      name: 'متخصص ' + phone.slice(-2),
      nationalId: '1098765432',
      birthDate: '1368/05/12',
      address: 'تهران',
      city: 'تهران',
      bankSheba: 'IR120000000000000000000000',
      idDocFile: { mimeType: 'image/jpeg', data: jpeg.toString('base64') },
    },
  });
  assert.equal(onboard.status, 200);
  const approved = await request(server, {
    method: 'PUT',
    pathname: '/api/admin/approve-worker/' + worker.user.id,
    token: adminToken,
  });
  assert.equal(approved.status, 200);
  return worker;
}

async function createOrder(server, token, overrides = {}) {
  const created = await request(server, {
    method: 'POST',
    pathname: '/api/orders',
    token,
    body: {
      serviceTitle: 'نظافت منزل',
      serviceId: 'home_unit_cleaning',
      customerName: 'گیرنده خصوصی',
      customerPhone: CUSTOMER_PHONE,
      durationHours: 4,
      serviceOptions: { rooms: 2 },
      addressNotes: ADDRESS_NOTE,
      address: FULL_ADDRESS,
      date: 'مهر 20',
      time: '10:00 - 14:00',
      price: 800000,
      notes: ORDER_NOTE,
      ...overrides,
    },
  });
  assert.equal(created.status, 200);
  return created.json.order;
}

function assertNoPrivateCustomerData(order, label) {
  assert.equal(order.customerPhone, '', label + ': customerPhone');
  assert.equal(order.customerAvatar, '', label + ': customerAvatar');
  assert.equal(order.addressNotes, null, label + ': addressNotes');
  assert.equal(order.address, 'سعادت‌آباد', label + ': address reduced to area');
  assert.equal(order.area, 'سعادت‌آباد', label + ': area');
  const raw = JSON.stringify(order);
  assert.equal(raw.includes(CUSTOMER_PHONE), false, label + ': phone digits leaked');
  assert.equal(raw.includes('پلاک'), false, label + ': plaque leaked');
  assert.equal(raw.includes('کوچه'), false, label + ': street detail leaked');
  assert.equal(raw.includes(ADDRESS_NOTE), false, label + ': address note leaked');
}

test('worker order views hide customer contact data until an active accept', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  assert.equal(admin.status, 200);
  const adminToken = admin.json.token;

  const customer = await login(server, '09130000071', 'CUSTOMER');
  const workerA = await approvedWorker(server, '09130000072', adminToken);
  const workerB = await approvedWorker(server, '09130000073', adminToken);

  // --- available list redaction ---
  const order = await createOrder(server, customer.token);
  const numbered = await createOrder(server, customer.token, { address: 'خیابان آزادی پلاک ۲۰' });
  const available = await request(server, { pathname: '/api/orders/available', token: workerA.token });
  assert.equal(available.status, 200);
  const open = available.json.orders.find((item) => item.id === order.id);
  assert.ok(open, 'pending order is listed');
  assert.equal(open.status, 'PENDING');
  assert.equal(open.customerName, '');
  assert.equal(Object.hasOwn(open, 'customerId'), false);
  assert.equal(open.serviceId, 'home_unit_cleaning');
  assert.equal(open.serviceTitle, 'نظافت منزل');
  assert.equal(open.price, 800000);
  assert.equal(open.durationHours, 4);
  assert.deepEqual(open.serviceOptions, { rooms: 2 });
  assert.equal(open.date, 'مهر 20');
  assert.equal(open.time, '10:00 - 14:00');
  assert.equal(Object.hasOwn(open, 'notes'), false, 'customer free-text notes are not sent before accept');
  assert.equal(available.text.includes(NOTE_PHONE_ASCII), false, 'phone typed in notes leaked (ascii)');
  assert.equal(available.text.includes(NOTE_PHONE_FA), false, 'phone typed in notes leaked (persian digits)');
  assert.equal(available.text.includes('وسایل نظافت'), false, 'notes text leaked');
  assertNoPrivateCustomerData(open, 'available');
  assert.equal(available.text.includes(CUSTOMER_PHONE), false);
  assert.equal(available.text.includes('گیرنده خصوصی'), false);
  const numberedOpen = available.json.orders.find((item) => item.id === numbered.id);
  assert.equal(numberedOpen.area, '', 'an address segment with digits is never sent as area');
  assert.equal(numberedOpen.address, '');

  // --- accept returns the full order to the accepting worker only ---
  const accepted = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.id + '/accept',
    token: workerA.token,
    body: {},
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.order.status, 'ACCEPTED');
  assert.equal(accepted.json.order.customerPhone, CUSTOMER_PHONE);
  assert.equal(accepted.json.order.address, FULL_ADDRESS);
  assert.equal(Object.hasOwn(accepted.json.order, 'notes'), false, 'customer free-text notes are not in the accept response');
  assert.equal(accepted.text.includes('وسایل نظافت'), false, 'accept response: notes text');

  const takenByOther = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.id + '/accept',
    token: workerB.token,
    body: {},
  });
  assert.equal(takenByOther.status, 400);
  assert.equal(takenByOther.json.success, false);
  assert.equal(takenByOther.json.message, 'این سفارش قبلاً توسط متخصص دیگری پذیرفته شده است.');
  assert.equal(takenByOther.text.includes(CUSTOMER_PHONE), false);

  // the other worker never sees this order in its own list
  const otherList = await request(server, { pathname: '/api/orders', token: workerB.token });
  assert.equal(otherList.status, 200);
  assert.equal(otherList.json.orders.some((item) => item.id === order.id), false);
  assert.equal(otherList.text.includes(CUSTOMER_PHONE), false);

  const acceptedTwice = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.id + '/accept',
    token: workerA.token,
    body: {},
  });
  assert.equal(acceptedTwice.status, 400);
  assert.equal(acceptedTwice.json.message, 'این سفارش قبلاً توسط شما پذیرفته شده است.');

  // --- worker GET /orders: active job carries contact data ---
  let mine = await request(server, { pathname: '/api/orders', token: workerA.token });
  assert.equal(mine.status, 200);
  let job = mine.json.orders.find((item) => item.id === order.id);
  assert.equal(job.status, 'ACCEPTED');
  assert.equal(job.customerPhone, CUSTOMER_PHONE);
  assert.equal(job.address, FULL_ADDRESS);
  assert.equal(job.addressNotes, ADDRESS_NOTE);
  assert.equal(Object.hasOwn(job, 'notes'), false, 'customer free-text notes are not in the worker work view');
  assert.equal(mine.text.includes('وسایل نظافت'), false, 'worker list: notes text');
  assert.equal(job.area, 'سعادت‌آباد');

  // admin-set active statuses also keep contact data for the assigned worker
  for (const status of ['IN_PROGRESS', 'CONFIRMED', 'ASSIGNED']) {
    const set = await request(server, {
      method: 'PUT',
      pathname: '/api/admin/orders/' + order.id,
      token: adminToken,
      body: { status },
    });
    assert.equal(set.status, 200);
    mine = await request(server, { pathname: '/api/orders', token: workerA.token });
    job = mine.json.orders.find((item) => item.id === order.id);
    assert.equal(job.status, status);
    assert.equal(job.customerPhone, CUSTOMER_PHONE, status + ' keeps phone');
    assert.equal(job.address, FULL_ADDRESS, status + ' keeps address');
  }
  const back = await request(server, {
    method: 'PUT',
    pathname: '/api/admin/orders/' + order.id,
    token: adminToken,
    body: { status: 'ACCEPTED' },
  });
  assert.equal(back.status, 200);

  // --- customer cancels: phone and precise address disappear for the worker ---
  const cancelled = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.id + '/cancel',
    token: customer.token,
    body: { reason: 'تست' },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.order.customerPhone, CUSTOMER_PHONE, 'customer route unchanged');
  mine = await request(server, { pathname: '/api/orders', token: workerA.token });
  job = mine.json.orders.find((item) => item.id === order.id);
  assert.equal(job.status, 'CANCELLED');
  assertNoPrivateCustomerData(job, 'cancelled');
  assert.equal(mine.text.includes(CUSTOMER_PHONE), false);

  // the customer's own list still has everything
  const customerList = await request(server, { pathname: '/api/orders', token: customer.token });
  const customerView = customerList.json.orders.find((item) => item.id === order.id);
  assert.equal(customerView.customerPhone, CUSTOMER_PHONE);
  assert.equal(customerView.address, FULL_ADDRESS);

  // --- completed job: phone and precise address disappear too ---
  const done = await createOrder(server, customer.token);
  const acceptDone = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + done.id + '/accept',
    token: workerA.token,
    body: {},
  });
  assert.equal(acceptDone.status, 200);
  const completed = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + done.id + '/complete',
    token: workerA.token,
    body: {},
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.json.order.status, 'COMPLETED');
  assertNoPrivateCustomerData(completed.json.order, 'complete response');
  assert.equal(completed.text.includes(CUSTOMER_PHONE), false);
  mine = await request(server, { pathname: '/api/orders', token: workerA.token });
  job = mine.json.orders.find((item) => item.id === done.id);
  assert.equal(job.status, 'COMPLETED');
  assertNoPrivateCustomerData(job, 'completed');
  assert.equal(mine.text.includes(CUSTOMER_PHONE), false);

  const acceptCompleted = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + done.id + '/accept',
    token: workerB.token,
    body: {},
  });
  assert.equal(acceptCompleted.status, 400);
  assert.equal(acceptCompleted.json.message, 'این سفارش انجام شده است و دیگر قابل پذیرش نیست.');

  // --- worker notifications never carry customer contact data or notes ---
  for (const worker of [workerA, workerB]) {
    const inbox = await request(server, { pathname: '/api/notifications', token: worker.token });
    assert.equal(inbox.status, 200);
    assert.equal(inbox.text.includes(CUSTOMER_PHONE), false, 'notification: phone');
    assert.equal(inbox.text.includes('گیرنده خصوصی'), false, 'notification: customer name');
    assert.equal(inbox.text.includes('پلاک'), false, 'notification: address');
    assert.equal(inbox.text.includes(ADDRESS_NOTE), false, 'notification: address note');
    assert.equal(inbox.text.includes('وسایل نظافت'), false, 'notification: notes');
  }
});

test('accepting an order the customer already cancelled gets a distinct message', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  const customer = await login(server, '09130000081', 'CUSTOMER');
  const worker = await approvedWorker(server, '09130000082', admin.json.token);

  const order = await createOrder(server, customer.token);
  const cancelled = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.id + '/cancel',
    token: customer.token,
    body: {},
  });
  assert.equal(cancelled.status, 200);

  const available = await request(server, { pathname: '/api/orders/available', token: worker.token });
  assert.equal(available.json.orders.some((item) => item.id === order.id), false);

  const accept = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.id + '/accept',
    token: worker.token,
    body: {},
  });
  assert.equal(accept.status, 400);
  assert.equal(accept.json.success, false);
  assert.equal(accept.json.message, 'این سفارش توسط مشتری لغو شده است.');
  assert.equal(accept.text.includes(CUSTOMER_PHONE), false);
  assert.equal(store.getOrder(order.id).status, 'CANCELLED');
  assert.equal(store.getOrder(order.id).cleanerId, null);

  const mine = await request(server, { pathname: '/api/orders', token: worker.token });
  assert.equal(mine.json.orders.some((item) => item.id === order.id), false);
});

test('a malformed accept request gets a friendly JSON error without internal details', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  const customer = await login(server, '09130000091', 'CUSTOMER');
  const worker = await approvedWorker(server, '09130000092', admin.json.token);
  const order = await createOrder(server, customer.token);

  const broken = '{"cleanerId": ';
  const res = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/api/orders/' + order.id + '/accept',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(broken),
          Authorization: 'Bearer ' + worker.token,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            type: String(response.headers['content-type'] || ''),
            text: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );
    req.on('error', reject);
    req.write(broken);
    req.end();
  });
  assert.equal(res.status, 400);
  assert.ok(res.type.includes('application/json'));
  const body = JSON.parse(res.text);
  assert.equal(body.success, false);
  assert.equal(body.message, 'درخواست نامعتبر است. لطفاً دوباره تلاش کنید.');
  assert.equal(/SyntaxError|node_modules|at \S+ \(|[A-Za-z]:\\|\/server\//.test(res.text), false, 'no stack or paths');
  assert.equal(store.getOrder(order.id).status, 'PENDING', 'a broken request changes nothing');
});

test('customer free-text notes never reach the worker but stay for the customer and admin', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  const adminToken = admin.json.token;
  const customer = await login(server, '09130000101', 'CUSTOMER');
  const worker = await approvedWorker(server, '09130000102', adminToken);
  const NOTE_WORDS = 'وسایل نظافت';
  function assertNoNotes(response, label) {
    assert.equal(response.text.includes(NOTE_WORDS), false, label + ': notes text');
    assert.equal(response.text.includes(NOTE_PHONE_ASCII), false, label + ': phone typed in notes (ascii)');
    assert.equal(response.text.includes(NOTE_PHONE_FA), false, label + ': phone typed in notes (persian digits)');
    const orders = response.json.orders || (response.json.order ? [response.json.order] : []);
    for (const order of orders) assert.equal(Object.hasOwn(order, 'notes'), false, label + ': notes field');
  }

  const order = await createOrder(server, customer.token);
  assertNoNotes(await request(server, { pathname: '/api/orders/available', token: worker.token }), 'available');
  const accepted = await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/accept', token: worker.token, body: {} });
  assert.equal(accepted.status, 200);
  assertNoNotes(accepted, 'accept response');
  // اطلاعات لازم برای انجام کار بعد از پذیرش حذف نمی‌شود.
  assert.equal(accepted.json.order.customerPhone, CUSTOMER_PHONE);
  assert.equal(accepted.json.order.address, FULL_ADDRESS);
  assert.equal(accepted.json.order.addressNotes, ADDRESS_NOTE);
  assert.equal(accepted.json.order.date, 'مهر 20');
  assert.equal(accepted.json.order.time, '10:00 - 14:00');
  assert.deepEqual(accepted.json.order.serviceOptions, { rooms: 2 });
  assert.ok(accepted.json.order.acceptedAt);

  for (const status of ['ACCEPTED', 'IN_PROGRESS', 'CONFIRMED', 'ASSIGNED']) {
    if (status !== 'ACCEPTED') {
      const set = await request(server, { method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status } });
      assert.equal(set.status, 200);
    }
    const mine = await request(server, { pathname: '/api/orders', token: worker.token });
    const job = mine.json.orders.find((item) => item.id === order.id);
    assert.equal(job.status, status);
    assert.equal(job.customerPhone, CUSTOMER_PHONE, status + ' keeps phone');
    assert.equal(job.addressNotes, ADDRESS_NOTE, status + ' keeps address note');
    assertNoNotes(mine, 'worker list ' + status);
  }
  const backToAccepted = await request(server, { method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status: 'ACCEPTED' } });
  assert.equal(backToAccepted.status, 200);
  const completed = await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/complete', token: worker.token, body: {} });
  assert.equal(completed.status, 200);
  assertNoNotes(completed, 'complete response');
  assertNoNotes(await request(server, { pathname: '/api/orders', token: worker.token }), 'worker list COMPLETED');

  const cancelledOrder = await createOrder(server, customer.token);
  assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + cancelledOrder.id + '/accept', token: worker.token, body: {} })).status, 200);
  assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + cancelledOrder.id + '/cancel', token: customer.token, body: {} })).status, 200);
  assertNoNotes(await request(server, { pathname: '/api/orders', token: worker.token }), 'worker list CANCELLED');
  assertNoNotes(await request(server, { pathname: '/api/notifications', token: worker.token }), 'worker notifications');

  // مشتری و مدیر همچنان یادداشت را می‌بینند.
  const customerList = await request(server, { pathname: '/api/orders', token: customer.token });
  assert.equal(customerList.json.orders.find((item) => item.id === order.id).notes, ORDER_NOTE);
  const adminList = await request(server, { pathname: '/api/admin/orders', token: adminToken });
  assert.equal(adminList.json.orders.find((item) => item.id === order.id).notes, ORDER_NOTE);
  assert.equal(store.getOrder(order.id).notes, ORDER_NOTE, 'the note itself is kept');
});

test('the customer rating comment and tags never reach the worker (D-32) but stay for the customer and admin', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  const adminToken = admin.json.token;
  const customer = await login(server, '09130000201', 'CUSTOMER');
  const worker = await approvedWorker(server, '09130000202', adminToken);
  const COMMENT = 'نظر خصوصی مشتری درباره رفتار متخصص';
  const TAG = 'برچسب-خصوصی-مشتری';

  const order = await createOrder(server, customer.token);
  assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/accept', token: worker.token, body: {} })).status, 200);
  assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/complete', token: worker.token, body: {} })).status, 200);
  const rated = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.id + '/rate',
    token: customer.token,
    body: { rating: 4, comment: COMMENT, tags: [TAG] },
  });
  assert.equal(rated.status, 200);

  function assertNoCustomerFeedback(response, label) {
    assert.equal(response.text.includes(COMMENT), false, label + ': comment text');
    assert.equal(response.text.includes(TAG), false, label + ': tag text');
    const orders = response.json.orders || (response.json.order ? [response.json.order] : []);
    for (const item of orders) {
      if (!item.ratings) continue;
      assert.equal(Object.hasOwn(item.ratings, 'customerComment'), false, label + ': customerComment field');
      assert.equal(Object.hasOwn(item.ratings, 'customerTags'), false, label + ': customerTags field');
    }
  }

  const workerList = await request(server, { pathname: '/api/orders', token: worker.token });
  assertNoCustomerFeedback(workerList, 'worker list COMPLETED');
  assertNoCustomerFeedback(await request(server, { pathname: '/api/notifications', token: worker.token }), 'worker notifications');

  // Admin moves the rated order back to an active status: the worker view must still hide the feedback.
  const reactivated = await request(server, { method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status: 'ACCEPTED' } });
  if (reactivated.status === 200) {
    assertNoCustomerFeedback(await request(server, { pathname: '/api/orders', token: worker.token }), 'worker list ACCEPTED after rating');
  }

  // Customer and admin still see the full rating.
  const customerList = await request(server, { pathname: '/api/orders', token: customer.token });
  const own = customerList.json.orders.find((item) => item.id === order.id);
  assert.equal(own.ratings.customerComment, COMMENT);
  assert.deepEqual(own.ratings.customerTags, [TAG]);
  const adminList = await request(server, { pathname: '/api/admin/orders', token: adminToken });
  assert.equal(adminList.json.orders.find((item) => item.id === order.id).ratings.customerComment, COMMENT);
  assert.equal(store.getOrder(order.id).ratings.customerComment, COMMENT, 'the comment itself is kept');
});

test('status notifications call ACCEPTED «پذیرفته‌شده», not «در حال انجام» (E6)', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  const adminToken = admin.json.token;
  const customer = await login(server, '09130000301', 'CUSTOMER');
  const worker = await approvedWorker(server, '09130000302', adminToken);
  const order = await createOrder(server, customer.token);
  assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/accept', token: worker.token, body: {} })).status, 200);
  assert.equal((await request(server, { method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status: 'IN_PROGRESS' } })).status, 200);
  assert.equal((await request(server, { method: 'PUT', pathname: '/api/admin/orders/' + order.id, token: adminToken, body: { status: 'ACCEPTED' } })).status, 200);

  const notes = await request(server, { pathname: '/api/notifications', token: customer.token });
  const statusBodies = notes.json.notifications.filter((n) => n.orderId === order.id && n.kind === 'ORDER_STATUS').map((n) => n.body);
  assert.ok(statusBodies.some((body) => body.includes('«در حال انجام»')), 'IN_PROGRESS keeps «در حال انجام»: ' + statusBodies.join(' | '));
  assert.ok(statusBodies.some((body) => body.includes('«پذیرفته‌شده»')), 'ACCEPTED reads «پذیرفته‌شده»: ' + statusBodies.join(' | '));
});

test('admin user-status message names the status in Persian, never the raw enum (D-06)', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  const adminToken = admin.json.token;
  const worker = await login(server, '09130000141', 'WORKER');

  const expected = {
    BLOCKED: 'مسدود شده',
    ACTIVE: 'فعال',
    REJECTED: 'رد شده',
    APPROVED: 'تأیید شده',
    PENDING_VERIFICATION: 'در انتظار بررسی مدارک',
    REGISTERED: 'ثبت‌نام اولیه',
  };
  for (const [status, label] of Object.entries(expected)) {
    const res = await request(server, {
      method: 'PUT',
      pathname: '/api/admin/users/' + worker.user.id + '/status',
      token: adminToken,
      body: { status },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.message, 'وضعیت کاربر به «' + label + '» تغییر یافت.');
    assert.doesNotMatch(res.json.message, /[A-Z_]{4,}/);
  }
});

test('a blocked user gets 403 with code ACCOUNT_BLOCKED and the unchanged Persian message on every request', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  const adminToken = admin.json.token;
  const worker = await login(server, '09130000151', 'WORKER');
  const blocked = await request(server, {
    method: 'PUT',
    pathname: '/api/admin/users/' + worker.user.id + '/status',
    token: adminToken,
    body: { status: 'BLOCKED' },
  });
  assert.equal(blocked.status, 200);

  for (const pathname of ['/api/orders', '/api/orders/available', '/api/notifications']) {
    const res = await request(server, { pathname, token: worker.token });
    assert.equal(res.status, 403, pathname);
    assert.equal(res.json.code, 'ACCOUNT_BLOCKED', pathname);
    assert.equal(res.json.message, 'حساب شما مسدود شده است.', pathname);
  }
});
