const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-account-'));
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

test('support, notifications, wallet and loyalty stay on sqlite', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const customer = await login(server, '09131110001', 'CUSTOMER');
  const worker = await login(server, '09131110002', 'WORKER');
  const workerUser = store.getUser(worker.user.id);
  workerUser.status = 'APPROVED';
  workerUser.name = 'متخصص آزمایشی';
  store.updateUser(workerUser);

  const denied = await request(server, { pathname: '/api/support/messages' });
  assert.equal(denied.status, 401);

  const created = await request(server, {
    method: 'POST',
    pathname: '/api/support/messages',
    token: customer.token,
    body: { subject: 'سؤال سفارش', body: 'سفارش من کجاست؟' },
  });
  assert.equal(created.status, 201);
  const mine = await request(server, { pathname: '/api/support/messages', token: customer.token });
  assert.equal(mine.json.messages.length, 1);
  const workerInbox = await request(server, { pathname: '/api/support/messages', token: worker.token });
  assert.equal(workerInbox.json.messages.length, 0);

  const topup = await request(server, {
    method: 'POST',
    pathname: '/api/wallet/topup',
    token: customer.token,
    body: { amount: 50000 },
  });
  assert.equal(topup.status, 501);
  const wallet = await request(server, { pathname: '/api/wallet', token: customer.token });
  assert.equal(wallet.json.balance, 0);
  assert.equal(wallet.json.topUpAvailable, false);

  const order = await request(server, {
    method: 'POST',
    pathname: '/api/orders',
    token: customer.token,
    body: { serviceTitle: 'نظافت', address: 'تهران', date: 'امروز', time: '10', price: 350000 },
  });
  assert.equal(order.status, 200);
  const createdNotes = await request(server, { pathname: '/api/notifications', token: customer.token });
  assert.equal(createdNotes.json.notifications.some((item) => item.kind === 'ORDER_CREATED'), true);

  const accepted = await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.json.order.id + '/accept',
    token: worker.token,
    body: { cleanerId: worker.user.id },
  });
  assert.equal(accepted.status, 200);
  const customerNotes = await request(server, { pathname: '/api/notifications', token: customer.token });
  const workerNotes = await request(server, { pathname: '/api/notifications', token: worker.token });
  assert.equal(customerNotes.json.notifications.some((item) => item.kind === 'ORDER_ACCEPTED'), true);
  assert.equal(workerNotes.json.notifications.some((item) => item.kind === 'ORDER_ACCEPTED'), true);

  const read = await request(server, {
    method: 'POST',
    pathname: '/api/notifications/' + encodeURIComponent(customerNotes.json.notifications[0].id) + '/read',
    token: customer.token,
  });
  assert.equal(read.status, 200);

  await request(server, {
    method: 'PUT',
    pathname: '/api/orders/' + order.json.order.id + '/complete',
    token: worker.token,
    body: { cleanerId: worker.user.id },
  });
  const loyalty = await request(server, { pathname: '/api/loyalty', token: customer.token });
  assert.equal(loyalty.json.loyalty.completedOrdersCount, 1);
  assert.equal(loyalty.json.loyalty.tier, 'NEW');
  assert.equal(loyalty.json.loyalty.discountPercentage, 0);

  const other = await login(server, '09131110003', 'CUSTOMER');
  const otherWorker = await login(server, '09131110004', 'WORKER');
  const otherSupport = await request(server, { pathname: '/api/support/messages', token: other.token });
  assert.equal(otherSupport.json.messages.length, 0);
  const otherNotes = await request(server, { pathname: '/api/notifications', token: other.token });
  const otherWorkerNotes = await request(server, { pathname: '/api/notifications', token: otherWorker.token });
  assert.equal(otherNotes.json.notifications.length, 0);
  assert.equal(otherWorkerNotes.json.notifications.length, 0);
  const foreignId = customerNotes.json.notifications.find((item) => item.id !== customerNotes.json.notifications[0].id).id;
  const stolenRead = await request(server, {
    method: 'POST',
    pathname: '/api/notifications/' + encodeURIComponent(foreignId) + '/read',
    token: other.token,
  });
  assert.equal(stolenRead.status, 404);
  const stillUnread = store.listNotifications(customer.user.id).find((item) => item.id === foreignId);
  assert.equal(stillUnread.readAt, null);

  const otherWallet = await request(server, { pathname: '/api/wallet', token: other.token });
  assert.equal(otherWallet.json.balance, 0);
  const workerWallet = await request(server, { pathname: '/api/wallet', token: worker.token });
  assert.equal(workerWallet.status, 403);
  const workerLoyalty = await request(server, { pathname: '/api/loyalty', token: worker.token });
  assert.equal(workerLoyalty.status, 403);
  const afterTopup = await request(server, { pathname: '/api/wallet', token: customer.token });
  assert.equal(afterTopup.json.balance, 0);
  assert.equal(afterTopup.json.transactions.length, 0);
});
