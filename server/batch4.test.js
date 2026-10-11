const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-batch4-'));
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

const WORKER_PHONE = '09130000082';

async function setup(t) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const admin = await request(server, {
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
  });
  assert.equal(admin.status, 200);
  return { server, adminToken: admin.json.token };
}

function adminSet(server, adminToken, orderId, body) {
  return request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body });
}

test('batch4 #1: no customer-facing order response carries the specialist phone', async (t) => {
  const { server, adminToken } = await setup(t);
  const customer = await login(server, '09130000081', 'CUSTOMER');
  const worker = await approvedWorker(server, WORKER_PHONE, adminToken);
  const order = await createOrder(server, customer.token);
  const accepted = await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/accept', token: worker.token, body: {} });
  assert.equal(accepted.status, 200);
  assert.equal(store.getOrder(order.id).cleanerPhone, WORKER_PHONE, 'stored for admin');

  const list = await request(server, { pathname: '/api/orders', token: customer.token });
  assert.equal(list.status, 200);
  assert.equal(list.text.includes(WORKER_PHONE), false, 'customer list leaks specialist phone');
  const mine = list.json.orders.find((o) => o.id === order.id);
  assert.equal(Object.hasOwn(mine, 'cleanerPhone'), false);
  assert.equal(mine.cleanerName, store.getOrder(order.id).cleanerName, 'name still shown');

  const cancelled = await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/cancel', token: customer.token, body: { reason: 'تست' } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.text.includes(WORKER_PHONE), false, 'cancel response leaks specialist phone');

  const done = await createOrder(server, customer.token);
  await request(server, { method: 'PUT', pathname: '/api/orders/' + done.id + '/accept', token: worker.token, body: {} });
  await request(server, { method: 'PUT', pathname: '/api/orders/' + done.id + '/complete', token: worker.token, body: {} });
  const rated = await request(server, { method: 'PUT', pathname: '/api/orders/' + done.id + '/rate', token: customer.token, body: { rating: 5 } });
  assert.equal(rated.status, 200);
  assert.equal(rated.text.includes(WORKER_PHONE), false, 'rate response leaks specialist phone');

  const adminList = await request(server, { pathname: '/api/admin/orders', token: adminToken });
  assert.equal(adminList.text.includes(WORKER_PHONE), true, 'admin keeps the phone');
});

test('batch4 #2: admin cancel records cancelledAt/cancelledBy=admin; CANCELLED -> COMPLETED is blocked', async (t) => {
  const { server, adminToken } = await setup(t);
  const customer = await login(server, '09130000083', 'CUSTOMER');
  const worker = await approvedWorker(server, '09130000084', adminToken);
  const order = await createOrder(server, customer.token);
  await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/accept', token: worker.token, body: {} });
  const before = Date.now();
  const cancel = await adminSet(server, adminToken, order.id, { status: 'CANCELLED' });
  assert.equal(cancel.status, 200);
  const stored = store.getOrder(order.id);
  assert.equal(stored.status, 'CANCELLED');
  assert.equal(stored.cancelledBy, 'admin');
  assert.ok(stored.cancelledAt && Date.parse(stored.cancelledAt) >= before - 1000, 'cancelledAt set');

  const complete = await adminSet(server, adminToken, order.id, { status: 'COMPLETED' });
  assert.equal(complete.status, 400);
  assert.match(complete.json.message, /لغو/);
  assert.equal(store.getOrder(order.id).status, 'CANCELLED');
  assert.equal(store.getOrder(order.id).completedAt, null);

  // a customer cancel keeps the customer as cancelledBy
  const own = await createOrder(server, customer.token);
  await request(server, { method: 'PUT', pathname: '/api/orders/' + own.id + '/cancel', token: customer.token, body: { reason: 'x' } });
  assert.equal(store.getOrder(own.id).cancelledBy, customer.user.id);
});

test('batch4 #5: a repeated create with the same client key returns the same order', async (t) => {
  const { server } = await setup(t);
  const customer = await login(server, '09130000085', 'CUSTOMER');
  const other = await login(server, '09130000086', 'CUSTOMER');
  const key = 'wiz-0123456789abcdef';
  const first = await createOrder(server, customer.token, { clientRequestId: key });
  const second = await createOrder(server, customer.token, { clientRequestId: key });
  assert.equal(second.id, first.id, 'same order returned');
  assert.equal(store.getOrders({ customerId: customer.user.id }).length, 1);
  // another customer with the same key gets a separate order
  const foreign = await createOrder(server, other.token, { clientRequestId: key });
  assert.notEqual(foreign.id, first.id);
  // no key -> old behaviour (two orders)
  await createOrder(server, customer.token);
  await createOrder(server, customer.token);
  assert.equal(store.getOrders({ customerId: customer.user.id }).length, 3);
  // malformed key -> 400, nothing created
  const bad = await request(server, { method: 'POST', pathname: '/api/orders', token: customer.token, body: { address: 'تهران', price: 800000, clientRequestId: 'bad key!' } });
  assert.equal(bad.status, 400);
  assert.equal(store.getOrders({ customerId: customer.user.id }).length, 3);
  // the key is never echoed back to other parties
  assert.equal(Object.hasOwn(first, 'clientRequestId'), false);
});

test('batch4 #6: admin return to PENDING is an event; admin acceptance records the specialist', async (t) => {
  const { server, adminToken } = await setup(t);
  const customer = await login(server, '09130000087', 'CUSTOMER');
  const worker = await approvedWorker(server, '09130000088', adminToken);
  const order = await createOrder(server, customer.token);
  const assign = await adminSet(server, adminToken, order.id, { cleanerId: worker.user.id });
  assert.equal(assign.status, 200);
  let events = store.listOrderEvents(order.id);
  const acc = events.filter((e) => e.kind === 'ORDER_ACCEPTED');
  assert.equal(acc.length, 1);
  assert.equal(acc[0].actorRole, 'admin');
  assert.equal(acc[0].workerId, worker.user.id, 'admin acceptance names the specialist');

  const back = await adminSet(server, adminToken, order.id, { status: 'PENDING' });
  assert.equal(back.status, 200);
  events = store.listOrderEvents(order.id);
  const ret = events.filter((e) => e.kind === 'ORDER_RETURNED_TO_PENDING');
  assert.equal(ret.length, 1, 'return to PENDING recorded');
  assert.equal(ret[0].actorRole, 'admin');
  assert.equal(ret[0].workerId, worker.user.id);
  assert.equal(store.getOrder(order.id).acceptedAt, null);

  // saving a PENDING order as PENDING again records nothing new
  await adminSet(server, adminToken, order.id, { status: 'PENDING' });
  assert.equal(store.listOrderEvents(order.id).filter((e) => e.kind === 'ORDER_RETURNED_TO_PENDING').length, 1);

  // worker acceptance also names the specialist; second cycle gets its own return event
  await request(server, { method: 'PUT', pathname: '/api/orders/' + order.id + '/accept', token: worker.token, body: {} });
  await adminSet(server, adminToken, order.id, { status: 'PENDING' });
  events = store.listOrderEvents(order.id);
  assert.equal(events.filter((e) => e.kind === 'ORDER_RETURNED_TO_PENDING').length, 2);
  assert.equal(events.filter((e) => e.kind === 'ORDER_ACCEPTED').at(-1).workerId, worker.user.id);
});
