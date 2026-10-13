# سند تحویل واحد پروژه پاکشو

> **وضعیت زنده در برابر تاریخچه — به‌روزرسانی ۱۳ اکتبر ۲۰۲۶:** در آخرین بررسی API، شاخه **پیش‌فرض و مرجع توسعه** هر دو `ui/customer-home-redesign` هستند. مواردی در بخش‌های تاریخی پایین که `feature/orders` را پیش‌فرض فعلی معرفی می‌کنند، صرفاً وضعیت زمان ثبت آن بخش‌اند و **دیگر معتبر نیستند**. اطلاعات SHA و وضعیت PR نیز snapshot است و باید پیش از کار از GitHub دوباره خوانده شود. در آخرین بررسی: PR #9 = `8ac99c5` (Draft)، PR #10 = `ef061cc` (Draft)، PR #12 = `a41a508` (Draft، وابسته به #9). هیچ‌کدام ادغام نشده‌اند. منبع سیاست جلوگیری از بازکاری: [Issue #13](https://github.com/antigravity1344-code/my-mobile-app/issues/13).


**راهنمای ورود سریع (مخصوص Claude Code، اما قابل استفاده برای همه ایجنت‌ها):** [CLAUDE.md](../CLAUDE.md) — [لینک مستقیم در گیت‌هاب](https://github.com/antigravity1344-code/my-mobile-app/blob/ui/customer-home-redesign/CLAUDE.md).

**این سند، مرجع مشترک همه ایجنت‌هاست** (Claude Code، Codex و سایر ابزارها). هر ایجنت باید پیش از شروع مأموریت این سند را بخواند و دریافت و بررسی آن را در گزارش اولیه تأیید کند؛ صرف وجود لینک به معنی خوانده‌شدن نیست. اطلاعات این سند تاریخ‌دارند و وضعیت لحظه‌ای شاخه‌ها، PRها و CI باید دوباره بررسی شود.

مشاهده: 2026-10-12T13:44:15.183063+03:30، Asia/Tehran. **نسخه فعلی در شاخه مرجع `ui/customer-home-redesign` منتشر شده است؛ اطلاعات بخش‌های تاریخی مربوط به زمان ثبت آن‌هاست.** این سند مجوز merge، حذف، default change یا سیاست مالی نیست. دستور جاری صاحب پروژه مقدم است؛ پس از هر ادغام/تحویل مهم، SHA/PR/تست/مسئول به‌روز شود.

## نسخه ادامه و وضعیت PRها

مخزن یکتا: https://github.com/antigravity1344-code/my-mobile-app

| مرجع | SHA کامل | وضعیت |
|---|---|---|
| رسمی ui/customer-home-redesign | febe14ee679c4d71b177e3b65844be6b14ce9625 | PR9/10 هنوز در آن نیستند |
| PR9 / integration/worker-start-followup-20261012 | 8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40 | کد/تست پذیرفته، OPEN/Draft؛ انتظار اجازه نهایی |
| PR10 / ui/ux-ui-development | 556d2f4cd64d3825622222e6004d0e96ac6dffff | OPEN/Draft؛ آخرین تغییرها مسئول UX/UI، نیازمند تحویل/بازبینی مستقل |
| پیش‌فرض feature/orders | 67abba4b162917ffddbfca9ee741b230d8ac399c | نسخه تاریخی، مرجع جاری نیست |
| main | 165ad0b24a2088599f0b3bf0d04806dda37d0f28 | محفوظ و بدون تغییر |

آخرین کنترل مستقل PR10 روی 2283298 بود؛ هر head تازه، همان نتیجه تست قدیمی را ندارد و هنوز مجوز ادغام ندارد. وضعیت لحظه‌ای دوباره از GitHub خوانده شود. این شاخه مستندات از febe14ee و فقط README/docs ساخته می‌شود؛ commit آن از head شاخه/گزارش انتشار مشخص است، نسخه اپ نیست.

| PR | شاخه | وضعیت snapshot | SHA |
|---|---|---|---|
| [#10](https://github.com/antigravity1344-code/my-mobile-app/pull/10) | ui/ux-ui-development | OPEN / Draft | 556d2f4cd64d3825622222e6004d0e96ac6dffff |
| [#9](https://github.com/antigravity1344-code/my-mobile-app/pull/9) | integration/worker-start-followup-20261012 | OPEN / Draft | 8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40 |
| [#8](https://github.com/antigravity1344-code/my-mobile-app/pull/8) | integration/ui-safe-only-20261012 | MERGED | 2cfe60cd64b3df1bbd5c5bb5eed955d4b2a1504a |
| [#7](https://github.com/antigravity1344-code/my-mobile-app/pull/7) | integration/ui-folder-reconcile-20261011 | CLOSED / Draft | 5c8b5269a102f4ba16d0b35ffd2b2d3d8510a619 |
| [#6](https://github.com/antigravity1344-code/my-mobile-app/pull/6) | fix/admin-dashboard-xss | MERGED | 9c112e06c83e66ace70f5fb4bd1585c98bb77912 |
| [#5](https://github.com/antigravity1344-code/my-mobile-app/pull/5) | cursor/stage4-loyalty-tier-e352 | MERGED | 280dc6b1616f5dd774701a4b56faf1ebe0f53d60 |
| [#4](https://github.com/antigravity1344-code/my-mobile-app/pull/4) | cursor/stage3-order-cancel-e352 | MERGED / Draft | bf456381b2b367ca9ee9600a990f3465a1ab3bec |
| [#3](https://github.com/antigravity1344-code/my-mobile-app/pull/3) | cursor/architecture-followup-e352 | MERGED / Draft | a8b0ae5f7abdb7a93908f796b234eba9b6aa5a69 |
| [#2](https://github.com/antigravity1344-code/my-mobile-app/pull/2) | cursor/ui-redesign-f51e | CLOSED / Draft | 07a708d983711cbdb86963cd117ad6fd5147b7a7 |

PR6/XSS و PR8/UI ادغام‌شده؛ PR7 فقط CLOSED نه MERGED و چهار کامیت اختصاصی دارد. PR2 بسته و نام شاخه فعلاً remote نیست؛ گم‌شدن همه محتوا نتیجه‌گیری نشود.

## قابلیت‌های موجود و محدودیت تکمیل

| بخش | مرجع رسمی | پذیرفته ولی ادغام‌نشده/باز |
|---|---|---|
| مشتری | native، خانه/رزرو، سفارش/جزئیات، لغو، امتیاز، پروفایل/آدرس، اعلان/پشتیبانی | PR9 پاسخ شروع با promptEventId و 409؛ آدرس/timeout/logout مسائل باز دارند |
| متخصص | آنبوردینگ/مدارک/تأیید، کارتابل/سفارش مسئول/تکمیل/سابقه | PR9 acceptanceKey و حفظ سفارش قدیمی؛ مبلغ کل دستمزد قطعی نیست |
| سرور | Express/SQLite، OTP/نشست/نقش، مدارک خصوصی، رویداد/لغو/امتیاز/وفاداری، HTML مدیر | PR9 metadata دوره/فرمان مدیر و رد هش OTP/نشست؛ قیمت معتبر و زمان‌بند مستقل آماده نیست |
| پیش‌نمایش | در مرجع رسمی نیست | PR10 mock حافظه‌ای؛ آخرین کنترل خروج ناموفق، head تازه باید تحویل شود |
| مالی | DTO/نمونه‌های قبلی | قیمت معتبر/تسویه/درگاه آماده نیست؛ topup موجود 501؛ سفارش مالی واقعی مجاز نیست |

وجود کد، تأیید پایلوت/گوشی نیست. مسیرها: index.customer.ts/App.customer.tsx، index.worker.ts/App.worker.tsx، src/features/orders، NativeWorkerPortal، src/api، ProfileContext و server/index.js/dataStore.js. لغو در dataStore است؛ server/cancelRequest.js وجود ندارد.

## PR9: انتشار و آمادگی مستقل

نه کامیت زیر در GitHub با API و ancestry head تأیید شدند؛ PR9 مستقل از PR10 است.

| کامیت افزوده | شواهد |
|---|---|
| 9c910c41d2677429ca10aac9d397ac3c07e414a8 | API/ancestry تأیید شد |
| 2f211d7fd65cd7033130c3dfa734b75f37437f96 | API/ancestry تأیید شد |
| 84e396d12303bf67d78e2f68e63ceef2fce06df4 | API/ancestry تأیید شد |
| 5a4964a492729099b4172a062503aa2b186aea71 | API/ancestry تأیید شد |
| 9283a779f5499ef53f3ec56e581cddf05fad1c00 | API/ancestry تأیید شد |
| 88c952fd1c66d95852ae7e4c07be15a67bfa2bac | API/ancestry تأیید شد |
| 1d8adff3807bf897672144b7aff0f275dfeea5a0 | API/ancestry تأیید شد |
| 14ec67249ac165634361f13c114583e1e6d8816d | API/ancestry تأیید شد |
| 8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40 | API/ancestry تأیید شد |

[CI 8ac99c5](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38208269197): سه job موفق و پنج artifact. واقعی همان SHA: ۱۹۶ تست سرور، ۲۲۸ اپ/۴۶ فایل، TypeScript موفق، Lint صفر خطا/چهار warning قبلی؛ هر دو Android Debug ARM64 موفق. [لاگ و metadata ماندگار](handoff-evidence/README.md) برای انقضای artifact CI حفظ شده‌اند.

رویداد افزایشی dataJson/دوره پذیرش، مرجع دقیق پرسش، تکرار/تعارض/درخواست معوق، حریم خصوصی/مالکیت/CANCEL_REQUESTED و امنیت OTP/نشست پوشش دارند. پذیرش تازه فقط خلاصه دوره را reset می‌کند؛ تاریخچه/مبالغ بازنویسی نمی‌شوند. تکمیل چهار وضعیت فعال و سفارش قدیمی بدون acceptedAt محفوظ است.

bundle محلی تازه در 88c952f ساخته شد؛ برابری اپ/native و assemble/امضا روی 8ac ثبت شد. CI هر دو APK را مستقلاً از 8ac ساخت. APK debug/loopback عملیاتی نیست؛ ورود/گردش گوشی توسط این عامل انجام نشده و صاحب پروژه فعلاً آن را مانع ادغام نکرده است.

PR9 برای **اجازه نهایی** معرفی شود؛ اکنون merge مجاز نیست. پیش از merge head/base/tag و پس از merge تست SHA تازه و به‌روزرسانی سند الزامی است.

## PR10 و قرارداد بازبینی بعدی

آخرین ترکیب آزموده b86a3512ed4833f48540f582a3626ba4a7d90072 با a447ac5 بود: ۱۹۶ سرور/۲۵۲ اپ در ۵۱ فایل، TypeScript موفق؛ ده warning (چهار قبلی/شش PR10). 2283298 صرفاً سند گوشی افزود؛ ۲۸۸ فایل کد/تنظیمات برابر بود، نه ادعای اجرای تست روی SHA تازه. headهای جدید بعدی در این کنترل پذیرفته نشده‌اند.

تنها فایل مشترک OrdersContext.tsx؛ ترکیب هر دو ترتیب بدون تعارض/tree برابر و حفظ promptEventId/resolver. ۱۰۳ تست فعال موفق؛ خروج ۱۴ probe، ده موفق/چهار ناموفق. endPreview پیش از پایان reload، flag، گارد fetch/XHR و مرز حافظه را برمی‌داشت؛ continuation مشتری، poll متخصص، timer آدرس و callback حافظه به مسیر واقعی شاهد می‌رسیدند. reload/timer شبیه‌سازی بودند؛ هیچ mutation/درخواست واقعی اجرا یا اثبات نشد. گزارش گوشی PR10 متعلق به عامل دیگر است؛ خروج عادی موفق، ایمنی callback معوق را اثبات نمی‌کند.

مسئول اصلاح **UX/UI روی ui/ux-ui-development**؛ عامل اصلی PR9 را برای آن تغییر نمی‌دهد. پس از تحویل نسخه اصلاح‌شده، بازبین مستقل بررسی کند: callback مبدأ پیش‌نمایش در خروج/تأخیر/شکست reload/native/web به شبکه، credential یا read/write/delete حافظه واقعی نرسد؛ قفل تا تعویض runtime حفظ شود.

probe خام چند assertion تشخیصی وقوع رفتار ناامن دارد؛ شواهد اصلی محفوظ‌اند. در پذیرش آینده، آنها مشاهده تشخیصی شوند و معیار صفر side effect حفظ شود؛ تست به پیاده‌سازی previewActive وابسته نباشد. [منبع و دستور](handoff-evidence/probes/README.md). fixture قبلی شروع/پرسش را کامل نمایش نمی‌داد؛ این محدودیت جای حفاظت شبکه نیست.

## تصمیم قطعی و باز

[ADR رسمی](ARCHITECTURE_DECISIONS.md) و [قرارداد دقیق PR9 در کامیت تأییدشده](https://github.com/antigravity1344-code/my-mobile-app/blob/8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40/docs/PR9_TECHNICAL_REVIEW.fa.md) مبنا؛ دستور جدید در اصلاح صریح ADR پس از بازبینی منعکس شود.

| موضوع | وضعیت |
|---|---|
| D50 | مسئول سفارش؛ ACCEPTED/CONFIRMED/ASSIGNED/IN_PROGRESS؛ فقط-ACCEPTED یا قفل سفارش تاریخی مجاز نیست |
| D52 | dataJson nullable/additive و مرجع دوره در PR9 ثبت؛ تاریخچه/مبلغ محفوظ |
| D53 | API اختلاف/تصمیم؛ پنل کامل و هویت فردی/RBAC مدیر آینده است |
| D11 | قواعد/تست موجود؛ اجرای مستقل سررسید لغو باقی |
| D04 | سند فعلی point_rules؛ تفکیک مالی/امتیاز، اصلاح ADR صریح؛ داده امتیاز تغییر نکند |
| D07 | نسخه قدیمی/تاریخچه محفوظ؛ quote جدید/legacy financial write نیازمند طراحی انتقال |
| D60 | جهت تازه: موتور قابل تنظیم، قوانین draft/active/inactive نسخه‌دار، quote معتبر، audit/RBAC/idempotency، fail closed بدون تعرفه؛ طرح بازبینی پیش از کد |
| سیاست | P01..P12 تا حد امکان تنظیم مدیریتی؛ مبلغ/درصد/کمیسیون/مدت quote پیش‌فرض عملیاتی ساخته نشود |
| پرسش خودکار | تأخیر مصوب نیست؛ هسته به زمان‌بند عملی وصل نیست؛ عدد/seed فرضی ممنوع |

D60 فعلی ADR هنوز ServiceOffer/عدم ساخت قیمت‌گذاری است؛ راهبرد تازه پیاده‌شده/اصلاح‌شده در ADR معرفی نشود. تعرفه واقعی/صاحب نهایی پیش‌نیاز زیرساخت نباشد ولی مجوز مرحله‌ای لازم است. طرح‌های قبلی D60 در گزارش/آرشیو محفوظ‌اند، سیاست مصوب نیستند. P0 مبلغ ارسالی مشتری باز است؛ مشتری/سفارش مالی واقعی تأیید نشده. helper قبلی BASE_PLATFORM_COMMISSION_RATE=0.2 بدهی است؛ PR9 نمایش سهم قطعی را حذف و نرخ تازه نساخت.

## اجرای پروژه/تست

Node24/node:sqlite، lockfile اپ/سرور، Chromium pinned برای XSS؛ Android JDK17/SDK/Gradle طبق workflow. پس از انتخاب checkout درست:

~~~bash
npm ci
npm ci --prefix server
cd server
npx --no-install playwright-core install chromium
cd ..
npm run typecheck
npm test -- --reporter=dot --maxWorkers=2 --minWorkers=1
npm run lint
~~~

dependency سیستم Chromium طبق workflow/مجوز محیط؛ TLS/verification/شبکه گسترده تغییر نکند. تست سرور فقط DB/مدارک تازه:

~~~bash
(
  set -e
  PAKSHO_TEST_DIR=$(mktemp -d)
  export NODE_ENV=test PAKSHO_SMS_MODE=fake EXPO_NO_DOTENV=1
  PAKSHO_TEST_CHROMIUM_PATH=$(node -e "process.stdout.write(require('./server/node_modules/playwright-core').chromium.executablePath())")
  export PAKSHO_TEST_CHROMIUM_PATH
  export KAVENEGAR_API_KEY='' KAVENEGAR_OTP_TEMPLATE=''
  export PAKSHO_SQLITE_PATH="$PAKSHO_TEST_DIR/paksho.sqlite"
  export PAKSHO_WORKER_DOC_DIR="$PAKSHO_TEST_DIR/worker-docs"
  export PAKSHO_DATA_ENCRYPTION_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
  node --test --test-concurrency=1 server/*.test.js
)
~~~

کلید چاپ نشود و روی DB واقعی/موجود استفاده نشود. XSS cloud محدود ممکن است PAKSHO_TEST_CHROMIUM_SANDBOX=0 فقط در fixture ایزوله طبق workflow نیاز داشته باشد؛ تنظیم عملیاتی/سیستم/شبکه نیست.

سرور توسعه به کلید ۳۲بایتی و مسیر امن/صریح DB/مدارک نیاز دارد؛ با کلید تازه روی DB قدیمی شروع نکنید. npm start --prefix server اجرا می‌کند. fake SMS کد دستی/ثابت ارائه نمی‌کند؛ testAuthHarness فقط NODE_ENV=test کد تولیدشده را در حافظه می‌گیرد. endpoint کدخوانی/bypass عملیاتی اضافه نشود.

مشتری index.customer.ts/App.customer.tsx، customerDebug/com.paksho.customer؛ متخصص index.worker.ts/App.worker.tsx، workerDebug/com.paksho.worker. EXPO_PUBLIC_API_URL صریح به backend مجاز، نه fallback LAN قدیمی. npm run android:customer و android:worker جدا؛ npm run web/index.ts داشبورد قدیمی. loopback گوشی، اتصال تست مجاز/adb reverse می‌خواهد. Android سنگین نوبتی/ترجیحاً CI؛ مستقل جای ترکیب نیست.

## مسیر محلی/اعتبار

| مسیر | نتیجه بررسی |
|---|---|
| /workspace/my-mobile-app | HEAD8ac99c5 و status تمیز؛ تمام کامیت اپ منتشر |
| /workspace/pr9-pr10-integration-20261012 | HEADb86a351 آزمایش؛ سه ترکیب tag شده، به محصول push نشده |
| /workspace/reports | مدرک/طرح D60/APK/log/bundle؛ ۳۵۱ فایل اصلی + دو نتیجه کش symlink در موجودی۳۵۳ محفوظ؛ محرمانه عمومی نشود |
| /workspace/android-tools | toolchain محفوظ، کد پروژه یکتا نیست |
| /workspace/paksho-validation و /tmp/paksho-* | نام/حجم/hash داده تست؛ DB/محتوا عمومی نشده؛ حذف جدا |
| Windows/محیط UX/UI/my-mobile-app-ui تاریخی | غیرقابل دسترسی/تأیید؛ ادعای نبود تغییر نشود |

node_modules ترکیبی به اصلی symlink؛ حذف اصلی هر دو را می‌شکند. ignored authored هم بررسی شد؛ در این دو checkout موردی نبود. cache/build کد مصوب نیست؛ حذفش نیازمند بازسازی و اجازه جداست.

## بازگشت و بازیابی

tag منتشرشده [rollback/pre-pr9-ui-20261012](https://github.com/antigravity1344-code/my-mobile-app/tree/rollback/pre-pr9-ui-20261012)، target کامل febe14ee679c4d71b177e3b65844be6b14ce9625. backup c88d58d و همه restoreها و rollback/admin-xss-47027e7 محلی محفوظ‌اند.

۱۹ head/تاریخچه کامل در /workspace/reports/project-stabilization-20261012/all-remote-heads.bundle، verify موفق. ترکیب‌ها در final-snapshot.bundle قبلی‌اند و رسمی نیستند. آرشیو/hashها پیش از خروج/حذف محیط امن نزد صاحب پروژه نگه‌داری شوند؛ ماندگاری filesystem فرض نشود. کد/این سند از GitHub قابل دریافت‌اند.

بازیابی در محل جدید و خالی پس از بررسی وضع موجود:

~~~bash
git clone --branch ui/customer-home-redesign https://github.com/antigravity1344-code/my-mobile-app paksho-recovery
git -C paksho-recovery fetch origin refs/tags/rollback/pre-pr9-ui-20261012:refs/tags/rollback/pre-pr9-ui-20261012
git -C paksho-recovery switch --detach rollback/pre-pr9-ui-20261012
~~~

برای bundle ابتدا verify/list-heads و import در repo جدید؛ refs/remotes داخل bundle با branch فرضی clone اشتباه نشود. reset --hard/checkout اجباری/بازنویسی تاریخچه ممنوع. داده/کلید واقعی جدا و امن، نه Git.

## شاخه‌ها/default/شروع ایجنت

[ممیزی اولیه](PROJECT_BRANCH_AUDIT.fa.md) و [مکمل head جاری و شاخه مستندات](PROJECT_BRANCH_AUDIT_SUPPLEMENT.fa.md): snapshot اولیه۱۹ شاخه، پنج فعال/چهار بازگشت/پنج merged نامزد بررسی حذف/دو قدیمی بدون اختصاصی/سه unmerged اختصاصی. PR8 squash و tree برابر، PR7 چهار اختصاصی. شاخه docs تازه فعال/در انتظار بررسی؛ نامزد حذف مجوز نیست، هیچ حذف اجرا نشد. تغییرهای تازه UX/UI به snapshot تاریخ‌دار نسبت داده نشوند.

پیشنهاد default آینده ui/customer-home-redesign فقط بعد از تصویب مالک و بررسی protection/rulesets/required checks/CI/استقرار/PR مقصد/clone/setup/ابزارها. main/feature/orders فعلاً ثابت.

قبل کار git status --short --branch، git rev-parse HEAD و git ls-remote --heads origin. branch کاربر مقدم، وگرنه رسمی. default/HEAD restore را معتبر فرض نکنید؛ dirty/ignored/unpublished پیش switch محفوظ؛ بدون force/worktree/شاخه بی‌دلیل.

draft محیط هنوز **47027e7** است. start_skill guard تازه saved ولی Review/Save/Publish لازم؛ ref/membership عوض نشده، duplicate checkout و origin محلی clone با قرارداد replacement کامل سازگار نیست. حذف/بازتعریف بدون اجازه جدا انجام نشد. guard اصلاح قطعی ref یا اثبات restore تازه نیست؛ در آماده‌سازی بعدی یک checkout رسمی معتبر/ref مطابق HEAD واقعی و مرجع مصوب انتخاب شود.

## مأموریت دقیق بعدی

| مسئول | کار | شرط |
|---|---|---|
| ناظر/صاحب | سند و اجازه نهایی PR9 | head/base/tag/شواهد؛ merge هنوز مجاز نیست |
| اصلی | حفاظت Git؛ بعد اجازه صریح mergePR9/تستSHA جدید | PR10/UX/main/feature دست‌نخورده؛ سند به‌روز |
| UX/UI | خروج روی شاخه خودش | PR9 ثابت؛ callback معوق/failed reload/native/web به واقعی نرسد |
| مستقل | بعد تحویل UX خروج/ترکیب تازه | صفر side effect؛ مستقل جای ترکیب نیست |
| ناظر/اصلی بعد تثبیت | طرح D60/ADR صریح | تعرفه پیش‌نیاز زیرساخت نیست؛ کد مالی بعد مجوز مرحله‌ای بدون default فرضی |
| صاحب محیط | cleanup/default و Review/Save/Publish | این تحویل هیچ حذف/default change ندارد |

این نوبت توسعه تازه/اصلاح PR10/مالی شروع نشود. مالک نهایی/نرخ/هویت مدیر به قانون ثابت تبدیل نشوند؛ نفر بعد از وضعیت ثبت‌شده و تصمیم ناظر ادامه دهد.


---

## تکمیل نظارت ۱۳ اکتبر ۲۰۲۶ — ممیزی بدون تغییر شاخه‌های اجرایی

**منبع:** بررسی زنده GitHub در ۲۰۲۶-۱۰-۱۳؛ این بخش snapshot جدید است و جایگزین بررسی لحظه‌ای بعدی نمی‌شود.

- شمار شاخه‌های remote در زمان بررسی: **۲۴**. گزارش ۱۹ شاخه‌ای بالا مربوط به snapshot روز قبل است، نه شمار کنونی.
- شاخه مرجع توسعه: `ui/customer-home-redesign` در `febe14ee679c4d71b177e3b65844be6b14ce9625`. شاخه پیش‌فرض فعلی `feature/orders` است؛ **هنوز تغییر داده نشده**.
- PR #9: OPEN/Draft، head `integration/worker-start-followup-20261012` در `8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40`، base شاخه مرجع.
- PR #10: OPEN/Draft، head `ui/ux-ui-development` در `ef061ccdee4e00a3558fec773ad91a43010535cf`، base شاخه مرجع.
- PR #12: OPEN/Draft، head `fix/server-acceptance-005` در `be1008d57773aada136ae9132a06568f0b7154d3`، base شاخه PR #9.
- مأموریت‌های پذیرش ۰۰۵ و ۰۰۶ گزارش شده‌اند؛ نتایج تست قدیمی را به head جدید نسبت ندهید. مأموریت ۰۰۷ (سخت‌گیری آزمون اعلان‌ها) از نظر push و تست نهایی هنوز نیازمند بررسی مستقیم است.
- شاخه مستندات موازی `docs/paksho-handoff-recovery-20261013` امروز توسط ناظر ایجاد شد و **فقط** `CLAUDE.md` و `docs/PROJECT_HANDOFF.md` را نسبت به مرجع تغییر داده است (دو commit، بدون کد اجرایی). این شاخه زائد است و باید پس از انتقال و بررسی محتوای مفید، با مجوز مالک حذف شود؛ حذف هنوز انجام نشده.
- سند **واحد** تحویل همین `docs/PROJECT_HANDOFF.fa.md` است. برای جلوگیری از دوگانگی، سند کوتاه امروز جایگزین این پرونده جامع نیست. راهنمای `CLAUDE.md` در شاخه مرجع فعلاً قدیمی است و باید پس از بازبینی با اشاره به این سند اصلاح شود.
- شاخه‌های دارای کامیت مستقل یا تاریخچه متفاوت (`feature/customers`، `agents/greeting-in-persian-b5e6f654`، `integration/ui-folder-reconcile-20261011`، `integration/ui-safe-only-20261012` و شاخه‌های فعال) **نباید صرفاً براساس نام یا وضعیت PR حذف شوند**. شاخه‌های backup/restore نیز حفظ شوند.
- برای تغییر شاخه پیش‌فرض: پیش از اقدام، اثر روی PRها، branch protection/rulesets، GitHub Actions، کلون‌ها و ابزارهای ایجنت را بررسی کنید؛ تغییر default فقط با ابزار مجاز و پس از تصویب صریح مالک. این بررسی به‌تنهایی مجوز تغییر تنظیم نیست.
- پروتکل ایجنت جدید: ابتدا مخزن/شاخه/working tree را تشخیص دهد؛ این سند، `docs/ARCHITECTURE_DECISIONS.md` و Issue #11 را بخواند؛ PRهای #9/#10/#12 و آخرین SHAها را مستقیم بررسی کند؛ سپس **گزارش فقط‌خواندنی تحویل** بدهد و برای تغییرات منتظر اجازه بماند. اگر سند روی شاخه فعلی نیست، باید آن را صریحاً از شاخه مستندات دریافت کند و این محدودیت را اعلام کند.
- هیچ ایجنتی بدون مجوز مالک شاخه جدید، merge، rebase، force-push، deploy یا تغییر CI/تنظیمات ایجاد نکند؛ Commit/Push محدود در شاخه اختصاصی فقط طبق سیاست مصوب checkpoint در انتهای این سند مجاز است.


---

## سیاست مصوب حفظ کار و تحویل بین ایجنت‌ها — ۱۳ اکتبر ۲۰۲۶

هدف: جلوگیری از نابودی تغییرات منتشرنشده در محیط‌های موقت Claude Code، Codex و دیگر ایجنت‌ها. **ثبت کار (Commit/Push) با تأیید یا ادغام (Merge) تفاوت دارد.**

- هر ایجنت برای **شاخه کاری اختصاصیِ موجود و متعلق به مأموریت خودش** مجاز است تغییرات همان مأموریت را، حتی اگر ناتمام باشد، با پیام شفاف `WIP` یا `checkpoint` Commit و Push کند. قبل از Push، `git status`، شاخه/remote، `fetch` و عدم واگرایی غیرمنتظره را بررسی کند؛ هرگز Force Push نکند.
- این مجوز **شامل ایجاد شاخه جدید، Push مستقیم به شاخه مرجع `ui/customer-home-redesign`، تغییر شاخه دیگران، Merge/Rebase، حذف/Reset، تغییر تنظیمات/CI/Deploy یا تغییر سیاست مالی D-60 نیست**؛ همه این موارد همچنان به اجازه صریح مالک نیاز دارند. اگر ایجنت شاخه اختصاصی ندارد، پیش از ساخت یا انتخاب شاخه از مالک اجازه بگیرد.
- پیش از توقف، تعویض ایجنت یا پایان سهمیه، ایجنت باید وضعیت را تحویل دهد: نام شاخه، HEAD و SHA آخرین Commit منتشرشده، لینک PR/Commit، فهرست فایل‌های تغییرکرده، تست‌های واقعاً اجراشده، کارهای باز، و وضعیت `git status --short`. فایل‌های untracked/ignored و کارهای خارج از Git را صریحاً گزارش کند. **ادعای تحویل کامل فقط زمانی مجاز است که تغییرات مجاز در remote موجود و قابل بازیابی باشند.**
- اسرار، توکن‌ها، داده واقعی کاربران، دیتابیس و فایل‌های حساس نباید Commit/Push شوند؛ برای آنها روش انتقال امن جداگانه و تأیید مالک لازم است. اگر Push امن نیست، توقف و گزارش دقیق اجباری است.
- ایجنت بعدی از آخرین Commit منتشرشده و سند تحویل ادامه می‌دهد؛ کار انجام‌شده را تکرار نمی‌کند و شواهد قدیمی را به HEAD جدید تعمیم نمی‌دهد. در هر نقطه اختلاف یا خطر از دست رفتن داده، عملیات متوقف و موضوع به ناظر اعلام شود.

این سیاست فقط **مجوز محدود checkpoint در شاخه اختصاصی** است، نه مجوز ادغام یا انتشار محصول.

---

## خط مبنای فنی و سیاست جلوگیری از بازکاری — مصوب ۱۳ اکتبر ۲۰۲۶

**مرجع کامل: [Issue #13 — خط مبنای فنی پاکشو](https://github.com/antigravity1344-code/my-mobile-app/issues/13).** تمام ایجنت‌های تازه و فعلی باید این Issue را پیش از پیشنهاد ممیزی مجدد، اصلاح ساختاری یا تغییر تصمیم‌های تأییدشده بخوانند. این بخش مکمل تصمیم‌های معماری و سیاست checkpoint است، نه جایگزین آنها.

- هدف فعلی: آماده‌سازی **نسخه یکپارچه قابل نصب و تست روی گوشی واقعی** از اپ مشتری و متخصص؛ نه ادعای صفر باگ مطلق و نه انتشار عمومی. بیلد آزمایشی ابزار کشف باگ است.
- دروازه پذیرش ایراد: هر ایراد جدید باید SHA/فایل مرتبط، رفتار و شاهد بازتولیدپذیر یا سناریوی امنیتی مشخص، شدت P0 تا P3، پیامد و **حداقل اصلاح ضروری** داشته باشد؛ وضعیت آن را روی HEAD هدف تأیید کن.
- P0/P1 تأییدشده: رفع ضروری و تست رگرسیون؛ P2: ثبت و اولویت‌بندی مگر مانع آزمون؛ P3/نظر سلیقه‌ای/ایراد نظری بی‌شاهد: backlog، نه توقف پروژه یا بازنویسی.
- تعویض ایجنت دلیل شروع ممیزی سراسری یا بازکردن تصمیم معماری مصوب نیست. تغییر دامنه یا تصمیم مصوب نیازمند شاهد جدید و تأیید مالک است. مأموریت 007 بسته است و تکرار نشود.
- وضعیت PRهای #9، #10، #12 و CI را روی SHAهای زنده بررسی کن؛ «قابل ادغام» به معنای «ادغام شده و آزموده روی نسخه نهایی» نیست. CI اجرا‌نشده مساوی شکست تست نیست.
- هیچ Merge، Rebase، Force Push، حذف شاخه، تغییر CI/تنظیمات، تصمیم D-60 یا Push مستقیم روی شاخه مرجع بدون تأیید صریح مالک انجام نشود. تنها checkpoint روی شاخه اختصاصی موجود طبق سیاست قبلی مجاز است.
- هر مأموریت با معیار پذیرش مشخص، کمترین تغییر، شواهد واقعی و گزارش کوتاه در GitHub تمام می‌شود؛ هدف نزدیک شدن به تست گوشی است.
