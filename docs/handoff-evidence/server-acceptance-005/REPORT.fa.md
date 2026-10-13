# PAKSHO-APP-SERVER-ACCEPTANCE-005 — گزارش شواهد

**مأموریت:** رفع/تعیین تکلیف موانع پذیرش سرور — توقف آزمون مرورگری، شکست ترتیب اعلان، اختلاف شمارش ۱۹۶↔۱۶۴.
**دستور ناظر:** https://github.com/antigravity1344-code/my-mobile-app/pull/9#issuecomment-6133622895
**شاخه کاری:** `fix/server-acceptance-005`
**مبنا (BASE_SHA):** `8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40` (PR #9)
**محیط:** Linux، Node.js v22.22.0، اجرا به‌عنوان root در کانتینر ایزوله.

هیچ فایلی خارج از فهرست مجاز تغییر نکرد: `server/orderEvents.test.js`، و این پوشه شواهد. `server/adminDashboard.xss.test.js` دست نخورد (رفع فقط با متغیر محیطی موجود در همان فایل بود، نه ویرایش کد). هیچ تغییری در `server/dataStore.js`، `server/index.js`، PR #9، PR #10 یا شاخه مرجع انجام نشد.

---

## ۱. اختلاف شمارش ۱۹۶ در مقابل ۱۶۴

**نتیجه‌گیری اصلی:** این اختلاف واقعی بین دو گزارش قبلی نیست؛ هر دو عدد درست بوده‌اند، فقط برای دو محیط متفاوت. علت با بازتولید مستقیم (نه فرض) ثابت شد:

Chromium در این کانتینر به‌عنوان root اجرا می‌شود و بدون غیرفعال‌کردن صریح sandbox، launch آن fail می‌شود (`Running as root without --no-sandbox is not supported`). فایل `server/adminDashboard.xss.test.js` از قبل متغیر محیطی `PAKSHO_TEST_CHROMIUM_SANDBOX` را برای همین حالت پیش‌بینی کرده بود (خط ۵۹: `chromiumSandbox: process.env.PAKSHO_TEST_CHROMIUM_SANDBOX !== '0'`)، اما این متغیر در اجراهای قبلی تنظیم نشده بود.

**بازتولید مستقیم، دو بار روی همان commit، با دستور دقیقاً مطابق سند معماری (`node --test *.test.js`):**

| اجرا | PAKSHO_TEST_CHROMIUM_SANDBOX | tests | pass | fail | skip | cancel |
|---|---|---|---|---|---|---|
| بدون رفع (پیش‌فرض کانتینر) | تنظیم نشده | **164** | 156 | **8** | 0 | 0 |
| با رفع (`=0`) | `0` | **196** | **196** | 0 | 0 | 0 |

وقتی `before` هوک راه‌اندازی مرورگر در `adminDashboard.xss.test.js` fail می‌شود، نه‌فقط ۸ تست سطح بالای همان فایل fail می‌شوند، بلکه زیرتست‌های تکرارشونده داخل بعضی از آن ۸ تست (مثل زیرتست‌های جدا برای «worker» و «order» در یک مورد) هم هرگز اجرا نمی‌شوند؛ چون شمارش نهایی `node --test` همه زیرتست‌ها را هم به‌صورت flatten می‌شمارد، همین باعث اختلاف ۳۲تایی در شمارش کل (۱۹۶ در مقابل ۱۶۴) می‌شود، نه فقط اختلاف ۸تایی در شکست‌ها.

عدد ۱۵۵/۹ گزارش‌شده قبلی (به‌جای ۱۵۶/۸ اینجا) با شکست مستقل و جداگانه `orderEvents.test.js` (بخش ۳ همین گزارش) که در آن اجرا هنوز رفع نشده بود، کاملاً سازگار است: ۸ شکست مرورگری + ۱ شکست ترتیب اعلان = ۹؛ پس از رفع بخش ۳، تنها ۸ شکست (مرورگری) باقی می‌ماند.

**نتیجه:** نه کد تست‌ها نیاز به skip یا حذف assertion داشت، نه مرورگر ساختگی لازم بود. فقط آماده‌سازی محیط (پیدا کردن Chromium نصب‌شده Playwright در `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` و فعال‌سازی متغیر محیطی موجود) کافی بود؛ هیچ فایلی برای این بخش ویرایش نشد.

---

## ۲. Chromium

مرورگر از قبل در محیط عامل (Playwright bundled) موجود بود؛ نصب جدید یا تغییر lockfile لازم نشد:

```
/opt/pw-browsers/chromium-1194/chrome-linux/chrome  (Chromium 141.0.7390.37)
```

دستور اجرای کامل مجموعه سرور با مرورگر واقعی:

```bash
cd server
npm ci   # نصب وابستگی‌های devDependency (playwright-core) — بدون تغییر package-lock.json
PAKSHO_TEST_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
PAKSHO_TEST_CHROMIUM_SANDBOX=0 \
node --test *.test.js
```

نتیجه: ۸ تست سطح بالا (۱۰ شامل زیرتست‌ها) در `adminDashboard.xss.test.js` با مرورگر واقعی، بدون skip و بدون حذف assertion، موفق. جزئیات کامل در `final_full_run.log` همین پوشه.

**نکته محیطی برای مأموریت‌های بعدی:** `PAKSHO_TEST_CHROMIUM_SANDBOX=0` فقط برای کانتینرهایی لازم است که تست به‌عنوان root اجرا می‌شود (مثل این عامل). این مقدار در کد commit نشد؛ فقط متغیر محیط اجرا بود.

---

## ۳. شکست ترتیب اعلان‌ها — `orderEvents.test.js:1036`

### علت ریشه‌ای (با بازتولید مستقل ثابت شد، نه با فرض)

کوئری `listNotifications` در `server/dataStore.js` (خط ۱۴۸۴-۱۴۸۶) با `ORDER BY createdAt DESC` بدون هیچ کلید دوم مرتب می‌شود:

```sql
SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50
```

`createdAt` با `new Date().toISOString()` با دقت میلی‌ثانیه ساخته می‌شود (`dataStore.js:1526`). وقتی دو اعلان برای همان کاربر در یک میلی‌ثانیه ثبت شوند (کاملاً ممکن در یک تراکنش سریع یا دو درخواست HTTP پشت‌سرهم روی loopback)، ترتیب دو ردیف هم‌زمان در خروجی SQL **تعریف‌نشده** است.

تست `orderEvents.test.js` (تابع «admin reassigning an active order notifies both previous and new workers») اعلان‌های «تازه» را با این الگو تشخیص می‌داد:

```js
const orderNotes = (userId, orderId) =>
  store.listNotifications(userId).filter(...).reverse();
const before = orderNotes(...).length;
...
const fresh = orderNotes(...).slice(before);   // فرض: ترتیب پس از reverse همیشه پایدار است
```

این فرض وقتی دو اعلان هم‌زمان ثبت شوند درست نیست.

### بازتولید مستقل (بدون فرض)

با یک اسکریپت تشخیصی جدا (خارج از مخزن، در پوشه scratchpad عامل)، دو اعلان با `createdAt` یکسانِ اجباری (با فریز موقت `Date` فقط در اسکریپت تشخیصی) ثبت شد:

```
Both rows share createdAt: true
Raw DESC order from listNotifications(): [ 'ORDER_ASSIGNED', 'ORDER_STATUS' ]
After .reverse(): [ 'ORDER_STATUS', 'ORDER_ASSIGNED' ]
```

یعنی اعلان قدیمی‌تر (`ORDER_ASSIGNED`) بعد از `reverse()` در موقعیتی قرار گرفت که منطق «تازه‌ها» آن را به‌جای اعلان واقعاً جدید (`ORDER_STATUS`) برمی‌گرداند.

سپس همین تساوی زمانی، دقیقاً روی نسخه اصلی (تغییرنکرده) `orderEvents.test.js` با فریز موقت `Date` بین دو فراخوانی `adminPut` واقعی (مرحله ۴ و ۵ همان تست) تحمیل شد؛ نتیجه:

```
expected: 'ORDER_STATUS'
actual:   'ORDER_ASSIGNED'
```

**این دقیقاً همان شکست گزارش‌شده در `orderEvents.test.js:1036` است** — بازتولید کامل، نه فرضی.

### آیا باگ تولیدی است؟

نه در داده یا منطق سفارش/اعلان: هر اعلان با محتوای درست (کاربر، نوع، متن) ثبت می‌شود؛ فقط **ترتیب نمایش** دو ردیف با `createdAt` یکسان در یک کوئری بدون کلید دوم تعریف‌نشده است. این یک فرض نادرست در کمکی تست (`reverse+slice`) بود، نه یک تخلف از تصمیم معماری یا منطق سفارش. طبق دستور، **`dataStore.js` تغییر نکرد**.

### رفع (فقط در `server/orderEvents.test.js`)

به‌جای شمارش/`slice`، اعلان‌های «تازه» با اختلاف `id` نسبت به یک snapshot قبلی (`Set` از idها) تشخیص داده می‌شوند؛ این روش به ترتیب مبهم بین ردیف‌های هم‌زمان حساس نیست. تعداد، نوع (`kind`)، مالک (کاربر مورد پرسش از قبل فیلتر شده) و متن اعلان‌ها دقیقاً مثل قبل بررسی می‌شوند؛ هیچ assertion حذف یا تضعیف نشد.

**تأیید رفع:** همان بازتولید (فریز `Date` بین مراحل ۴ و ۵) این‌بار روی نسخه اصلاح‌شده اجرا شد و موفق شد — یعنی رفع، تحت دقیقاً همان شرط تساوی زمانی که قبلاً باعث شکست می‌شد، پایدار است.

---

## ۴. اجرای نهایی کامل (پس از اصلاح هدفمند)

دستور، دقیقاً یک بار، با مرورگر واقعی و SMS آزمایشی (`PAKSHO_SMS_MODE=fake`، از قبل در `testAuthHarness.js` تنظیم‌شده — بدون شبکه واقعی):

```bash
PAKSHO_TEST_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
PAKSHO_TEST_CHROMIUM_SANDBOX=0 \
node --test *.test.js
```

**نتیجه (لاگ کامل در `final_full_run.log`):**

```
# tests 196
# suites 0
# pass 196
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Exit code: `0`.

بررسی‌های مرتبط چون فایل آزمون تغییر کرد:

- `npx tsc --noEmit` (ریشه مخزن): بدون خطا.
- `npx vitest run` (ریشه مخزن، ۴۶ فایل): ۲۲۸ از ۲۲۸ موفق — مطابق گزارش PR #9.

چهار معیار خروج و کل اپ دوباره از صفر اجرا نشدند (طبق محدوده مأموریت)؛ فقط typecheck و vitest به‌عنوان بررسی جانبی لازم چون فایل تست تغییر کرد، اجرا شدند.

---

## ۵. فایل‌های تغییریافته

- `server/orderEvents.test.js` — اصلاح کمکی تشخیص اعلان «تازه» از شمارش/slice به تفاوت id؛ بدون تغییر در تعداد، نوع یا محتوای assertionها.
- `docs/handoff-evidence/server-acceptance-005/` (این پوشه) — گزارش و لاگ‌های کامل.

`server/adminDashboard.xss.test.js`، `server/dataStore.js`، `server/index.js`، PR #9، PR #10 و شاخه مرجع (`ui/customer-home-redesign`) تغییر نکردند.

---

## ۶. محدودیت‌های باقی‌مانده

- نتیجه فوق برای این یک اجرا است؛ تساوی زمانی اعلان‌ها (ریشه بخش ۳) همچنان در `dataStore.js` باقی است و فقط در این مسیر تست خاص، با تغییر همان تست، بی‌اثر شد. اگر الگوی مشابه (شمارش/`reverse`/`slice` روی `listNotifications`) در تست یا کد دیگری استفاده شود، همان ریسک وجود دارد؛ رفع ریشه‌ای (مثلاً افزودن کلید دوم مرتب‌سازی یا ستون ترتیب یکتا به `notifications`) تغییر `dataStore.js` است و خارج از محدوده همین مأموریت.
- قیمت‌گذاری سمت سرور (D-60) و هر سیاست مالی بررسی یا پیاده نشد.
- ادغام PR #9/#10 در این مأموریت انجام یا توصیه قطعی نشد؛ طبق دستور ناظر، تصمیم ادغام با ناظر است.
