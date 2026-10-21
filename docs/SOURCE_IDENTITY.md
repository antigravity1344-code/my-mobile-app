# تشخیص نسخه اجرا

نشان «نسخه اجرا» در اپ مشتری و متخصص، پیش‌نمایش، وب و صفحه مدیریت، منبع همان اجرا را نشان می‌دهد. با باز کردن آن، شناسه کامل، شاخه و وجود تغییرات ثبت‌نشده قابل خواندن و انتخاب است. نبود Git یا خطای خواندن آن، «نامشخص» است؛ مقدار محیطی جای شناسه تأییدشده Git قرار نمی‌گیرد.

شناسه اپ هنگام شروع یا bundle داخل خود JavaScript ثبت می‌شود؛ وابسته به نسخه فعلی سرور، manifest یا نام فایل APK نیست. شروع مستقیم Expo و bundle از Gradle موجود نیز config Babel/Metro را می‌خوانند؛ wrapper تازه لازم نیست. مشتری و متخصص از ورودی‌های واقعی برنامه نام می‌گیرند؛ وب داشبورد و شبیه‌ساز هم صریح مشخص‌اند. مدیریت، Git هنگام شروع همان سرور را نشان می‌دهد.

نشان اپ، منبع رابط کاربری bundle‌شده را مشخص می‌کند؛ نشان `/admin` منبع سرور را جدا نشان می‌دهد. یکسان‌بودن نسخه اپ و API از روی نشان اپ به‌تنهایی اثبات نمی‌شود.

پیش از تغییر شاخه، Metro را متوقف کنید. پس از checkout یا تغییر منبع، سرویس را با `npx expo start --clear` از نو اجرا و صفحه/اپ را کامل reload کنید. Fast Refresh سرویس قدیمی ممکن است ترکیبی از فایل‌های تازه و قدیمی باشد؛ نشان نسخه، وضعیت زنده Git پس از checkout را تضمین نمی‌کند. هنگام ساخت هم فایل‌ها و شاخه را تغییر ندهید. برای صفحه مدیریت، پس از تغییر منبع باید همان سرور دوباره شروع شود.

APK یا خروجی وب قدیمی، شناسه ثبت‌شده خودش را نگه می‌دارد. تغییر Git یا سرور، خروجی ساخته‌شده را به نسخه تازه تبدیل نمی‌کند؛ باید bundle و artifact لازم دوباره ساخته شود. cache/کار Gradle اگر خروجی قبلی را بازاستفاده کند، شناسه قبلیِ داخل همان bundle معتبر می‌ماند. وجود تغییرات ثبت‌نشده، از جمله فایل‌های untracked، آشکارا اعلام می‌شود؛ آن خروجی صرفاً با SHA به‌تنهایی قابل بازسازی نیست.

این نشان مسیر محلی، URL، query، رمز و توکن را نمایش نمی‌دهد، شبکه تازه‌ای ندارد و دسترسی/نقش تازه ایجاد نمی‌کند.


## روش ثابت اثبات نسخه و تحویل — ۲۰۲۶-۱۰-۲۱

این بخش بنا به درخواست مالک ثبت شد تا تغییر ایجنت باعث گم‌شدن اصلاحات یا اشتباه‌گرفتن نسخه نصب‌شده نشود. این روش، اثبات انجام‌شدن بررسی‌های زیر نیست.

- مرجع توسعه ثبت‌شده پروژه `ui/customer-home-redesign` است. مسیر فعال تحویل فعلی `C:\Users\mohammad\Desktop\my-mobile-app` و شاخه کاری مشاهده‌شده `agent/d60-phone-lab-login` روی `b74dd66c1f737c8b2bc81b005c86a7554e02ef94` است. انتخاب مسیر دیگری، تغییر شاخه یا اعلام وضعیت تازه باید مبتنی بر بررسی زنده و ثبت علت باشد؛ این snapshot جای بررسی زنده نیست.
- در تحویل فعلی ۱۱ فایل رابط کاربری تغییر ثبت‌نشده دارند. SHA و عبارت «تغییرات ثبت‌نشده» این مجموعه را یکتا نمی‌کنند. پیش از ساخت بعدی وضعیت و diff دقیق حفظ شود؛ هنگام ساخت فایل‌ها تغییر نکنند. نسخه قابل بازتولید ترجیحاً از کامیت مشخص و درخت تمیز ساخته شود؛ ثبت یا انتشار کامیت فقط با مجوز جاری مالک انجام شود.
- زنجیره شواهد هر بیلد: مسیر/worktree و شاخه، SHA کامل، وضعیت درخت و در صورت dirty نسخه دقیق patch و فایل‌های untracked غیرحساس، فرمان و زمان ساخت، شناسه بسته و نقش، هش SHA-256 هر APK و امضای آن. رمز، کلید، دیتابیس و داده کاربر وارد شواهد منتشرشده نشوند.
- زنجیره شواهد هر نصب: سریال گوشی و user هدف، نتیجه نصب با حفظ داده، مسیر APK نصب‌شده برای همان بسته، تطبیق هش فایل نصب‌شده با artifact ساخته‌شده، شناسه بسته/Activity واقعاً بازشده و نشان نسخه داخل اجرا. صرف آیکون، نام برنامه، نام شاخه یا نصب Success اثبات تطبیق کامل نیست.
- نشان نسخه اپ، کد bundle را نشان می‌دهد؛ منبع و نسخه سرور جدا بررسی و ثبت شوند. در استفاده از Metro نیز مسیر و فرآیند سرویس و reload پس از تغییر منبع باید بررسی شوند.
- شاخه‌های روی کامیت یکسان کد ثبت‌شده یکسان دارند، اما worktreeهای dirty ممکن است متفاوت باشند. تست مستقل تمام شاخه‌های همسان لازم نیست. پیش از هر تصمیم حذف/ادغام، تغییرات منحصربه‌فرد و وضعیت ادغام بررسی شوند؛ این سند مجوز حذف، checkout، reset، merge یا force push نیست.
- بسته‌های نصب‌شده اصلی `com.paksho.customer` و `com.paksho.worker` هستند. بسته‌های مشاهده‌شده آزمایشی `.uxpreview` و `com.paksho.worker.qa20261014` نباید با آن‌ها اشتباه شوند؛ این ثبت مجوز حذف بسته یا داده نیست.
- وضعیت فعلی شواهد: نصب هر دو APK محلی با `install -r --user 0` موفق بود. بسته اصلی مشتری مستقیماً باز شد، خانه و نشان `b74dd66 · تغییرات ثبت‌نشده` و ورود حفظ‌شده مشاهده شد. تطبیق هش APK نصب‌شده با artifact، بازشدن و نشان متخصص و تأیید بصری تمام صفحات هنوز تأیید نشده‌اند. موفقیت تست‌های نسخه قبلی به ظاهر تازه تعمیم داده نشود.
- هر ایجنت در شروع، این سند و Checkpoint را بخواند و اختلاف را پیش از اقدام حل کند. فقط یک نویسنده فعال روی یک worktree و استفاده هماهنگ از گوشی/سرور مجاز باشد. تحویل شامل وضعیت واقعی، شواهد و کارهای باز باشد؛ وعده یا گزارش جای اثبات نسخه را نگیرد.


## Verified phone command (2026-10-21)

Run from the repository root; the script uses its own repository location, not the terminal's current directory:

    node scripts/verified-phone.cjs check --commit <FULL_SHA> --branch <EXPECTED_BRANCH> --role customer
    node scripts/verified-phone.cjs build-install --commit <FULL_SHA> --branch <EXPECTED_BRANCH> --role customer --serial R83X900E9CB

Use --role worker for the specialist app. Values in angle brackets must be resolved from the approved version, never copied from an obsolete snapshot.

The workflow rejects the wrong origin, root, branch, SHA, dirty/untracked source, absent/unauthorized target phone, wrong APK package, failed signature verification, source changes detected after build, non-fresh APK, failed install, installed APK hash mismatch and wrong foreground package. It installs with -r --user 0; it does not uninstall or clear app data. A stale active.lock fails closed: inspect the original process before removing that lock.

Build/install uses the existing Gradle tasks with --rerun-tasks and --no-build-cache, then records the APK SHA-256, certificate, source identity, exact package, serial and installed APK hash in the Git-private paksho-device directory. A failed operation must not be called verified; inspect the record status. No branch creation/switch, commit, push, merge, server restart or production action is performed.

The check mode is read-only. Build/install is an explicitly invoked standalone-build checkpoint, not the replacement for daily Metro/Fast Refresh work. It rebuilds before installing and does not accept an arbitrary old APK. Current dirty UI work must be reviewed/preserved and committed under the owner's authorization before this command permits a new build. Do not bypass the check with reset, stash, deletion or a force option.

Verification has limits: it is not a defense against a malicious concurrent process, does not prove visual correctness or server/API identity, and does not cryptographically attest arbitrary external build dependencies or environment. The foreground check is a momentary observation. Record the visible in-app identity and test the required pages separately.

Validation so far: 10 node:test cases passed; syntax check passed; read-only preflight on the actual working tree correctly refused uncommitted files. The complete build/install path has NOT been run through this new command yet. Existing APK installations are not retroactively attested by it.

The existing preview packages have not been renamed, re-iconed or removed in this change. Exact-package launching avoids relying on their similar launcher icons; visual distinction remains follow-up work.
