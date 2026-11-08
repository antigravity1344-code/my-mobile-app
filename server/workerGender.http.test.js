'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./pricing/tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'customer-requests-isolated-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-customer-requests-tariff-'));
process.env.PAKSHO_TARIFF_FILE = path.join(tariffDir, 'tariff.json');

const { createTestHarness, request } = require('./testAuthHarness');

seedCommittedPolicy(process.env, {
  companyId: 'company-customer-requests', currencyUnit: 'toman',
  versions: [{ id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z', services: {
    hourly_labor: { model: 'hourly', rate: 1000 } } }],
});

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();

test('worker gender: stored only as FEMALE or MALE through onboarding', async (t) => {
  const harness = createTestHarness('paksho-worker-gender-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const worker = await harness.login(server, '09120000711', 'WORKER');
  const onboard = (gender) => request(server, { method: 'PUT', pathname: '/api/users/worker-onboarding', token: worker.token, body: {
    name: 'TestWorker', nationalId: '0012345679', birthDate: '1370/01/02', address: 'TehranTest1', city: 'Tehran',
    skills: ['cleaning'], bankSheba: 'IR' + '1'.repeat(24), gender,
    idDocFile: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' } } });
  const bad = await onboard('UNKNOWN');
  assert.equal(bad.status, 400);
  const ok = await onboard('female');
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(harness.store.getUser(worker.user.id).gender, 'FEMALE');
});

