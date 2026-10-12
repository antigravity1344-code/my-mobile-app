# مکمل وضعیت تازه شاخه‌ها — مستقل از snapshot اولیه

مشاهده: 2026-10-12T13:48:35.073222+03:30، Asia/Tehran. گزارش اولیه ۱۹ شاخه بدون تغییر محفوظ است. شمارش آن snapshot تاریخی است؛ این مکمل نتیجه تست یا شمارش ancestry را به head تازه نسبت نمی‌دهد.

| شاخه / مرجع | SHA کامل | طبقه‌بندی و وضعیت |
|---|---|---|
| `ui/ux-ui-development` / PR #10 | `556d2f4cd64d3825622222e6004d0e96ac6dffff` | فعال/ضروری؛ OPEN/Draft، head تازه در این کنترل مستقل آزموده نشده |
| snapshot اولیه PR #10 | `22832987836ca6448c82752d3c4816d91ea5cc57` | مرجع تاریخی کنترل قبلی؛ از head تازه تفکیک شود |
| پایه `docs/project-handoff-20261012` | `febe14ee679c4d71b177e3b65844be6b14ce9625` | شاخه مستندات تازه، فعال/ضروری برای بازبینی؛ SHA نهایی انتشار از گزارش انتشار مشخص شود |

شاخه مستندات در snapshot اولیه ۱۹ شاخه وجود ندارد. اگر منتشر شود یک شاخه فعال تازه محسوب می‌شود؛ از تعداد تاریخی ۱۹، تعداد لحظه‌ای remote نتیجه‌گیری نشود. منتشرشدن tag بازگشت تعداد شاخه‌ها را افزایش نمی‌دهد. طبقه‌بندی قبلی «۵ فعال» نیز صرفاً شمارش همان snapshot است.

نتایج کنترل قبلی پیش‌نمایش و ترکیب درباره head تازه PR #10 قابل انتقال نیستند. مسئول UX/UI باید head اصلاح‌شده را همراه شواهد تحویل دهد؛ بازبینی مستقل مرز خروج و ترکیب پس از تحویل لازم است. در این زیرکار object تازه fetch نشده و ahead/behind یا کامیت منحصربه‌فرد تازه ادعا نمی‌شود.

## نامزدهای صرفاً بررسی حذف

تعداد دقیق **۷** است: پنج شاخه ادغام‌شده و دو شاخه قدیمی بدون کامیت منحصربه‌فرد در snapshot اولیه. این هفت مورد نقطه بازگشت نیستند؛ چهار شاخه backup/restore از این فهرست خارج و محفوظ‌اند. هیچ حذف مجاز یا اجرا نشده و شرایط حفظ قبلی، به‌ویژه سابقه امنیتی XSS، پیش از هر تصمیم آینده باید بازبینی شوند.

| شاخه | SHA کامل برای مراجعه و بازیابی |
|---|---|
| `cursor/architecture-followup-e352` | [`a8b0ae5f7abdb7a93908f796b234eba9b6aa5a69`](https://github.com/antigravity1344-code/my-mobile-app/commit/a8b0ae5f7abdb7a93908f796b234eba9b6aa5a69) |
| `cursor/stage3-order-cancel-e352` | [`bf456381b2b367ca9ee9600a990f3465a1ab3bec`](https://github.com/antigravity1344-code/my-mobile-app/commit/bf456381b2b367ca9ee9600a990f3465a1ab3bec) |
| `cursor/stage4-loyalty-tier-e352` | [`280dc6b1616f5dd774701a4b56faf1ebe0f53d60`](https://github.com/antigravity1344-code/my-mobile-app/commit/280dc6b1616f5dd774701a4b56faf1ebe0f53d60) |
| `feature/profile-and-auth` | [`fac145d19fd7d7d6fef49876d60e644275287e82`](https://github.com/antigravity1344-code/my-mobile-app/commit/fac145d19fd7d7d6fef49876d60e644275287e82) |
| `fix/admin-dashboard-xss` | [`9c112e06c83e66ace70f5fb4bd1585c98bb77912`](https://github.com/antigravity1344-code/my-mobile-app/commit/9c112e06c83e66ace70f5fb4bd1585c98bb77912) |
| `integration/ui-safe-only-20261012` | [`2cfe60cd64b3df1bbd5c5bb5eed955d4b2a1504a`](https://github.com/antigravity1344-code/my-mobile-app/commit/2cfe60cd64b3df1bbd5c5bb5eed955d4b2a1504a) |
| `say_hello` | [`3af65b63a07dc83442d4b7d4511882747f4e9846`](https://github.com/antigravity1344-code/my-mobile-app/commit/3af65b63a07dc83442d4b7d4511882747f4e9846) |

## صحت کپی و پیوندهای سند

نسخه `documentation/docs/PROJECT_BRANCH_AUDIT.fa.md` دقیقاً byte برابر گزارش اولیه است؛ SHA256 هر دو `35fea134c8f01d77c648e54e60af9ac88b8e13f2759a171eb7a7bc9099733f7a`. هر ۱۹ SHA کامل حفظ شده‌اند. هر پنج پیوند محلی README و سند تحویل بررسی شدند: چهار مقصد در draft هستند و `ARCHITECTURE_DECISIONS.md` از مرجع رسمی به ارث می‌رسد. handoff، head تازه `556d2f4cd64d3825622222e6004d0e96ac6dffff` را از کنترل `22832987836ca6448c82752d3c4816d91ea5cc57` جدا و هنوز ادغام‌نشده معرفی می‌کند.

tag بازگشت منتشرشده `rollback/pre-pr9-ui-20261012` به `febe14ee679c4d71b177e3b65844be6b14ce9625` می‌رسد؛ داده تأیید آن از `return-point.json` خوانده شد. این tag جای نسخه bundle اولیه را نمی‌گیرد و bundle فقط snapshot اولیه را تضمین می‌کند.

این زیرکار هیچ فایل پروژه، شاخه، تنظیم، آزمون، ساخت، fetch یا push را تغییر/اجرا نکرد. فایل‌های مکمل صرفاً شواهد محلی‌اند؛ آماده‌سازی و انتشار شاخه مستندات توسط عامل اصلی گزارش می‌شود.
