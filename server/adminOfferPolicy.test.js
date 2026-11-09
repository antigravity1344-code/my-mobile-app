const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createTestHarness, request } = require('./testAuthHarness');
let harness, server, browser, origin, token;
before(async () => {
  const exists = fs.existsSync;
  const envPaths = new Set([path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]);
  try {
    fs.existsSync = file => envPaths.has(String(file)) ? false : exists(file);
    harness = createTestHarness('paksho-admin-offer-policy-');
  } finally { fs.existsSync = exists; }
  server = await new Promise(resolve => { const instance = harness.app.listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = 'http://127.0.0.1:' + server.address().port;
  token = await harness.adminLogin(server);
  browser = await chromium.launch({ executablePath: process.env.PAKSHO_TEST_CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    chromiumSandbox: process.env.PAKSHO_TEST_CHROMIUM_SANDBOX !== '0' });
}, { timeout: 45000 });
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  harness?.close();
// Chromium on Windows can take around a minute to close its process tree.
}, { timeout: 75000 });
test('admin offer policy panel: Persian digits, validation, persistence and conflict', { timeout: 60000 }, async t => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(value => sessionStorage.setItem('paksho_admin_token', value), token);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/admin');
  const min = page.locator('#offerPolicyMin'), max = page.locator('#offerPolicyMax'), silver = page.locator('#offerPolicySilver'), gold = page.locator('#offerPolicyGold');
  const save = page.locator('#offerPolicySave');
  const waitMessage = text => page.waitForFunction(value => document.getElementById('offerPolicyMessage').textContent.includes(value), text);
  await page.locator('#tabOfferPolicyBtn').click();
  await waitMessage('تنظیم جاری دریافت شد');
  await page.waitForFunction(() => document.getElementById('offerReportMessage').textContent.includes('موردی با این الگو پیدا نشد'));
  const report = await request(server, { method: 'GET', pathname: '/api/admin/offer-report', token });
  assert.equal(report.status, 200); assert.deepEqual(report.json.rows, []);
  assert.equal((await request(server, { method: 'GET', pathname: '/api/admin/offer-report' })).status, 401);
  assert.deepEqual([await min.inputValue(), await max.inputValue(), await silver.inputValue(), await gold.inputValue()], ['70', '100', '110', '130']);
  await min.fill('۶۰'); await max.fill('۱۰۵'); await silver.fill('۱۲۰'); await gold.fill('۱۴۰'); await save.click(); await waitMessage('ذخیره شد');
  assert.deepEqual(harness.store.offerPolicy.bounds(), { minBps: 6000, maxBps: 10500, silverMaxBps: 12000, goldMaxBps: 14000 });
  await page.reload(); await page.locator('#tabOfferPolicyBtn').click(); await waitMessage('تنظیم جاری دریافت شد');
  assert.equal(await max.inputValue(), '105');
  await min.fill('120'); await save.click(); await waitMessage('حداقل ≤ حداکثر');
  assert.equal(harness.store.offerPolicy.read().version, 1);
  const changed = await request(server, { method: 'PUT', pathname: '/api/admin/offer-policy', token,
    body: { minPercent: 55, maxPercent: 100, silverMaxPercent: 110, goldMaxPercent: 120, expectedVersion: 1 } });
  assert.equal(changed.status, 200);
  await min.fill('60'); await save.click(); await waitMessage('مدیر دیگری');
  assert.equal(await save.isDisabled(), true);
  assert.equal(harness.store.offerPolicy.read().minPercent, 55);
  const toggle = page.locator('#offerGlobalToggle');
  await page.waitForFunction(() => !document.getElementById('offerGlobalToggle').disabled);
  assert.match(await page.locator('#offerGlobalState').textContent(), /روشن/);
  await toggle.click();
  await page.waitForFunction(() => document.getElementById('offerGlobalState').textContent.includes('خاموش'));
  assert.equal(harness.store.featureSwitches.isGlobalEnabled('offers'), false);
  await toggle.click();
  await page.waitForFunction(() => document.getElementById('offerGlobalState').textContent.includes('روشن'));
  assert.equal(harness.store.featureSwitches.isGlobalEnabled('offers'), true);
  assert.deepEqual(errors, []);
});
