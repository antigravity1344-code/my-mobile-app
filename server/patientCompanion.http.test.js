'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'patient-companion-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-patient-companion-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-patient-companion', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    patient_companion: { model: 'hourly', rate: 1000 }, hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

test('patient_companion: hidden until a qualified approved worker exists, only qualified workers see/accept it', async (t) => {
  const harness = createTestHarness('paksho-patient-companion-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const adminToken = await harness.adminLogin(server);
  const approve = (w) => { const u = harness.store.getUser(w.user.id); u.status = 'APPROVED'; harness.store.updateUser(u); };
  const qualified = await harness.login(server, '09120000621', 'WORKER');
  const plain = await harness.login(server, '09120000622', 'WORKER');
  approve(qualified); approve(plain);
  const customer = await harness.login(server, '09120000623');
  const hidden = (token) => request(server, { method: 'GET', pathname: '/api/services/enabled', token }).then((r) => r.json.disabledServiceIds);
  const flip = (workerId, enabled) => request(server, { method: 'PUT', pathname: '/api/admin/feature-switches', token: adminToken,
    body: { scope: 'WORKER', workerId, feature: 'patient_companion', enabled } });
  const quote = () => request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token, body: { serviceId: 'patient_companion', quantity: 4, options: {} } });

  // پیش‌فرض: هیچ‌کس صلاحیت ندارد → برای همه پنهان و سفارش بسته
  assert.ok((await hidden(customer.token)).includes('patient_companion'));
  assert.ok((await hidden(qualified.token)).includes('patient_companion'));
  const q0 = await quote(); assert.equal(q0.status, 409); assert.equal(q0.json.code, 'SERVICE_DISABLED');

  // تأیید صلاحیت یک نفر
  assert.equal((await flip(qualified.user.id, true)).status, 200);
  assert.ok(!(await hidden(customer.token)).includes('patient_companion'));
  assert.ok(!(await hidden(qualified.token)).includes('patient_companion'));
  assert.ok((await hidden(plain.token)).includes('patient_companion'));
  assert.equal((await quote()).status, 200);

  // سفارش: فقط متخصص صلاحیت‌دار می‌بیند و می‌پذیرد
  const quoted = (await quote()).json.quote;
  const created = await request(server, { method: 'POST', pathname: '/api/orders', token: customer.token,
    body: { serviceTitle: 'همراه مریض', address: 'آدرس آزمایشی', date: '1405-01-01', time: '10:00', serviceId: 'patient_companion',
      quantity: 4, durationHours: 4, options: {}, quoteToken: quoted.quoteToken, confirmedTotal: quoted.total,
      expectedStartAt: new Date(Date.now() + 48 * 3600000).toISOString() } });
  assert.ok(created.status === 200 || created.status === 201, JSON.stringify(created.json));
  {
    const id = created.json.order.id;
    const seen = (w) => request(server, { method: 'GET', pathname: '/api/orders/available', token: w.token }).then((r) => r.json.orders.map((o) => o.id));
    assert.ok(!(await seen(plain)).includes(id));
    assert.ok((await seen(qualified)).includes(id));
    const denied = await request(server, { method: 'PUT', pathname: `/api/orders/${id}/accept`, token: plain.token, body: {} });
    assert.equal(denied.status, 403); assert.equal(denied.json.code, 'NOT_QUALIFIED');
  }

  // متخصص بدون صلاحیت پیشنهاد نمی‌تواند ثبت کند
  const offerBody = { serviceId: 'patient_companion', startAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    endAt: new Date(Date.now() + 52 * 3600000).toISOString(), adjustmentBasisPoints: 8000 };
  assert.equal((await request(server, { method: 'POST', pathname: '/api/workers/me/offers', token: plain.token, body: offerBody })).status, 403);

  // لغو صلاحیت آخرین نفر → دوباره پنهان
  assert.equal((await flip(qualified.user.id, false)).status, 200);
  assert.ok((await hidden(customer.token)).includes('patient_companion'));
  assert.equal((await quote()).status, 409);

  const users = await request(server, { method: 'GET', pathname: '/api/admin/users?role=WORKER', token: adminToken });
  assert.equal(users.json.users.find((u) => u.id === plain.user.id).features.patient_companion, false);
});
