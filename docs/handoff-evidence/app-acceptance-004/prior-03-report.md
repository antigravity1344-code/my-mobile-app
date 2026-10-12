ROLE: MAIN_CODEX
TASK_ID: PAKSHO-INTEGRATION-RETEST-20261012-03
STATUS: COMPLETED
RESULT: اجرای یک‌باره بازآزمایی کامل شد؛ شواهد مکمل معیارهای امنیتی صفر اثر را گذراندند، اما همان چهار تست اصلی همگی سبز نیستند.

دستور [6123623728](https://github.com/antigravity1344-code/my-mobile-app/pull/9#issuecomment-6123623728) مستقیماً خوانده شد و [STATUS: ACCEPTED](https://github.com/antigravity1344-code/my-mobile-app/pull/9#issuecomment-6123657936) ثبت شد. این اجرای مستقل از P1 است؛ هر فرمان آزمون یک‌بار اجرا شد و حلقه بازآزمایی ساخته نشد.

### ترکیب دقیق

- PR9_SHA: 8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40
- PR10_SHA: ef061ccdee4e00a3558fec773ad91a43010535cf
- مبنای مشترک: febe14ee679c4d71b177e3b65844be6b14ce9625
- کامیت ترکیبی صرفاً محلی: deacb58ae4c882d03d6846efc88a70cb949f45b2
- TREE: f0d96bff341ed3597866c46b1735c69807951578
- محل آزمایش: /workspace/pr9-pr10-integration-20261012، HEAD جدا از شاخه‌ها و working tree پاک.
- ترکیب با git merge-tree --write-tree در هر دو ترتیب بدون تعارض و با tree یکسان ساخته شد؛ هیچ شاخه‌ای تغییر نکرد و کامیت ترکیب منتشر نشد.
- هر دو PR همچنان OPEN / Draft و مقصدشان ui/customer-home-redesign است. [CI موفق PR #10](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38243459597) با همین ef061cc تطبیق داده شد؛ نتیجه CI مستقل، جایگزین آزمون ترکیبی زیر نشده است.

### شمارش و خروجی واقعی

| بررسی روی ترکیب | موفق | ناموفق | وضعیت دیگر | exit |
|---|---:|---:|---|---:|
| TypeScript — npm run typecheck | موفق | ۰ خطا | — | 0 |
| سرور — تمام ۱۶ فایل، concurrency=1 | ۱۹۶ | ۰ | ۰ skip/cancel/todo | 0 |
| اپ — ۵۳ فایل، maxWorkers=2/minWorkers=1 | ۲۶۲ | ۰ | بدون تست ناموفق | 0 |
| lint | — | ۰ خطا | ۱۲ هشدار | 0 |
| فایل اصلی ۱۴تایی بدون تغییر | ۹ | ۵ | ۰ skip | 1 |
| همان چهار تست اصلی EXIT، انتخاب جدا | ۱ | ۳ | ۱۰ تست دیگر فقط در اجرای منتخب skip؛ در اجرای ۱۴تایی اجرا شده‌اند | 1 |
| چهار تست مکمل مستقل، همان توالی endPreview | ۴ | ۰ | ۰ skip | 0 |
| هشت بررسی مستقل با runtime تازه | ۸ | ۰ | ۰ skip | 0 |

دو فایل previewShutdownRace.test.ts و previewDirectExit.test.ts، هر کدام با پنج تست، در همان اجرای کامل ۲۶۲تایی حضور داشتند و گذشتند؛ اجرای مستقل تکراری برای آن‌ها انجام نشد. ۱۲ تست مکمل بیرون checkout هستند و در شمارش ۲۶۲ تست اپ منظور نشده‌اند.

هشدار lint نسبت به ترکیب قبلی از ۱۱ به ۱۲ رسیده: یک import استفاده‌نشده previewApi در previewDirectExit.test.ts:5 اضافه شده است. چهار هشدار baseline و هفت هشدار preview قبلی باقی‌اند؛ خطای TypeScript/lint تازه وجود ندارد. اعلان نسخه جدید npm خطای پروژه نیست.

### نتیجه دقیق چهار assertion امنیتی اصلی

فایل اصلی و mockها بایت‌به‌بایت بازیابی شدند؛ فقط مسیر اجرای config تغییر کرد. SHA-256 آزمون اصلی همان مقدار مقرر است:
eead1391e0f585cc6b210b5160394b9c0779fa5f55e08920d0fa92516d97fcc1.

[نسخه اصلی محفوظ و قابل خواندن در شاخه تحویل](https://github.com/antigravity1344-code/my-mobile-app/blob/84b51e30192bc9ce102ed5231ca4f1338117af8e/docs/handoff-evidence/probes/independent-preview-latest/integrationPreviewProbe.test.ts.txt)

| سناریوی اصلی | نتیجه خام تست | اولین توقف | assertion اصلی صفر اثر | بررسی مکمل مستقل |
|---|---|---|---|---|
| پاسخ معوق مشتری به شروع، orderService واقعی | FAIL | خط ۹۷: previewActive باید false باشد؛ actual=true | خط ۱۰۰: NOT_REACHED | PASS، transport=0 |
| polling ده‌ثانیه‌ای متخصص | FAIL | خط ۱۱۸: persistent read باید 1 باشد؛ actual=0 | خط ۱۲۰: NOT_REACHED | PASS، transport/read=0 |
| timer آدرس ۲۵۰ms مشتری | FAIL | خط ۱۳۹: persistent read باید 1 باشد؛ actual=0 | خط ۱۴۱: NOT_REACHED | PASS، transport/read=0 |
| callback ذخیره معوق پیش‌نمایش | PASS | — | خط ۱۵۱: PASS، persistent write=0 | PASS، write/remove/read=0 |

بنابراین در فایل اصلی، سه assertion امنیتی اجرا نشده‌اند و یک مورد موفق است؛ هیچ‌یک از چهار assertion امنیتی در این اجرا با observed effect>0 شکست نخورد. این به معنی «چهار تست اصلی موفق شدند» نیست.

سه توقف تشخیصی با سیاست جدید fail-closed ناسازگارند: previewActive هنگام قرنطینه باید true بماند تا مسیرهای API/token/storage بسته باشند؛ خواندن توکن ذخیره‌شده و ارسال Authorization نباید اتفاق بیفتد. تست‌ها همان انتظارهای قدیمی را دارند و بدون تغییر اجرا شدند.

دو شکست دیگر در فایل کامل ۱۴تایی عبارت‌اند از تطبیق متنی callback قدیمی toolbar و دسترسی orders[0] در fixture پس از قرنطینه. فایل اصلی importهای singleton مشترک دارد؛ پس از تست اول، endPreview runtime را بازنشسته می‌کند و beforeEach قادر به شبیه‌سازی JS تازه نیست. بخشی از تست‌های ACTIVE بعدی قرنطینه مشترک را بررسی می‌کنند. این محدودیت صریح است و نتیجه خام حذف یا سبز معرفی نشده است.

### حفاظت واقعی بررسی‌شده

در [previewRuntime.ts:35](https://github.com/antigravity1344-code/my-mobile-app/blob/ef061ccdee4e00a3558fec773ad91a43010535cf/src/components/native/previewRuntime.ts#L35)، endPreview روی نقش فعال اکنون beginPreviewShutdown را اجرا می‌کند؛ دیگر محافظ را قبل از reload باز نمی‌کند. endPreview در runtime تازه بدون preview همچنان انتخاب اولیه ورود واقعی را بی‌خطر نگه می‌دارد.

برای هر یک از چهار توالی اصلی، بررسی مکمل با ماژول‌های تازه و endPreview مستقیم اجرا شد: callback واقعی orderService و تایمرهای معادل source متخصص/آدرس، transport/read/write/remove همگی صفر، token قابل دریافت خالی و ذخیره موجود دست‌نخورده بود. این تست‌های مکمل جایگزین یا نسخه ویرایش‌شده فایل اصلی نیستند.

هشت بررسی مستقل دیگر، با ماژول تازه در تک‌تک موارد، نشان دادند:

- هر دو نقش در preview فعال، شروع متخصص، پاسخ مشتری و تصمیم مدیر را با همه روش‌های mutation رد می‌کنند؛ endpoint ناشناخته به backend fallback نمی‌کند.
- هر دو تابع خروج، محافظ fetch و XHR، پنهان‌بودن token و صفر دسترسی به storage دائمی را تا پایان عمر JS نگه می‌دارند؛ حافظه نمونه پاک می‌شود و write/remove معوق بی‌اثر است.
- callback معوق نمی‌تواند runtime بازنشسته را دوباره فعال کند. generation منقضی است؛ با این حال previewCanCommit مصرف تولیدی ندارد و نمی‌توان حفاظت همه setStateهای React را به آن نسبت داد.
- در runtime تازه بدون preview، انتخاب اولیه ورود واقعی transport/token/storage معمول را در محیط بدل نگه می‌دارد. در runtime تازه با __DEV__=false، پرچم preview فعال نمی‌شود.

همه درخواست‌ها و storageها بدل آفلاین بودند؛ هیچ داده واقعی، پیامک یا credential واقعی استفاده/نمایش داده نشد. مجوز Metro روی localhost/127.0.0.1:8081 در محافظ توسعه وجود دارد؛ نتیجه به API برنامه و fetch/XHR بررسی‌شده مربوط است، نه ادعای sandbox شبکه سیستم‌عامل یا بررسی تمام transportهای native.

### سازگاری PR #9 و نکته برای UX/UI

۳۲ فایل از ۳۳ فایل PR #9 عیناً در ترکیب حفظ شدند. تفاوت OrdersContext.tsx فقط import محافظ preview و شناسه مشتری نمونه است؛ پاسخ شروع مشتری، promptEventId و conflict/refresh تغییر نکرده‌اند. سرور، orderService، وضعیت متخصص، سند معماری و گردش تکمیل تاریخی همان blobهای PR #9 هستند. آزمون‌های سرور تاریخچه رویداد، نشست، شروع و تکمیل سفارش قدیمی موفق‌اند؛ کمیسیون فرضی یا سیاست مالی جدیدی ایجاد نشده است.

برای بازبین [PR #10](https://github.com/antigravity1344-code/my-mobile-app/pull/10): پنج تست previewDirectExit.test.ts هنوز singleton مشترک دارند. تست آخر با نام «initial selection outside any preview» واقعاً runtime تازه را نمی‌آزماید و previewActive=true به‌جامانده از تست اول را assert می‌کند. این محدودیت پوشش آزمون است؛ دو نقش، دو تابع خروج و انتخاب اولیه تازه در بررسی مکمل مستقل پوشش داده شدند. هیچ اصلاح تست یا کد در این مأموریت انجام نشد. اگر اصلاح نام/چرخه عمر این فایل مدنظر است، برای تغییر آن دستور جداگانه لازم است.

### شواهد خام و بازتولید

[شواهد مستقیم همین اجرای ترکیبی: فرمان‌ها، نتایج، ماتریس و خروجی خام](https://github.com/antigravity1344-code/my-mobile-app/pull/9#issuecomment-6123815335)


فرمان‌ها و exit code واقعی در full-checks/results.json و original-probes/execution-summary.json؛ نتایج assertionها در original-probes/security-matrix.json؛ خروجی کامل runnerها و بازیابی SHA-256 در بسته محفوظ‌اند. همه مسیرها زیر /workspace/reports/pr9-pr10-retest-03-20261012 هستند؛ این مسیر محلی است و artifact منتشرشده GitHub معرفی نمی‌شود.

فرمان‌های استفاده‌شده:
~~~sh
npm run typecheck
node --test --test-concurrency=1 server/*.test.js
npm test -- --reporter=dot --maxWorkers=2 --minWorkers=1
npm run lint
vitest run --config original-probes/vitest.config.mjs
vitest run --config original-probes/vitest.config.mjs --testNamePattern='EXIT acceptance:'
~~~
برای server نام هر ۱۶ فایل به‌صورت صریح مرتب‌شده به node داده شد. Vitest از نسخه نصب‌شده همان مخزن، با reporter verbose/json و outputFile اختصاصی هر اجرا فراخوانی شد. config آزمون اصلی مسیر report-root/mockها را برای checkout مستقل تنظیم می‌کند؛ متن آزمون تغییر ندارد.

خلاصه خام خروجی‌های موفق:
~~~text
server: tests 196 / pass 196 / fail 0 / skipped 0
app: Test Files 53 passed (53) / Tests 262 passed (262)
original-14: 9 passed / 5 failed / exit 1
original-exit-4: 1 passed / 3 failed / 10 skipped / exit 1
strict-original-sequence-4: 4 passed / 0 failed / exit 0
fresh-runtime-lifecycle: 8 passed / 0 failed / exit 0
~~~
شکست‌های اصلی همان فایل، بدون ویرایش:
~~~text
line 97: expected true to be false
line 118: expected +0 to be 1
line 139: expected +0 to be 1
~~~

### حفاظت و نتیجه تحویل

تمام refs قبلی در هر دو checkout بدون تغییر ماندند؛ checkout اصلی روی 8ac99c5 و پاک است. شاخه مرجع، main، feature/orders، PRها، شاخه docs/project-handoff-20261012 و rollbackها حفظ شدند. ۲۲۴ فایل شواهد/بسته قبلی دوباره hash شدند؛ هیچ تغییر/حذفی ندارند. bundle نسخه ترکیبی صرفاً محلی ذخیره و verify شد.

STATUS: COMPLETED مربوط به پایان مأموریت بازآزمایی است؛ پذیرش نهایی یا ادغام از آن نتیجه نمی‌شود. در مسیرهای بررسی‌شده، نشت قبلی با endPreview در آزمون‌های مکمل بازتولید نشد. نتیجه خام آزمون اصلی همچنان یک موفق و سه شکست تشخیصی است و سه معیار صفر شبکه در آن NOT_REACHED هستند. تصمیم درباره پذیرش این تفکیک با ناظر است.

هیچ تغییر کد تولیدی/آزمون اصلی، شاخه، تنظیمات، ادغام، force push، حذف یا دسترسی به دستگاه/داده واقعی انجام نشد. ساخت اندروید یا mount/reload واقعی گوشی اجرا نشده و پذیرش گوشی مستقل باقی است.

