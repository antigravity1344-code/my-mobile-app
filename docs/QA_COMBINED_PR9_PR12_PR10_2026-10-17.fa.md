# بسته QA محلی پاکشو — ترکیب PR9 + PR12 + PR10

**تاریخ:** ۱۷ اکتبر ۲۰۲۶  
**ماهیت:** کپی QA ایزوله در محیط Arena. **Merge/Push به GitHub انجام نشده و مجاز نیست مگر اجازهٔ جداگانهٔ مالک.**  
**شاخه محلی:** `qa/pr9-pr12-pr10-local`  
**SHA درخت ترکیبی:** `326117f7c74fd856bbee832cb718d8f502060f15`

این سند جایگزین CI GitHub، آزمون گوشی مالک، یا ادغام رسمی نیست.

---

## ۱. هدف این نوبت

نزدیک کردن نسخهٔ یکپارچهٔ اپ مشتری و اپ متخصص به **تست واقعی روی گوشی اندروید**، بدون بازنویسی معماری و بدون تصمیم مالی D-60.

مسیر اجراشده: کپی QA محلی از PR9 (چرخه شروع متخصص) + PR12 (اصلاح آزمون اعلان) + PR10 (پیش‌نمایش UI ایزوله).

---

## ۲. منابع زندهٔ GitHub در شروع کار (۱۷ اکتبر ۲۰۲۶)

| مرجع | مقدار زنده |
| --- | --- |
| شاخه پیش‌فرض و مرجع | `ui/customer-home-redesign` |
| HEAD مرجع | `2adb5cb3bce47a0855a1d359d2c1d3b9d0e4645d` (فقط مستندات؛ ۱۴ اکتبر/۱۶ اکتبر) |
| [PR #9](https://github.com/antigravity1344-code/my-mobile-app/pull/9) | OPEN / Draft / `mergeable_state=clean` / HEAD `8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40` / CI موفق [38208269197](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38208269197) |
| [PR #10](https://github.com/antigravity1344-code/my-mobile-app/pull/10) | OPEN / Draft / clean / HEAD `ef061ccdee4e00a3558fec773ad91a43010535cf` / CI موفق [38243459597](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38243459597) |
| [PR #12](https://github.com/antigravity1344-code/my-mobile-app/pull/12) | OPEN / Draft / clean / HEAD `a41a50855cdadc1a5445564c2318ad334b782906` / CI موفق با `workflow_dispatch` [38447707425](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38447707425) |
| [PR #15](https://github.com/antigravity1344-code/my-mobile-app/pull/15) | OPEN / Draft — **در این ترکیب وارد نشده** |
| [PR #17](https://github.com/antigravity1344-code/my-mobile-app/pull/17) | OPEN / Draft / فقط docs — وارد نشده |

**تفاوت با snapshotهای قدیمی:** Issue #13 هنوز HEAD قدیمی PR12 یعنی `be1008d` را ذکر می‌کند. HEAD زنده PR12 برابر `a41a508` است (سخت‌گیری آزمون اعلان، مأموریت 007 تست). snapshot ۱۶ اکتبر HEAD مرجع را `55a2a4a` می‌دانست؛ بعد از آن دو کامیت مستندات تا `2adb5cb` آمده‌اند. نتایج تست یک SHA به SHA دیگر نسبت داده نشد.

PR12 جد PR9 است. تنها فایل مشترک با PR10: `src/features/orders/context/OrdersContext.tsx`. ادغام محلی با استراتژی `ort` بدون تعارض انجام شد. هر دو قرارداد حفظ شده‌اند:

- PR9: `respondToStart(..., promptEventId)` و `acceptanceKey`
- PR10: `previewActive()` → شناسه `PREVIEW-CUSTOMER`

---

## ۳. آزمون‌های همین SHA (`326117f`)

محیط: Debian 13، Node اپ `v20.20.2` برای typecheck/lint/vitest؛ Node سرور `v24.11.0` به‌خاطر `node:sqlite`. Chromium Playwright 1.64.0 + `PAKSHO_TEST_CHROMIUM_SANDBOX=0`. کلید رمز و SQLite یک‌بارمصرف.

| آزمون | نتیجه روی `326117f` |
| --- | --- |
| `npm run typecheck` | موفق |
| `npm run lint` | صفر خطا، ۱۲ هشدار (۴ هشدار قدیمی اپ + هشدارهای PR10؛ اصلاح سلیقه‌ای انجام نشد) |
| `npm test` (vitest) | **۲۶۲/۲۶۲** در ۵۳ فایل |
| `node --test server/*.test.js` با Node 24 | **۱۹۶/۱۹۶** صفر شکست |
| بوت سرور توسعه روی `0.0.0.0:3000` | موفق؛ `POST /api/auth/send-otp` با `PAKSHO_SMS_MODE=fake` پاسخ `success:true` بدون برگرداندن کد |
| نصب APK / Metro روی گوشی | **در این محیط انجام نشد** (گوشی و ADB مالک موجود نیست) |
| CI GitHub روی SHA ترکیبی | **اجرا نشد** (بدون write و بدون Push) |

شمار ۲۶۲ اپ = ۲۲۸ PR9 + آزمون‌های پیش‌نمایش PR10. شمار ۱۹۶ سرور با گزارش PR9/PR12 روی SHAهای مبدأ هم‌خوان است، اما این اعداد فقط متعلق به `326117f` هستند.

آسیب‌پذیری npm اپ (۴۱ مورد تاریخی) دست نخورده؛ `npm audit fix` اجرا نشد.

---

## ۴. بازسازی همین درخت (محلی)

```bash
git clone https://github.com/antigravity1344-code/my-mobile-app.git paksho-qa
cd paksho-qa
git fetch origin \
  refs/heads/fix/server-acceptance-005:refs/heads/pr12 \
  refs/heads/ui/ux-ui-development:refs/heads/pr10
git switch -c qa/pr9-pr12-pr10-local pr12   # a41a508 شامل PR9 است
git merge pr10 --no-ff
# انتظار: Auto-merging OrdersContext.tsx بدون تعارض
```

اسکریپت کمکی: `scripts/reconstruct-qa-tree.sh`

---

## ۵. روش مصوب تست گوشی (Expo/Metro + سرور محلی)

سیاست مالک ۱۳ اکتبر: APK بعد از هر باگ ساخته نشود. مسیر روزمره:

1. **Node 24** برای سرور (`node:sqlite`).
2. سرور آزمایشی با SQLite و کلید تازه؛ **هرگز کلید تازه روی DB قدیمی**.
3. `PAKSHO_SMS_MODE=fake` فقط غیرproduction. پیامک واقعی و داده کاربر واقعی ممنوع.
4. گوشی به IP LAN رایانه روی پورت ۳۰۰۰ برسد، یا `adb reverse tcp:3000 tcp:3000` و `adb reverse tcp:8081 tcp:8081`.
5. `localhost` روی گوشی معمولاً خود گوشی است؛ `EXPO_PUBLIC_API_URL` را صریح بگذارید.
6. پیش‌نمایش UI فقط وقتی `EXPO_PUBLIC_PAKSHO_UI_PREVIEW=1` و `__DEV__`.

### ۵.۱ سرور

```bash
# Node 24
export NODE_ENV=development
export PAKSHO_SMS_MODE=fake
export PAKSHO_DATA_ENCRYPTION_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
export PAKSHO_SQLITE_PATH="$PWD/.local-qa/paksho.sqlite"
export PAKSHO_WORKER_DOC_DIR="$PWD/.local-qa/worker-docs"
export PAKSHO_ADMIN_PASSWORD='یک رمز قوی محلی'
export PORT=3000
mkdir -p "$PAKSHO_WORKER_DOC_DIR"
node server/index.js
```

اسکریپت: `scripts/run-local-qa-server.sh`

### ۵.۲ اپ مشتری / متخصص

اگر نسخهٔ native سازگار روی گوشی نیست، **یک‌بار**:

```bash
npm run android:customer   # com.paksho.customer / customerDebug
npm run android:worker     # com.paksho.worker / workerDebug
```

سپس Metro جدا برای هر نقش (نه هم‌زمان روی یک پورت):

```bash
# ترمینال مشتری
EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000/api \
EXPO_PUBLIC_PAKSHO_UI_PREVIEW=1 \
npx expo start --port 8081

# ترمینال متخصص (پورت دیگر)
EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000/api \
EXPO_PUBLIC_PAKSHO_UI_PREVIEW=1 \
npx expo start --port 8082
```

ورود توسعه دو دکمه دارد: «پیش‌نمایش بدون پیامک» و «ورود واقعی با پیامک». بدون `EXPO_PUBLIC_PAKSHO_UI_PREVIEW=1` فقط مسیر واقعی دیده می‌شود.

### ۵.۳ سناریوی گوشی پیشنهادی

**الف) پیش‌نمایش (بدون شبکه واقعی):** ناوبری خانه/رزرو/سفارش/پشتیبانی؛ پذیرش و اتمام باید پیام «در پیش‌نمایش غیرفعال است» بدهند نه موفقیت دروغین. خروج باید به انتخاب ورود برگردد و callback معوق به شبکه/حافظه واقعی نرسد.

**ب) جریان واقعی با API محلی:** ورود مشتری و متخصص، ثبت سفارش، پذیرش، شروع، پاسخ مشتری، تکمیل، لغو، خروج، جداسازی نشست دو اپ. **مبلغ مالی واقعی و D-60 در کار نیست.**

---

## ۶. مانع باقی‌مانده برای ورود واقعی روی گوشی

با `PAKSHO_SMS_MODE=fake` سرور کد را پیامک نمی‌کند، در JSON برنمی‌گرداند، و در SQLite فقط HMAC ذخیره می‌شود. این رفتار عمدی است (بدون endpoint کدخوانی).

در نتیجه **ورود واقعی روی گوشی با پیامک جعلی، بدون مشاهدهٔ کد، ممکن نیست.** گزینه‌های نیازمند تصمیم مالک:

1. تنظیم کاوه‌نگار آزمایشی (پیامک واقعی به شمارهٔ خودتان؛ نه کاربر واقعی محصول).
2. اجازهٔ چاپ کد فقط روی stderr سرور وقتی `PAKSHO_SMS_MODE=fake` و `NODE_ENV!==production` — نه API و نه کد ثابت.
3. فعلاً فقط مسیر پیش‌نمایش PR10 روی گوشی.

تا یکی از این‌ها، آزمون انتهابه‌انتهای ورود/سفارش واقعی روی گوشی در این محیط متوقف است.

---

## ۷. کارهایی که در ادامهٔ همان روز انجام شد (بعد از این بستهٔ اولیه)

ثبت کامل: [PROJECT_RECORD_2026-10-17.fa.md](./PROJECT_RECORD_2026-10-17.fa.md)

- زمان‌بند لغو D-11 در فرآیند سرور
- پیام خطای GPS اگر موقعیت نیاید
- پیش‌نمایش وب با انتخاب مشتری/متخصص
- مدرک هویتی: کیفیت ۱، حفظ فرمت، سقف ۸ مگابایت با متن روی صفحه (D-62 استقرار پاکشو)
- مهلت قطع درخواست شبکهٔ گیر کرده

## ۷-ب. کارهایی که همچنان انجام نشد (عمدی)

- Push / Merge / Rebase / Force Push روی GitHub
- ادغام به `ui/customer-home-redesign`
- PR15 / سیاست مدارک چنداستقرار / G1
- D-60 و هر عدد مالی
- `npm audit fix`
- ساخت APK تازه و تست روی گوشی مالک
- دست‌زدن به ۴۷ فایل unstaged/untracked روی ویندوز مالک (اینجا موجود نیستند)

---

## ۸. تصمیم مالک در این نوبت و مرحلهٔ بعد

**OTP:** مالک در ۱۷ اکتبر ۲۰۲۶ مسیر «فعلاً فقط پیش‌نمایش» را انتخاب کرد. چاپ کد در لاگ و کاوه‌نگار اجرا نشد.

**عکس مدرک:** کیفیت ۱ و حفظ فرمت؛ سقف ۸ مگابایت باید قبل از ارسال به کاربر گفته شود.

چک‌لیست اجرایی گوشی: [PHONE_PREVIEW_STEPS.fa.md](./PHONE_PREVIEW_STEPS.fa.md)

مرحلهٔ بعد، روی رایانه و گوشی مالک:

1. اجرای تست آزمایشی با **همین** نسخه (نه برنامهٔ قدیمی روی گوشی).
2. فقط بعد از آن: OTP در این درخت یا اجازهٔ ادغام PR9/PR12.
3. PR15 و G1 وارد نسخهٔ گوشی نشوند مگر تصمیم جدا.

**حکم:** درخت ترکیبی محلی از نظر آزمایش خودکار اپ/سرور سبز است. مسیر پیش‌نمایش در همین محیط آزموده شد. نسخهٔ گوشی هنوز تأیید نشده. این بسته مجوز انتشار نیست.
