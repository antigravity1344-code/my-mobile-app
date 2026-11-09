'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'site-extras-switch-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-site-extras-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-site-extras', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

test('site_extras switch: off by default, admin can turn it on, public endpoint reports it', async (t) => {
  const harness = createTestHarness('paksho-site-extras-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const adminToken = await harness.adminLogin(server);

  const before = await request(server, { method: 'GET', pathname: '/api/site/features' });
  assert.equal(before.status, 200);
  assert.equal(before.json.siteExtras, false);
  assert.equal(before.json.detergentPackage, false);

  const on = await request(server, { method: 'PUT', pathname: '/api/admin/feature-switches', token: adminToken,
    body: { scope: 'GLOBAL', feature: 'site_extras', enabled: true } });
  assert.equal(on.status, 200);

  const after = await request(server, { method: 'GET', pathname: '/api/site/features' });
  assert.equal(after.json.siteExtras, true);
});
