# پذیرش ایمنی اپ‌های پاکشو — 004

AGENT_ID: CODEX-MANAGER (کدکس ۲)
ROLE: APP_DEVELOPER
TASK_ID: PAKSHO-APP-ACCEPTANCE-004

تحویل آزمون و شواهد تکمیل شده است؛ چهار معیار خروج اصلاح‌شده موفق‌اند، اما پذیرش کامل سرور باز است. هیچ کد تولیدی یا آزمون داخل شاخهٔ PR10 تغییر نکرده است. patch پیشنهادی فقط فایل متنی است.

## نسخه‌ها و منشأ

- دستور انتقال: PR9 comment 6133454499؛ دستور اصلی: 6133272319؛ ACK: 6133483972.
- PR9: `8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40`؛ PR10: `ef061ccdee4e00a3558fec773ad91a43010535cf`.
- مبنای مشترک: `febe14ee679c4d71b177e3b65844be6b14ce9625`.
- ترکیب **صرفاً محلی**: `7b21657d10f4721697631e5ec41c95af5397089b`؛ tree: `f0d96bff341ed3597866c46b1735c69807951578` (همان tree گزارش 03). دو parent همان PRها؛ این کامیت روی گیت‌هاب منتشر نشده است.
- شاخهٔ شواهد: `review/app-acceptance-004`، مبنا PR9 `8ac99c5...`؛ فقط این پوشه به مبنا افزوده می‌شود، نه کد ترکیبی.
- اصل آزمون و mockها از کامیت `84b51e30192bc9ce102ed5231ca4f1338117af8e` در `docs/handoff-evidence/probes/independent-preview-latest/` بایت‌به‌بایت بازیابی شده‌اند؛ پسوند txt برای جلوگیری از اجرای اتفاقی محفوظ است.
- SHA256 اصل آزمون: `eead1391e0f585cc6b210b5160394b9c0779fa5f55e08920d0fa92516d97fcc1`؛ storage mock: `c1d42998c8bc7596ca43ca460a0fd9fd48efb20b72c50598cf3d5531a74d7bea`؛ expo mock: `8eea93e6f7d863a8142867d0adbfa11f998cfd05316804a52e2376793cdd3e65`.
- کار/گزارش اجرایی قبلی 004 در بررسی اولیه مشاهده نشد؛ سپس کدکس ۱ در نظر 6133518514 صریحاً NOT_STARTED / HANDOFF_ACKNOWLEDGED و توقف خود را تأیید کرد. محیط محلی کدکس اول در دسترس تأییدشده نبود؛ آن را بررسی‌شده فرض نکردیم. گزارش و شواهد 03 از دو نظر مستقیم بازیابی و با برچسب prior نگهداری شده‌اند.

## جدول تغییر assertion و دلیل

| مورد | اصل محفوظ | نسخهٔ review | دلیل |
|---|---|---|---|
| طول عمر همهٔ ۱۴ مورد | importهای singleton مشترک؛ endPreview در beforeEach | vi.resetModules و import مجدد runtime/API/auth/service/storage/mock در هر مورد | پایان preview قرنطینهٔ همان runtime را دائمی می‌کند؛ مورد بعدی باید JS تازه داشته باشد. |
| پاسخ معوق مشتری | previewActive=false؛ Authorization=true | previewActive=true؛ Authorization=false | قرنطینه محافظ را تا reload واقعی نگه می‌دارد؛ credential نباید ارسال شود. |
| polling ده‌ثانیه‌ای متخصص | read=1؛ Authorization=true | read=0؛ Authorization=false | توکن واقعی در قرنطینه خوانده نمی‌شود. بدنه و زمان polling حفظ شدند. |
| timer آدرس ۲۵۰ms | read=1؛ Authorization=true | read=0؛ Authorization=false | همان callback و API تولیدی؛ حافظه/شبکه باید بسته بمانند. |
| callback ذخیرهٔ معوق | write=0 | همان assertion به‌علاوه صفر network/read/remove و token خالی | هیچ معیار قبلی حذف نشده؛ دامنهٔ بررسی قوی‌تر شده است. |
| هر چهار خروج | معیار صفر شبکه یا write اصلی | همان معیار + network/read/write/remove=0، token=''، Authorization=false، reload یک بار، رکورد ثابت محفوظ | در log پس از همهٔ assertionها APP004_SECURITY_REACHED ثبت می‌شود. |
| متن toolbar | endPreview پیش از reload | beginPreviewShutdown پیش از reload | تطبیق دقیق با قرارداد فعلی App.customer/App.worker؛ صرف assertion متنی است، mount واقعی نیست. |
| fixture سفارش ACTIVE | به‌علت singleton بازنشسته امکان orders[0] نبود | همان assertionهای نبود start references، در runtime تازه | انتظار fixture عوض نشد؛ زمان حیات اصلاح شد. |
| initial selection در previewDirectExit | runtime بازنشستهٔ قبلی، previewActive=true | runtime تازه، هرگز beginPreview نشده، active=false/closing=false قبل و بعد endPreview، storage و transport بدل عادی یک بار | نام و رفتار آزمون اکنون منطبق‌اند. |
| دو نقش و انتشار | پوشش مستقل محدود | ۴ ترکیب role×exit، یک initial selection، دو __DEV__=false | ۷ مورد مستقل؛ هیچ شبکه واقعی ندارند. |

نسخهٔ اولیهٔ ۱۴تایی در 03: ۹ موفق/۵ شکست؛ چهار مورد منتخب اصل: ۱ موفق/۳ شکست تشخیصی و سه NOT_REACHED. این نتیجه تغییر داده یا دوباره اجرا نشده است. نسخهٔ جدید نام جدا دارد و «همان اصل بدون تغییر سبز شد» ادعا نمی‌شود.

## نتیجهٔ اجرای 004

| اجرا | نتیجه | exit |
|---|---|---|
| review دو فایل | ۲۱ موفق: نسخهٔ اصلاح‌شده ۱۴ + چرخه عمر تازه ۷ | 0 |
| چهار EXIT در همان اجرای ۲۱تایی | هر چهار واقعاً به تمام assertionهای امنیتی رسیدند؛ همه صفر و token خالی | 0 |
| npm run typecheck | موفق | 0 |
| npm test -- --reporter=dot --maxWorkers=2 --minWorkers=1 | ۵۳ فایل، ۲۶۲ آزمون موفق | 0 |
| node --test --test-concurrency=1، ۱۶ فایل سرور | ۱۶۴ آزمون گزارش‌شده، ۱۵۵ موفق، ۹ شکست، بدون skip | 1 |
| npm run lint | صفر خطا، ۱۲ هشدار موجود | 0 |
| git apply --check برای patch روی ترکیب | موفق؛ patch اعمال نشد | 0 |

محیط Node v24.19.0 / Linux. وابستگی‌های قفل‌شده با npm ci --ignore-scripts --no-audit --no-fund در محیط مستقل آماده شدند؛ manifest/lockfile و تنظیمات تغییر نکردند. تلاش offline اول ENOTCACHED بود. دو تلاش اولیهٔ review در مرحلهٔ collection و قبل از اجرای هر تست متوقف شدند، چون checkout شواهد به expo/tsconfig.base دسترسی نداشت. تلاش تنظیم esbuild کافی نبود و برگشت داده شد؛ اشتراک node_modules موجود با symlink محلی مشکل محیط را حل کرد. هر دو خطای آغاز در results/setup-attempt-*.log محفوظ‌اند؛ فقط پس از رفع محیط یک اجرای واقعی ۲۱تایی انجام شد. مجموعه‌های عمومی نیز هرکدام یک بار اجرا شدند؛ حلقهٔ بازآزمایی ساخته نشد.

### مانع‌های سرور و تفاوت با گزارش 03

۸ شکست مربوط به `server/adminDashboard.xss.test.js` است: executable مرورگر `/usr/bin/chromium` وجود ندارد؛ assertion مرورگری اجرا نشد. مرورگر/تنظیمات جدید نصب یا تغییر داده نشد. شکست نهم: `server/orderEvents.test.js:1036` در «admin reassigning an active order notifies both previous and new workers»، actual=ORDER_ASSIGNED، expected=ORDER_STATUS.

بررسی فقط‌خواندنی: helper در خط 959 فهرست را reverse و در خط 1034 بر اساس تعداد قبلی slice می‌کند؛ query در `server/dataStore.js:1484-1485` فقط ORDER BY createdAt DESC دارد و timestamp در خط 1526 با دقت میلی‌ثانیه تولید می‌شود. تساوی timestamp و ترتیب نامعین، توضیح محتمل شکست در محیط سریع‌تر است؛ بدون ثبت timestampهای همان اجرای ناموفق، علت قطعی یا نشت تولیدی اعلام نمی‌شود. پیشنهاد مأموریت بعد: تشخیص اعلان تازه با اختلاف IDها در آزمون، ثبت timestampهای fixture و بررسی قرارداد ترتیب پایدار؛ تغییر query تولیدی فقط اگر نیاز مستقل تأیید شود. اینجا هیچ test اصلی یا سرور اصلاح نشد.

گزارش قبلی سرور ۱۹۶ موفق بود؛ نتیجهٔ فعلی ۱۶۴/۱۵۵/۹ است. همان SHA/tree و ۱۶ فایل بررسی شده‌اند، اما شمارش و موفقیت قبلی به این اجرا تعمیم داده نمی‌شود؛ علت کامل اختلاف شمارش تعیین نشده است. نتیجهٔ current raw در server.log ملاک است. پذیرش کامل ترکیب تا بررسی مانع‌های سرور باز می‌ماند.

## بازتولید برای بازبین

ترکیب را با `git merge-tree --write-tree PR9_SHA PR10_SHA` بسازید و tree بالا را تطبیق دهید؛ فقط checkout مستقل با HEAD جدا و بدون انتقال refهای اصلی. نسخه‌های lockfile همان مبنا باشند. APP004_SOURCE مسیر مطلق آن checkout است. این دستورها روی دستگاه مالک اجرا نشده‌اند.

```sh
APP004_SOURCE=/absolute/combined-checkout /absolute/combined-checkout/node_modules/.bin/vitest run --config /absolute/evidence-checkout/docs/handoff-evidence/app-acceptance-004/vitest.review.config.mjs --reporter=verbose --reporter=json --outputFile=/tmp/review-results.json
```

برای حل tsconfig، checkout شواهد باید بتواند همان node_modules ترکیب را resolve کند؛ اینجا symlink محلیِ ignoreشده استفاده شد. خروجی خام، نام هر case، شمارش و log چهار APP004_SECURITY_REACHED در results/review.log و review-results.json موجود است. فرمان‌های دقیق مجموعه عمومی و exitها در results/commands.json هستند. patch پیشنهادی برای فایل PR10 جداست و فقط روی ترکیب check شده؛ هیچ دستور اعمال خودکار ندارد.

## حدود پذیرش

مسیر ۳: چهار خروج و چرخهٔ عمر تازه موفق؛ پذیرش کامل سرور مسدود و تصمیم نهایی با ناظر. تایمرهای متخصص/آدرس معادل بدنهٔ source و سرویس/API/storage واقعی‌اند؛ React mount/reload و گوشی آزموده نشده‌اند. نقل‌وانتقال‌های آزمون preview بدل و سرور آزمون فقط loopback/پایگاه ساختگی/SMS بدل هستند. تست auth توکن ساختگی داخلی می‌سازد و چیزی منتشر نمی‌کند. محافظ preview معادل sandbox کل شبکهٔ OS/native نیست؛ استثنای Metro localhost:8081 پابرجاست.

مسیر ۴: شکاف از کد تأیید شد؛ شرح دقیق و پیشنهاد مستقل در PRICING_GAP.fa.md است؛ هیچ تعرفه یا تغییر مالی ساخته نشد. مأموریت مدیر ایجنت‌ها لغو و خارج دامنه است. پس از گزارش توقف؛ نه ادغام، نه deploy، نه نظارت خودکار.

خروجی خام عمداً بدون حذف ANSI/فاصله/سطر پایانی محفوظ است؛ git diff --check برای چند log و رونویسی گزارش قبلی هشدار whitespace دارد. فایل‌های آزمون و config مستقل بدون خطای whitespace هستند. manifest فقط فایل‌های تحویلی را فهرست می‌کند؛ cache محلی Vitest و node_modules منتشر نمی‌شوند.
