const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

// Test fixtures are isolated from the application's database and credentials.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-admin-xss-'));
process.env.NODE_ENV = 'test';
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'worker-docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-admin-xss-test-only';

const { app, store } = require('./index');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSIAAAAASUVORK5CYII=';
const TEXT_ATTACK = '<img src="/__missing_xss_image" onerror="window.__xssHits.push(\'image\')"><svg onload="window.__xssHits.push(\'svg\')"></svg>';
let server;
let browser;
let origin;
let adminToken;

function worker(overrides = {}) {
  return {
    id: 'WORKER-TEST', phone: '09120000101', role: 'WORKER', status: 'PENDING_VERIFICATION',
    isProfileComplete: true, name: 'متخصص آزمایشی', nationalId: '1098765432',
    bankSheba: 'IR120000000000000000000000', address: 'تهران، کوچه ۵',
    avatar: '/test-avatar.png', createdAt: '2026-10-11T08:00:00.000Z', ...overrides,
  };
}

test('manual topup admin form persists receipt, handles lost response and rejects duplicate without double credit', async () => {
  const w = worker({id:'WORKER-MANUAL',phone:'09120000986',status:'APPROVED'});
  store.createUser(w);
  await withPage(async (page) => {
    await page.evaluate(row => renderWorkers([row]),w);
    await page.locator('#tabWorkersBtn').click();
    await page.getByRole('button',{name:'ثبت شارژ دستی',exact:true}).click();
    const panel=page.locator('[data-manual-topup]');
    await panel.locator('[name=amount]').fill('150000');
    await panel.locator('[name=paidOn]').fill('2026-10-25');
    await panel.locator('[name=trackingNumber]').fill('987654321');
    await panel.locator('[name=note]').fill('تطبیق واریز آزمایشی');
    // Server commits but client loses the response: retain form and safely retry same reference.
    await page.route('**/wallet/manual-topups',async route=>{
      if(route.request().method()!=='POST') return route.continue();
      await route.fetch(); await route.abort('failed');
    },{times:1});
    await panel.getByRole('button',{name:'تأیید و ثبت شارژ',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-manual-topup] [role=status]').textContent.includes('اطلاعات فرم محفوظ'));
    assert.equal(await panel.locator('[name=trackingNumber]').inputValue(),'987654321');
    await panel.getByRole('button',{name:'بازخوانی رسیدهای ثبت‌شده'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-manual-topup] pre').textContent.includes('987654321'));
    await panel.getByRole('button',{name:'تأیید و ثبت شارژ',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-manual-topup] [role=status]').textContent.includes('قبلاً ثبت'));
    assert.equal(store.workerWallet.read(w.id).balances[0].balance,150000);
    assert.equal(store.paymentSettings.listManualTopups(w.id).length,1);
    await panel.locator('[name=trackingNumber]').fill('987654322');
    await panel.getByRole('button',{name:'تأیید و ثبت شارژ',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-manual-topup] [role=status]').textContent.startsWith('شارژ ثبت شد'));
    assert.equal(await panel.locator('[name=amount]').inputValue(),'');
    assert.equal(store.workerWallet.read(w.id).balances[0].balance,300000);
  });
});

function order(overrides = {}) {
  return {
    id: 'ORDER-TEST', customerId: 'CUSTOMER-TEST', customerName: 'مشتری آزمایشی',
    customerPhone: '09120000102', serviceTitle: 'نظافت منزل', address: 'تهران، پلاک ۱۲',
    date: '۲۰ مهر', time: 'صبح', cleanerName: 'متخصص پذیرنده', price: 800000,
    status: 'PENDING', createdAt: '2026-10-11T08:00:00.000Z', ...overrides,
  };
}

before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  origin = 'http://127.0.0.1:' + server.address().port;
  const login = await fetch(origin + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.PAKSHO_ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  adminToken = (await login.json()).token;
  assert.ok(adminToken);
  browser = await chromium.launch({
    executablePath: process.env.PAKSHO_TEST_CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    // Explicit opt-out is only for isolated CI containers without a usable browser sandbox.
    // Missing browsers and launch failures fail the tests; they are never silently skipped.
    chromiumSandbox: process.env.PAKSHO_TEST_CHROMIUM_SANDBOX !== '0',
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function withPage(run) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    // CDN styles, remote images and any injected outbound request cannot leave this test.
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname === '/test-avatar.png') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG, 'base64') });
    }
    if (url.pathname === '/__missing_xss_image') return route.fulfill({ status: 404, body: '' });
    return route.continue();
  });
  await context.addInitScript((token) => {
    sessionStorage.setItem('paksho_admin_token', token);
    window.__xssHits = [];
  }, adminToken);
  try {
    await page.goto(origin + '/admin');
    await page.waitForFunction(() => typeof renderWorkers === 'function' && typeof renderOrders === 'function');
    await page.waitForFunction(() => document.getElementById('ordersList').textContent.indexOf('در حال بارگذاری') === -1);
    await run(page);
    assert.deepEqual(errors, [], 'the dashboard must not raise browser script errors');
  } finally {
    await context.close();
  }
}

async function assertSafeMarkup(page, listId) {
  // Error/load events are asynchronous in a real browser, including images in injected HTML.
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => window.__xssHits), [], 'injected code must never execute');
  assert.equal(await page.locator('#' + listId + ' [onerror], #' + listId + ' [onload]').count(), 0);
  assert.equal(await page.locator('#' + listId + ' svg, #' + listId + ' script, #' + listId + ' iframe').count(), 0);
}

test('worker text fields are literal text, not executable HTML', async (t) => {
  for (const field of ['name', 'phone', 'nationalId', 'bankSheba', 'address']) {
    await t.test(field, () => withPage(async (page) => {
      await page.evaluate((row) => renderWorkers([row]), worker({ [field]: TEXT_ATTACK }));
      await assertSafeMarkup(page, 'workersList');
      assert.ok((await page.locator('#workersList').textContent()).includes(TEXT_ATTACK));
      assert.equal(await page.locator('#workersList img').count(), 1, 'only the intended avatar remains');
    }));
  }
});

test('order text and nonnumeric amount cannot inject HTML', async (t) => {
  for (const field of ['id', 'serviceTitle', 'customerName', 'customerPhone', 'address', 'date', 'time', 'cleanerName', 'price']) {
    await t.test(field, () => withPage(async (page) => {
      await page.evaluate((row) => renderOrders([row]), order({ [field]: TEXT_ATTACK }));
      await assertSafeMarkup(page, 'ordersList');
      assert.equal(await page.locator('#ordersList img').count(), 0);
      assert.ok((await page.locator('#ordersList').textContent()).includes(TEXT_ATTACK));
    }));
  }
});

test('avatar attributes and unsafe image URL schemes are rejected', async (t) => {
  const attacks = {
    'double-quote attribute breakout': 'x" onerror="window.__xssHits.push(\'avatar\')',
    'single-quote and markup breakout': "x'><svg onload=window.__xssHits.push('avatar')></svg>",
    'javascript scheme': "javascript:window.__xssHits.push('avatar')",
    'case-insensitive javascript scheme': "JaVaScRiPt:window.__xssHits.push('avatar')",
    'vbscript scheme': 'vbscript:msgbox(1)',
    'HTML data URI': 'data:text/html,<script>window.__xssHits.push("avatar")</script>',
    'SVG data URI': 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" onload="window.__xssHits.push(\'avatar\')"/>',
    'base64 SVG data URI': 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="window.__xssHits.push(\'avatar\')"/>').toString('base64'),
    'URL control character': "java\nscript:window.__xssHits.push('avatar')",
  };
  for (const [name, avatar] of Object.entries(attacks)) {
    await t.test(name, () => withPage(async (page) => {
      await page.evaluate((row) => renderWorkers([row]), worker({ avatar }));
      await assertSafeMarkup(page, 'workersList');
      assert.equal(await page.locator('#workersList img').count(), 1);
      const src = await page.locator('#workersList img').getAttribute('src');
      assert.notEqual(src, avatar, 'unsafe input must not become the image URL');
      assert.equal(new URL(src, origin).protocol, 'https:', 'rejected avatars use the established HTTPS placeholder');
    }));
  }
});

test('supported HTTP, relative and raster data avatars stay usable', async (t) => {
  for (const avatar of [
    'https://example.invalid/avatar.png', 'http://example.invalid/avatar.png', '/test-avatar.png',
    'data:image/png;base64,' + PNG, 'data:image/jpeg;base64,/9j/2Q==',
    'data:image/jpg;base64,/9j/2Q==', 'data:image/webp;base64,UklGRgAAAABXRUJQ',
  ]) {
    await t.test(avatar.split(',')[0], () => withPage(async (page) => {
      await page.evaluate((row) => renderWorkers([row]), worker({ avatar }));
      const src = await page.locator('#workersList img').getAttribute('src');
      assert.equal(new URL(src, origin).href, new URL(avatar, origin).href);
      await assertSafeMarkup(page, 'workersList');
    }));
  }
});

test('unknown status values cannot create classes, attributes or executable content', async () => {
  await withPage(async (page) => {
    await page.evaluate(({ w, o }) => { renderWorkers([w]); renderOrders([o]); }, {
      w: worker({ status: TEXT_ATTACK }), o: order({ status: TEXT_ATTACK }),
    });
    await assertSafeMarkup(page, 'workersList');
    await assertSafeMarkup(page, 'ordersList');
    assert.match(await page.locator('#workersList').textContent(), /ثبت‌نام اولیه/);
    assert.match(await page.locator('#ordersList').textContent(), /وضعیت نامشخص/);
    assert.equal(await page.locator('#ordersList button').count(), 0);
  });
});

test('untrusted worker and order IDs are inert and use encoded API paths when clicked', async (t) => {
  for (const kind of ['worker', 'order']) {
    await t.test(kind, () => withPage(async (page) => {
      const id = "id');window.__xssHits.push('" + kind + "-id');//?/#";
      const listId = kind === 'worker' ? 'workersList' : 'ordersList';
      const pathname = kind === 'worker'
        ? '/api/admin/users/' + encodeURIComponent(id) + '/status'
        : '/api/admin/orders/' + encodeURIComponent(id);
      const calls = [];
      await page.route(origin + pathname, async (route) => {
        calls.push({ method: route.request().method(), body: route.request().postDataJSON() });
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":false}' });
      });
      await page.evaluate(({ kind, w, o }) => kind === 'worker' ? renderWorkers([w]) : renderOrders([o]), {
        kind, w: worker({ id }), o: order({ id, status: 'CANCEL_REQUESTED' }),
      });
      const button = page.locator('#' + listId + (kind === 'worker' ? ' button[data-action="worker-status"]' : ' button'));
      assert.equal(await button.getAttribute('onclick'), null, 'untrusted IDs must not enter inline JavaScript attributes');
      if (kind === 'order') await page.locator('#tabOrdersBtn').click();
      await button.click();
      await page.waitForFunction(() => window.__xssHits.length === 0);
      await assertSafeMarkup(page, listId);
      assert.deepEqual(calls, [{ method: 'PUT', body: { status: kind === 'worker' ? 'APPROVED' : 'CANCELLED' } }]);
    }));
  }
});

test('real API data with injected worker and order text renders inertly', async () => {
  const w = worker({ id: 'WORKER-STORED-XSS', phone: '09120000103', name: TEXT_ATTACK, address: TEXT_ATTACK });
  store.createUser(w);
  store.createOrder(order({ id: 'ORDER-STORED-XSS', serviceTitle: TEXT_ATTACK, customerName: TEXT_ATTACK, address: TEXT_ATTACK }));
  await withPage(async (page) => {
    await assertSafeMarkup(page, 'workersList');
    await assertSafeMarkup(page, 'ordersList');
    assert.ok((await page.locator('#workersList').textContent()).includes(TEXT_ATTACK));
    assert.ok((await page.locator('#ordersList').textContent()).includes(TEXT_ATTACK));
  });
});

test('admin resets a worker bank PIN through the real panel only after identity confirmation and a reason', async () => {
  const w = worker({ id: 'WORKER-BANK-RESET', phone: '09120000105', status: 'APPROVED', idDoc: 'existing-identity-document', bankSheba: 'IR820540102680020817909002' });
  store.createUser(w);
  assert.equal(store.workerBank.savePin(w.id, { newPin: '123456', expectedVersion: 0 }).code, 'ok');
  await withPage(async page => {
    await page.evaluate(row => renderWorkers([row]), w);
    await page.getByRole('button', { name: 'بازنشانی رمز شبا', exact: true }).click();
    const panel = page.locator('[data-bank-reset="WORKER-BANK-RESET"]');
    await page.waitForFunction(() => document.querySelector('[data-bank-reset] [role="status"]').textContent.includes('رمز دارد'));
    assert.ok((await panel.textContent()).includes('IR82****9002'));
    assert.equal((await panel.textContent()).includes(w.bankSheba), false);
    await panel.getByRole('button', { name: 'بازنشانی رمز و ارسال اعلان' }).click();
    assert.equal(store.workerBank.read(w.id).bankDetails.hasPin, true);
    await panel.getByRole('checkbox').check();
    await panel.getByLabel('دلیل بازنشانی (الزامی)').fill('هویت با مدرک ثبت‌شده تطبیق داده شد');
    const saved = page.waitForResponse(response => response.url() === origin + '/api/admin/workers/' + w.id + '/bank-pin/reset' && response.request().method() === 'POST');
    await panel.getByRole('button', { name: 'بازنشانی رمز و ارسال اعلان' }).click();
    assert.equal((await saved).status(), 200);
    await page.waitForFunction(() => document.querySelector('[data-bank-reset] [role="status"]').textContent.includes('رمز بازنشانی و اعلان ثبت شد'));
    assert.equal(store.workerBank.read(w.id).bankDetails.hasPin, true);
    assert.equal(store.workerBank.read(w.id).bankDetails.pinTemporary, true);
    await panel.getByRole('button', { name: 'نمایش رمز موقت', exact: true }).click();
    assert.match(await panel.getByLabel('رمز موقت؛ فقط این بار نمایش داده می‌شود').inputValue(), /^\d{6}$/);
    assert.equal(store.getUser(w.id).bankSheba, w.bankSheba);
    assert.equal(store.getUser(w.id).status, 'APPROVED');
  });
});

test('ordinary content, dashboard classes, empty states and existing button operations are preserved', async () => {
  const w = worker({ id: 'WORKER-NORMAL', phone: '09120000104', name: 'متخصص & «آزمایشی»' });
  store.createUser(w);
  const o = order({ id: 'ORDER-NORMAL', status: 'CANCEL_REQUESTED', cancelRequestedAt: new Date().toISOString() });
  store.createOrder(o);
  await withPage(async (page) => {
    await page.evaluate(() => {
      const originalLoad = loadAllData;
      window.__operationLoads = [];
      loadAllData = () => {
        const pending = originalLoad();
        window.__operationLoads.push(pending);
        return pending;
      };
    });
    await page.evaluate(({ w, o }) => { renderWorkers([w]); renderOrders([o]); }, { w, o });
    assert.equal(await page.locator('#workersList > div').getAttribute('class'), 'bg-slate-800 border border-amber-500/50 bg-amber-950/10 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4');
    assert.equal(await page.locator('#workersList img').getAttribute('class'), 'w-12 h-12 rounded-full border-2 border-emerald-500 object-cover');
    assert.equal(await page.locator('#ordersList > div').getAttribute('class'), 'bg-slate-800 border border-slate-700 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4');
    assert.match(await page.locator('#workersList').textContent(), /متخصص & «آزمایشی»/);
    assert.match(await page.locator('#ordersList').textContent(), /۸۰۰٬۰۰۰ تومان/);
    const approved = page.waitForResponse((response) => response.url() === origin + '/api/admin/users/WORKER-NORMAL/status' && response.request().method() === 'PUT');
    await page.locator('#workersList button[data-action="worker-status"]').click();
    assert.equal((await approved).status(), 200);
    assert.equal(store.getUser(w.id).status, 'APPROVED');
    await page.waitForFunction(() => document.getElementById('workersList').textContent.includes('غیرفعال‌سازی'));
    await page.evaluate((row) => renderWorkers([row]), worker({ ...w, status: 'APPROVED' }));
    const blocked = page.waitForResponse((response) => response.url() === origin + '/api/admin/users/WORKER-NORMAL/status' && response.request().method() === 'PUT');
    await page.locator('#workersList button[data-action="worker-status"]').click();
    assert.equal((await blocked).status(), 200);
    assert.equal(store.getUser(w.id).status, 'BLOCKED');
    await page.evaluate((row) => renderOrders([row]), o);
    await page.locator('#tabOrdersBtn').click();
    const cancelled = page.waitForResponse((response) => response.url() === origin + '/api/admin/orders/ORDER-NORMAL' && response.request().method() === 'PUT');
    await page.locator('#ordersList button').click();
    assert.equal((await cancelled).status(), 200);
    assert.equal(store.getOrder(o.id).status, 'CANCELLED');
    // Each mutation starts an asynchronous refresh. Finish those refreshes
    // before checking an explicitly rendered empty-state fixture.
    await page.waitForFunction(() => window.__operationLoads.length === 3);
    await page.evaluate(() => Promise.all(window.__operationLoads));
    await page.evaluate(() => { renderWorkers([]); renderOrders([]); });
    assert.equal(await page.locator('#workersList').textContent(), 'هیچ متخصصی ثبت‌نام نکرده است.');
    assert.equal(await page.locator('#ordersList').textContent(), 'هیچ سفارشی وجود ندارد.');
  });
});
