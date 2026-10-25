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
    harness = createTestHarness('paksho-admin-commission-');
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
test('admin commission panel: Persian input, persistence, conflict, lost response, session expiry', { timeout: 60000 }, async t => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(value => sessionStorage.setItem('paksho_admin_token', value), token);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/admin');
  const rate = page.locator('#commissionRate'), save = page.locator('#commissionSave');
  const message = page.locator('#commissionMessage');
  const waitMessage = text => page.waitForFunction(value => document.getElementById('commissionMessage').textContent.includes(value), text);
  await page.locator('#tabCommissionBtn').click();
  await waitMessage('درصد جاری دریافت شد');
  assert.equal(await rate.inputValue(), '25');
  await rate.fill('۲۲٫۵'); await save.click(); await waitMessage('ذخیره شد');
  assert.equal(harness.store.commissionPolicy.read().ratePercent, 22.5);
  await page.reload(); await page.locator('#tabCommissionBtn').click(); await waitMessage('درصد جاری دریافت شد');
  assert.equal(await rate.inputValue(), '22.5');
  await rate.fill('101'); await save.click(); await waitMessage('صفر تا صد');
  assert.equal(harness.store.commissionPolicy.read().ratePercent, 22.5);
  const changed = await request(server, { method: 'PUT', pathname: '/api/admin/commission-policy', token,
    body: { ratePercent: 18, expectedVersion: 1 } });
  assert.equal(changed.status, 200);
  await rate.fill('20'); await save.click(); await waitMessage('مدیر دیگری');
  assert.equal(await rate.inputValue(), '20'); assert.equal(await save.isDisabled(), true);
  assert.equal(harness.store.commissionPolicy.read().ratePercent, 18);
  await page.locator('#commissionRefresh').click(); await waitMessage('درصد جاری دریافت شد');
  assert.equal(await rate.inputValue(), '18');
  // Lose the response AFTER the API actually commits; a reload must discover it.
  await page.route('**/api/admin/commission-policy', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    await route.fetch(); await route.abort('connectionfailed');
  });
  await rate.fill('19'); await save.click(); await waitMessage('نتیجه ذخیره مشخص نشد');
  assert.equal(await rate.inputValue(), '19'); assert.equal(await save.isDisabled(), true);
  assert.equal(harness.store.commissionPolicy.read().ratePercent, 19);
  await page.unroute('**/api/admin/commission-policy');
  await page.locator('#commissionRefresh').click(); await waitMessage('درصد جاری دریافت شد');
  assert.equal(await rate.inputValue(), '19');
  await request(server, { method: 'POST', pathname: '/api/admin/logout', token });
  await rate.fill('10'); await save.click(); await waitMessage('نشست مدیر پایان');
  assert.equal(await rate.inputValue(), '10'); assert.equal(await save.isDisabled(), true);
  assert.equal(harness.store.commissionPolicy.read().ratePercent, 19);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('paksho_admin_token')), null);
  assert.equal((await message.textContent()).includes('ذخیره شد'), false);
  // A refresh after expiry must not start an unbounded login request or stay busy.
  await page.locator('#commissionRefresh').click();
  await waitMessage('ابتدا وارد حساب مدیر');
  assert.equal(await page.locator('#commissionRefresh').isDisabled(), false);
  assert.deepEqual(errors, []);
});
