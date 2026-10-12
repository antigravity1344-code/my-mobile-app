# پایلوت آفلاین ویندوز — مأموریت 006

این تحویل فقط دادهٔ ساختگی دارد. اجرای دستورهای زیر روی رایانهٔ مالک نیازمند تأیید مجدد مالک پس از بررسی گزارش است. هیچ نصب یا تنظیمی روی آن رایانه انجام نشده است. وضعیت اتصال واقعی `BLOCKED_FOR_REAL_AUTH` است.

## پیش‌نیاز و مرز اجرا

Windows 10/11، PowerShell 5.1 یا 7 و Node.js نسخهٔ 24 از قبل موجود لازم است. وابستگی npm، حساب، secret، دسترسی Administrator و تغییر ExecutionPolicy لازم نیست. اگر Node موجود نیست، متوقف شوید؛ نصب جزو این مجوز نیست. این نسخه روی Linux / Node 24.19.0 آزموده شده؛ Windows، PowerShell و Task Scheduler واقعی: `NOT_RUN_WINDOWS_HOST`.

داده‌ها باید روی دیسک محلی همان میزبان، بیرون پوشهٔ کد و در پوشهٔ خصوصی کاربر باشند. UNC، مسیر نسبی و symlink/junction رد می‌شوند؛ تشخیص همهٔ درایوهای شبکه‌ای mount‌شده یا پوشه‌های cloud-sync تضمین نمی‌شود. از OneDrive، NFS، اشتراک شبکه و پوشهٔ قابل‌نوشتن توسط دیگر کاربران استفاده نکنید. ACL ویندوز باید دستی بررسی شود؛ برنامه آن را تغییر نمی‌دهد. POSIX mode جای ACL ویندوز نیست.

## تمرین دستی پس از تأیید مجدد

مقدار `$Tool` را با مسیر واقعی checkout شاخهٔ `feature/pakshoo-agent-manager` جایگزین کنید. نمونه عمداً فاصله و فارسی دارد. دستورات مستقیماً در ترمینال اجرا می‌شوند؛ فایل ps1 و bypass لازم نیست.

```powershell
node --version
$Tool = 'C:\پاکشو آزمایشی\my-mobile-app\tools\pakshoo-agent-manager'
$Cli = Join-Path $Tool 'pilot-cli.mjs'
$Root = Join-Path $env:LOCALAPPDATA 'Pakshoo Offline آزمایشی'
# فقط پوشهٔ والد؛ مسیر Data باید تازه و ناموجود باشد
New-Item -ItemType Directory -Path $Root -ErrorAction Stop
$Data = Join-Path $Root 'داده نمونه 001'
& node $Cli init --offline-demo --data-dir $Data
if ($LASTEXITCODE -ne 0) { throw 'init failed' }
& node $Cli health --offline-demo --data-dir $Data
& node $Cli run --offline-demo --data-dir $Data --duration-seconds 60
```

توقف با Ctrl+C یا پایان زمان است. پیش‌فرض ۶۰ ثانیه، حداکثر ۳۰۰ ثانیه؛ اجرای foreground است. برای restart پس از توقف حداقل ۳ ثانیه صبر کنید و فقط دستور run را تکرار کنید؛ init دوباره روی همان مسیر عمداً رد می‌شود. اگر `PILOT_ALREADY_RUNNING` دیدید نمونهٔ اول را متوقف کنید؛ فایل قفل را حذف نکنید. `PILOT_LEASE_ACTIVE_RETRY` یعنی هنوز lease ساختگی قبلی معتبر است؛ پس از انقضا دستی تلاش کنید.

برای health یا backup هم‌زمان با run، ترمینال دوم باز و متغیرهای Tool/Cli/Root/Data را همان مقدار تعیین کنید؛ New-Item و init را تکرار نکنید.

```powershell
& node $Cli health --offline-demo --data-dir $Data
Get-Content -LiteralPath (Join-Path $Data 'pilot.log')
$Snapshot = Join-Path $Root ('نسخه پشتیبان ' + [Guid]::NewGuid().ToString())
& node $Cli backup --offline-demo --data-dir $Data --snapshot-dir $Snapshot
if ($LASTEXITCODE -ne 0) { throw 'backup failed' }
Get-Content -LiteralPath (Join-Path $Snapshot 'manifest.json')
$Restored = Join-Path $Root ('بازیابی آزمایشی ' + [Guid]::NewGuid().ToString())
& node $Cli restore --offline-demo --data-dir $Restored --snapshot-dir $Snapshot
if ($LASTEXITCODE -ne 0) { throw 'restore failed' }
& node $Cli health --offline-demo --data-dir $Restored
# پس از انقضای lease ذخیره‌شده، در صورت تأیید اجرای آزمایشی:
Start-Sleep -Seconds 3
& node $Cli run --offline-demo --data-dir $Restored --duration-seconds 10
```

هیچ دستور overwrite وجود ندارد؛ restore حتی پوشهٔ موجودِ خالی را نمی‌پذیرد. snapshot فقط از همین پایلوت ساختگی و مورداعتماد خودتان باشد. manifest شامل نسخهٔ قالب، snapshotId، sourceInstanceId، زمان، نسخهٔ Node، نام ثابت فایل و SHA-256 است. checksum تشخیص خرابی است، امضای اصالت نیست. `integrity_check` قبل و بعد restore اجرا می‌شود؛ manifest نهایی علامت کامل‌شدن backup است. پوشهٔ ناقص پس از قطع برق معتبر نیست؛ برنامه خودکار آن را حذف نمی‌کند.

## ساختار و دوام

`pilot-cli.mjs` ورودی با پرچم اجباری `--offline-demo`؛ `offline-pilot.mjs` مدیریت پوشه، session، health و backup/restore؛ `manager.mjs` هستهٔ قبلی بدون تغییر است. فقط یک task ثابت ساختگی ثبت می‌شود. هیچ payload یا فرمان دلخواه، شبکه، HTTP listener، مدل، agent یا subprocess در مسیر اجرای پایلوت وجود ندارد. TrustedIngress به شبکه وصل نشده است. اشتراک ChatGPT/Codex/Claude مجوز API یا اجرای خودکار فرض نمی‌شود؛ هزینهٔ سرویس/API جدید صفر است، مصرف برق/دیسک محلی برقرار است.

`state.sqlite` و WAL تاریخچه، outbox و idempotency را حفظ می‌کنند؛ هیچ pruning خودکار نداریم. `writer-lock.sqlite` یک تراکنش EXCLUSIVE جدا دارد؛ قفل OS پس از مرگ فرایند آزاد می‌شود. lease ساختگی ۲ ثانیه است؛ restart با epoch جدید انجام می‌شود. وضعیت RUNNING در health وضعیت task ذخیره‌شده است، نه مدرک زنده‌بودن فرایند. health و backup نویسندهٔ مأموریت ایجاد نمی‌کنند. نسخهٔ restored همان هویت snapshot را دارد و فقط برای تمرین جداگانه است، نه replica عملیاتی.

Backup روی DB باز از `VACUUM INTO` با synchronous FULL استفاده می‌کند؛ کپی فایل main در WAL نیست. مبنا: https://www.sqlite.org/lang_vacuum.html . دوام به فایل‌سیستم و سخت‌افزار سالم وابسته است. خرابی برق واقعی با SIGKILL برابر نیست. محدودیت log حدود ۱MiB و state+WAL حدود ۶۴MiB در heartbeat باعث توقف می‌شود؛ حذف خودکار نداریم و این سقف‌ها سهمیهٔ سخت سیستم‌عامل نیستند. logs فقط زمان و event ثابت دارند؛ خطاهای CLI متن خام filesystem و ورودی را چاپ نمی‌کنند. رقابت مخرب همان کاربر OS، snapshot جعل‌شده، دیسک خراب و تغییر ساعت میزبان مرز تضمین این نمونه نیستند.

## سناریوها و آزمون بعدی

| وضعیت | رفتار مورد انتظار | آزمون بعدی ویندوز |
|---|---|---|
| restart تمیز | حفظ سابقه؛ انتظار انقضای lease؛ epoch جدید | run کوتاه، توقف، انتظار، run و health |
| crash فرایند | آزادشدن قفل OS؛ recovery بدون حذف تاریخچه | فقط فرایند پایلوت ساختگی را پس از تأیید متوقف و دوباره اجرا کنید |
| reboot | برنامه خودکار شروع نمی‌شود؛ DB می‌ماند | بررسی health پس از reboot مجاز، سپس شروع دستی |
| sleep | heartbeat متوقف؛ lease ممکن است منقضی شود؛ خطا و restart دستی | sleep/resume فقط در آزمون جدا و مجاز |
| قطع برق | SQLite recovery؛ backup ناقص قابل قبول نیست | آزمون جدا روی محیط دورریختنی؛ نه رایانه/دادهٔ واقعی |
| قطع اینترنت | بدون وابستگی شبکه، رفتار محلی ثابت | آزمون در محیط از قبل آفلاین؛ تنظیم شبکه را این ابزار تغییر نمی‌دهد |
| backup باز / restore | snapshot سازگار، مسیر تازه، حفظ outbox | فرمان‌های بالا؛ تطبیق health و اجرای tests |
| مجوز ناکافی / دیسک پر | خطا، بدون overwrite خودکار | پوشهٔ آزمایشی از قبل محدود؛ ACL را برنامه تغییر نمی‌دهد |

Task Scheduler صرفاً پیشنهاد آینده و **Disabled**: حساب معمولی همان کاربر، بدون highest privileges، بدون trigger فعال، بدون restart خودکار، بدون نصب Startup، بدون ذخیرهٔ credential؛ در صورت بررسی آینده «Do not start a new instance» و سقف زمان کوتاه. هیچ XML نصب، Register-ScheduledTask یا job آمادهٔ فعال‌سازی تحویل نمی‌شود. دوام DB به معنی سرویس ۲۴ساعته نیست.

## چک‌لیست پذیرش دستی

پس از تأیید مجدد: مسیر محلی خصوصی و Node 24 را بررسی کنید؛ در PowerShell 5.1 و 7 جداگانه `npm.cmd test` و `npm.cmd run demo` را از پوشهٔ ابزار اجرا کنید؛ سپس smoke بالا، اجرای هم‌زمان نمونهٔ دوم، restart و backup/restore تازه را بررسی کنید. خروجی و `$LASTEXITCODE` را ثبت کنید. آزمون link روی Windows خودکار skip می‌شود تا privilege جدید درخواست نشود؛ junction/ACL/sleep/reboot/power-loss/Task Scheduler همچنان آزمون جدا می‌خواهند. هیچ اعتبارنامه، دادهٔ مشتری یا اتصال زنده وارد نکنید. پس از تحویل این مأموریت تا تأیید مرحلهٔ بعد توقف می‌کنیم.
