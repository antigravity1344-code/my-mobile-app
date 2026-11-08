'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'customer-requests-worker-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-customer-requests-worker-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-customer-requests-worker', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();

test('customer request: address required, gender preference filters specialists, address hidden from specialists', async (t) => {
  const harness = createTestHarness('paksho-customer-requests-worker-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120000801');
  const female = await harness.login(server, '09120000802', 'WORKER');
  const male = await harness.login(server, '09120000803', 'WORKER');
  const approve = (w, gender) => { const u = harness.store.getUser(w.user.id); u.status = 'APPROVED'; u.gender = gender; harness.store.updateUser(u); };
  approve(female, 'FEMALE'); approve(male, 'MALE');
  const base = { serviceId: 'hourly_labor', startAt: inHours(48), endAt: inHours(52), adjustmentBasisPoints: 9000 };
  const create = (body) => request(server, { method: 'POST', pathname: '/api/customer/requests', token: customer.token, body });

  // آدرس الزامی است و ترجیح جنسیت نامعتبر رد می‌شود
  assert.equal((await create(base)).status, 400);
  assert.equal((await create({ ...base, address: 'Tehran test', genderPreference: 'OTHER' })).status, 400);

  // درخواست زنانه: فقط متخصص زن می‌بیند؛ آدرس در فهرست متخصص نیست
  const femaleOnly = await create({ ...base, address: 'Tehran test 1', genderPreference: 'FEMALE' });
  assert.equal(femaleOnly.status, 201, JSON.stringify(femaleOnly.json));
  // بدون ترجیح: هر دو می‌بینند
  const anyone = await create({ ...base, address: 'Tehran test 2' });
  assert.equal(anyone.status, 201);

  const seen = async (w) => (await request(server, { method: 'GET', pathname: '/api/workers/me/customer-requests', token: w.token })).json.requests;
  const forFemale = await seen(female);
  const forMale = await seen(male);
  assert.equal(forFemale.length, 2);
  assert.equal(forMale.length, 1);
  assert.equal(forMale[0].id, anyone.json.request.id);
  assert.ok(!JSON.stringify(forFemale).includes('Tehran test'), 'address must not leak to specialists before acceptance');
});
