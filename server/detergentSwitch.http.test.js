'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'detergent-switch-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-detergent-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-detergent', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

test('detergent package: off by default, refused while off, admin can switch it on', async (t) => {
  const harness = createTestHarness('paksho-detergent-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const admin = await harness.adminLogin(server);
  const body = { serviceId: 'hourly_labor', quantity: 2, options: { detergent: true } };

  const refused = await request(server, { method: 'POST', pathname: '/api/pricing/quote', body });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.code, 'FEATURE_DISABLED');

  const on = await request(server, { method: 'PUT', pathname: '/api/admin/feature-switches', token: admin,
    body: { scope: 'GLOBAL', feature: 'detergent_package', enabled: true } });
  assert.equal(on.status, 200);

  // روشن شد: دیگر به‌خاطر کلید رد نمی‌شود (تعرفه هنوز گزینهٔ detergent را ندارد، پس خطای تعرفه می‌گیرد).
  const passedGate = await request(server, { method: 'POST', pathname: '/api/pricing/quote', body });
  assert.notEqual(passedGate.json.code, 'FEATURE_DISABLED');
});
