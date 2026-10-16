import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('../server/node_modules/playwright-core');

const chrome = process.env.PAKSHO_TEST_CHROMIUM_PATH
  || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const outDir = '/home/user/paksho-qa/.local-qa';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
page.setDefaultTimeout(20000);
const notes = [];
const fail = (msg) => {
  notes.push('FAIL ' + msg);
  throw new Error(msg);
};
const textOf = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();

try {
  const chooser = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  notes.push('CHOOSER_HTTP ' + chooser?.status());
  await page.waitForTimeout(500);
  await page.screenshot({ path: outDir + '/00-chooser.png', fullPage: true });
  const chooserText = await textOf();
  notes.push('CHOOSER_TEXT ' + chooserText.slice(0, 300));
  if (!chooserText.includes('برنامه مشتری') || !chooserText.includes('برنامه متخصص')) {
    fail('صفحه انتخاب دو برنامه دیده نشد');
  }

  await page.goto('http://127.0.0.1:4173/app.html?role=customer', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outDir + '/01-start.png', fullPage: true });
  const start = await textOf();
  notes.push('CUSTOMER_START ' + start.slice(0, 300));
  if (!start.includes('مشتری')) fail('برنامه مشتری باز نشد');
  await page.getByText('ورود به پیش‌نمایش بدون پیامک').first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outDir + '/02-home.png', fullPage: true });
  const home = await textOf();
  notes.push('CUSTOMER_HOME ' + home.slice(0, 400));
  if (home.includes('ورود واقعی با پیامک')) fail('مشتری وارد پیش‌نمایش نشد');
  for (const label of ['خانه', 'رزرو', 'سفارش', 'پروفایل']) {
    const tab = page.getByText(label, { exact: false });
    if (await tab.count()) {
      await tab.first().click();
      await page.waitForTimeout(600);
      notes.push('CUSTOMER_TAB_OK ' + label);
    } else notes.push('CUSTOMER_TAB_MISSING ' + label);
  }

  await page.goto('http://127.0.0.1:4173/app.html?role=worker', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outDir + '/04-worker-start.png', fullPage: true });
  const workerStart = await textOf();
  notes.push('WORKER_START ' + workerStart.slice(0, 300));
  if (!workerStart.includes('متخصص')) fail('برنامه متخصص باز نشد');
  await page.getByText('ورود به پیش‌نمایش بدون پیامک').first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outDir + '/05-worker-home.png', fullPage: true });
  const workerHome = await textOf();
  notes.push('WORKER_HOME ' + workerHome.slice(0, 400));
  if (workerHome.includes('ورود واقعی با پیامک')) fail('متخصص وارد پیش‌نمایش نشد');
  notes.push('PASS customer and worker preview');
} catch (error) {
  await page.screenshot({ path: outDir + '/99-error.png', fullPage: true }).catch(() => {});
  notes.push('ERROR ' + error.message);
  fs.writeFileSync(outDir + '/browser-preview.log', notes.join('\n') + '\n');
  await browser.close();
  process.exit(1);
}

fs.writeFileSync(outDir + '/browser-preview.log', notes.join('\n') + '\n');
await browser.close();
console.log(notes.join('\n'));
