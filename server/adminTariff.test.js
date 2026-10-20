'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { seedCommittedPolicy, readAdminTariff, registerDraft } = require('./pricing/tariffPublication');
const { validatePolicy, quote } = require('./pricing/tariffEngine');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'isolated-admin-tariff-test-only';
const { createTestHarness, request } = require('./testAuthHarness');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-admin-tariff-'));
let harness, server, browser, origin, token;
let fixtureNumber = 0;
const FUTURE_LOCAL = '2098-06-01T12:00';

before(async () => {
  harness = createTestHarness('paksho-admin-tariff-db-');
  server = await new Promise((resolve) => {
    const instance = harness.app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  origin = 'http://127.0.0.1:' + server.address().port;
  token = await harness.adminLogin(server);
  browser = await chromium.launch({
    executablePath: process.env.PAKSHO_TEST_CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    chromiumSandbox: process.env.PAKSHO_TEST_CHROMIUM_SANDBOX !== '0',
  });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  if (harness) harness.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function fixture(overrides = {}) {
  process.env.PAKSHO_TARIFF_FILE = path.join(tmp, `tariff-${++fixtureNumber}.json`);
  const version = { id: 'v1', status: 'published', validFrom: '2020-01-01T00:00:00Z', validTo: null,
    services: {
      home_unit_cleaning: { model: 'hourly', rate: 1000, minQuantity: 1, maxQuantity: 8,
        surcharges: [{ id: 'detergent', optionId: 'detergent', amount: 100 }],
        factors: [{ id: 'outside', optionId: 'place', equals: 'outer', basisPoints: 12000 }],
        discounts: [{ id: 'existing', basisPoints: 500 }] },
      sofa_carpet_washing: { model: 'count', rate: 50 },
      building_painting: { model: 'area', rate: 4 },
      fixed: { model: 'fixed', rate: 20 },
    },
  };
  const policy = { companyId: 'fixture-company', currencyUnit: 'minor', versions: [version], ...overrides };
  assert.equal(seedCommittedPolicy(process.env, policy).ok, true);
  return policy;
}

async function pageFor(t, initialToken = token) {
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'Asia/Tehran' });
  t.after(() => context.close());
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript((value) => {
    sessionStorage.setItem('paksho_admin_token', value);
    window.__tariffXss = [];
  }, initialToken);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin + '/admin');
  await page.locator('#tabTariffsBtn').click();
  await page.waitForFunction(() => document.getElementById('tariffMessage').textContent !== '');
  return { page, context };
}

async function saveDraft(page, rate = '۱۲۰۰') {
  await page.getByLabel('نظافت داخل منزل / واحد — برای هر ساعت (minor)', { exact: true }).fill(rate);
  await page.locator('#tariffDraftFrom').fill(FUTURE_LOCAL);
  await page.locator('#tariffSave').click();
}

test('tariff read uses only the existing admin session and never exposes disk state', async () => {
  fixture();
  const before = fs.readFileSync(process.env.PAKSHO_TARIFF_FILE);
  const customer = await harness.login(server, '09120001201');
  const worker = await harness.login(server, '09120001202', 'WORKER');
  for (const bearer of [undefined, customer.token, worker.token, 'not-an-admin-session']) {
    const denied = await request(server, { pathname: '/api/admin/tariff-versions', token: bearer });
    assert.equal(denied.status, 401);
    assert.equal(denied.json.message, 'دسترسی مدیر لازم است.');
  }
  const response = await fetch(origin + '/api/admin/tariff-versions', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.deepEqual(Object.keys(data).sort(), ['companyId', 'currencyUnit', 'revision', 'success', 'versions']);
  assert.equal(data.revision, 1);
  assert.equal(JSON.stringify(data).includes(process.env.PAKSHO_TARIFF_FILE), false);
  assert.deepEqual(fs.readFileSync(process.env.PAKSHO_TARIFF_FILE), before);
});

test('the real admin form saves and publishes a priced clone without altering existing orders', async (t) => {
  fixture();
  const customer = await harness.login(server, '09120001203');
  const quoted = await request(server, { method: 'POST', pathname: '/api/pricing/quote', token: customer.token,
    body: { serviceId: 'home_unit_cleaning', quantity: 2 } });
  assert.equal(quoted.status, 200);
  const created = await request(server, { method: 'POST', pathname: '/api/orders', token: customer.token,
    body: { serviceId: 'home_unit_cleaning', quantity: 2, quoteToken: quoted.json.quote.quoteToken,
      confirmedTotal: quoted.json.quote.total, serviceTitle: 'سفارش ساختگی', address: 'آدرس ساختگی',
      date: '1405-07-28', time: '10:00', clientRequestId: 'admin-ui-order-01' } });
  assert.equal(created.status, 200);
  const orderBefore = structuredClone(harness.store.getOrder(created.json.order.id));
  const original = readAdminTariff();
  const { page } = await pageFor(t);
  const content = await page.locator('#tariffContent').textContent();
  assert.ok(content.includes('نظافت داخل منزل'));
  assert.ok(content.includes('برای هر عدد'));
  assert.ok(content.includes('برای هر متر مربع'));
  assert.ok(content.includes('minor'));
  await saveDraft(page);
  await page.waitForFunction(() => document.getElementById('tariffMessage').textContent.includes('پیش‌نویس ذخیره شد'));
  let state = readAdminTariff();
  assert.equal(state.revision, 2);
  assert.equal(state.versions.length, 2);
  const draft = state.versions.find((version) => version.status === 'draft');
  const expectedServices = structuredClone(original.versions[0].services);
  expectedServices.home_unit_cleaning.rate = 1200;
  assert.deepEqual(JSON.parse(JSON.stringify(draft.services)), expectedServices);
  assert.equal(quote(validatePolicy(state), { at: '2026-10-20T00:00:00Z', serviceId: 'home_unit_cleaning', quantity: 2 }).total, orderBefore.price);
  await page.locator('#tariffSupersede').selectOption('v1');
  let confirmation;
  page.once('dialog', async (dialog) => { confirmation = dialog.message(); await dialog.accept(); });
  await page.locator('#tariffPublish').click();
  await page.waitForFunction(() => document.getElementById('tariffMessage').textContent.includes('پیش‌نویس منتشر شد'));
  assert.ok(confirmation.includes('قبلی 1000، تازه 1200 minor'));
  state = readAdminTariff();
  assert.equal(state.revision, 3);
  assert.equal(state.versions[0].validTo, draft.validFrom);
  assert.deepEqual(state.versions[0].services, original.versions[0].services);
  const afterQuote = quote(validatePolicy(state), { at: draft.validFrom, serviceId: 'home_unit_cleaning', quantity: 2 });
  assert.equal(afterQuote.tariffVersionId, draft.id);
  assert.equal(afterQuote.total, 2280);
  const stored = harness.store.getOrder(created.json.order.id);
  assert.equal(stored.price, orderBefore.price);
  assert.deepEqual(stored.pricingJson, orderBefore.pricingJson);
});

test('unknown draft and publish responses freeze the editor and retry each identical committed request', async (t) => {
  fixture();
  const { page, context } = await pageFor(t);
  const bodies = [];
  await context.route('**/api/admin/tariff-versions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) { await route.fetch(); return route.abort('failed'); }
    return route.continue();
  });
  await saveDraft(page);
  await page.waitForFunction(() => !document.getElementById('tariffRetry').hidden && !document.getElementById('tariffRetry').disabled);
  assert.equal(await page.locator('#tariffSave').isDisabled(), true);
  assert.equal(await page.locator('#tariffRefresh').isDisabled(), true);
  assert.equal(readAdminTariff().versions.length, 2);
  await page.locator('#tariffRetry').click();
  await page.waitForFunction(() => document.getElementById('tariffMessage').textContent.includes('پیش‌نویس ذخیره شد'));
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(readAdminTariff().versions.length, 2);
  const publishes = [];
  await context.route('**/api/admin/tariff-versions/*/publish', async (route) => {
    publishes.push(route.request().postDataJSON());
    if (publishes.length === 1) { await route.fetch(); return route.abort('failed'); }
    return route.continue();
  });
  await page.locator('#tariffSupersede').selectOption('v1');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#tariffPublish').click();
  await page.waitForFunction(() => !document.getElementById('tariffRetry').hidden && !document.getElementById('tariffRetry').disabled);
  assert.equal(readAdminTariff().revision, 3);
  assert.equal(await page.locator('#tariffPublish').isDisabled(), true);
  await page.locator('#tariffRetry').click();
  await page.waitForFunction(() => document.getElementById('tariffMessage').textContent.includes('پیش‌نویس منتشر شد'));
  assert.equal(publishes.length, 2);
  assert.deepEqual(publishes[0], publishes[1]);
  assert.equal(readAdminTariff().revision, 3);
  assert.equal(readAdminTariff().versions.length, 2);
});

test('revision conflict requires a reload and never silently resubmits the new rates', async (t) => {
  fixture();
  const { page, context } = await pageFor(t);
  let attempts = 0;
  await context.route('**/api/admin/tariff-versions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts += 1;
    assert.equal(registerDraft({ baseRevision: 1, requestId: 'other-admin-01', version: {
      id: 'other', validFrom: '2098-01-01T00:00:00Z', services: { fixed: { model: 'fixed', rate: 8 } },
    } }).ok, true);
    return route.continue();
  });
  await saveDraft(page);
  await page.waitForFunction(() => document.getElementById('tariffMessage').textContent.includes('جای دیگری تغییر کرده'));
  assert.equal(attempts, 1);
  assert.equal(await page.locator('#tariffSave').isDisabled(), true);
  assert.equal(await page.locator('#tariffRefresh').isDisabled(), false);
  assert.equal(readAdminTariff().versions.length, 2);
  await page.locator('#tariffRefresh').click();
  await page.waitForFunction(() => !document.getElementById('tariffSave').disabled && !document.getElementById('tariffSave').closest('fieldset').disabled);
  assert.equal(attempts, 1);
});

test('tariff labels render hostile strings as data in a real browser', async (t) => {
  const attack = '<img src="/bad" onerror="window.__tariffXss.push(1)"><svg onload="window.__tariffXss.push(2)">';
  fixture({ companyId: attack, versions: [{ id: attack, status: 'draft', validFrom: '2098-01-01T00:00:00Z', validTo: null,
    services: { [attack]: { model: 'fixed', rate: 10, surcharges: [{ id: attack, optionId: 'extra', amount: 2 }] } } }] });
  const { page } = await pageFor(t);
  assert.ok((await page.locator('#tariffContent').textContent()).includes(attack));
  assert.deepEqual(await page.evaluate(() => window.__tariffXss), []);
  assert.equal(await page.locator('#tariffContent img, #tariffContent svg, #tariffContent script, #tariffContent [onerror]').count(), 0);
});

test('missing tariff and expired admin session show a clear error without seeding or an editable form', async (t) => {
  process.env.PAKSHO_TARIFF_FILE = path.join(tmp, 'missing.json');
  const { page } = await pageFor(t);
  assert.ok((await page.locator('#tariffMessage').textContent()).includes('هنوز راه‌اندازی نشده'));
  assert.equal(await page.locator('#tariffSave').count(), 0);
  assert.equal(fs.existsSync(process.env.PAKSHO_TARIFF_FILE), false);
  fixture();
  const expired = await pageFor(t, 'expired-token');
  assert.ok((await expired.page.locator('#tariffMessage').textContent()).includes('نشست مدیر پایان یافته'));
  assert.equal(await expired.page.evaluate(() => sessionStorage.getItem('paksho_admin_token')), null);
  expired.page.once('dialog', (dialog) => dialog.accept(harness.adminPassword));
  await expired.page.locator('#tariffRefresh').click();
  await expired.page.waitForSelector('#tariffSave');
});
