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


## Supervised correction: explicit lab API and separate acceptance (2026-10-21)

This section supersedes the earlier build command and validation count. build-install now requires --api-url http://127.0.0.1:3000/api explicitly; the value is set only in the child build environment, not in .env. RN resets Metro cache; only the JS bundle task is rerun, preserving native incremental builds.

    node scripts/verified-phone.cjs build-install --commit <FULL_SHA> --branch <EXPECTED_BRANCH> --role customer --serial R83X900E9CB --api-url http://127.0.0.1:3000/api
    node scripts/verified-phone.cjs verify-installed --apk <APK_PATH> --role worker --serial R83X900E9CB

verify-installed inspects the provided artifact and existing foreground app only: no build, install, launch, taps, Git mutation or evidence-file write. Launch the approved package separately when required. Artifact hash/package/signature and foreground acceptance do not prove embedded source identity: sourceAcceptance stays not-checked until the supervisor compares expanded badge SHA, branch, role and dirty state. Current checkout cannot retrospectively identify an old dirty artifact.

Independent supervisor validation: syntax, diff check and 29 tests passed; verify-installed passed on the actual installed worker APK (artifact and foreground matched, source not checked by the command). Expanded badges of both installed apps separately show b74dd66, agent/d60-phone-lab-login, dirty. Host/installed hashes matched for both roles. Existing customer bundle contains 192.168.1.2 API target; lab reverse uses loopback. A fresh build with the old implicit API configuration was cancelled before installation. Complete corrected build/install and UI acceptance remain pending. Existing preview packages unchanged.


## Supervised real-device result and follow-up (2026-10-21)

Customer build from clean66f184ea57ff1ad02cb7f21cf51e5856b7124696 succeeded. Installer's30sec timeout left the record built-not-installed; it was NOT called a completed verification. Supervisor checked the exact artifact hash and completed install-r user0 without rebuilding. Read-only verification confirmed installed SHA50362ab8cdf0df3fde2e9b003c3510a4722f393b9a318dd1d746a70c1ee7c1f0, signature and foreground customer package. Expanded badge separately showed the full66f184e SHA, agent/d60-phone-lab-login, clean. Home loaded accepted8000minor order and preserved login; lab API connectivity works. Server separately remained b74dd66 and no server file changed. Orders, details, profile, support and address phone input above numeric keyboard were visually inspected on that version; no data saved during address inspection.

Follow-up code fixes: worker shared-font loading; support load-generation ordering and disabled pending retry; order filter single-line horizontal chips; readable national-ID placeholder with preserved optionality hint. Only APK install timeout increased to180sec; read commands keep30sec and no automatic retry is added. Coder reproduced3failed/1passed support regressions before fix and4passed after. Full app307tests/65files, guard29tests, tsc and targeted lint without warnings passed. Supervisor independently reviewed diffs and reran targeted support and guard tests. New-source APK/visual acceptance remains pending until separately recorded; the66f184e phone results do NOT prove this follow-up's appearance. No reference/QA branch move, PR15 merge, production or financial action.


## Verified6379478 checkpoint and scoped worker layout correction (2026-10-21)

Both role APKs from clean637947839f16e9aebb3672c05ccd2969672cb21b completed the corrected build/install guard. Customer hash bff84d09a14720d2a7b2a59fa53bebb5c9270b0e08d885e6d295d148495c6634; worker d32927de31d8f3e7a437513a62c8911d2a70046d58e3cbb0a432bb7e1957e894. Supervisor separately compared expanded in-app SHA/branch/clean badges for both roles. Customer accepted8000 order, completed4000/rating4 filter, readable national-ID hint, and worker cold launch/MyJobs1 were observed. Data and sessions preserved. Guard artifact/foreground acceptance and supervisor source/UI observations are separate evidence. Full onboarding/notification/large-text visual coverage and preview-name/icon differentiation are not claimed complete.

Real worker screenshot showed statusbar/header overlap and stretched category chips. Coder changed only NativeWorkerApp safe-area wrapper to existing safe-area-context provider (top/left/right edges), and category horizontal viewport flex growth/shrink/alignment while preserving44dp minimum and natural text size. Supervisor reviewed the exact two-file diff and existing App.worker provider. tsc, targeted lint with zero warnings, existing worker23tests/4files and diffcheck passed. The layout correction is not phone-accepted until the subsequent build/source/screenshot check is recorded in the existing external Checkpoint. No order/auth/financial logic, native dependency, reference branch or PR15 change.
