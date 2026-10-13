# راهنمای ایجنت‌های پروژه پاکشو

**لینک مستقیم سند اصلی تحویل (برای همه ایجنت‌ها):** https://github.com/antigravity1344-code/my-mobile-app/blob/ui/customer-home-redesign/docs/PROJECT_HANDOFF.fa.md

**الزام شروع:** صرف مشاهده این لینک کافی نیست؛ سند اصلی را باز کن، بخوان و در گزارش اولیه تأیید کن که بررسی شده است.

**شاخه مرجع توسعه:** `ui/customer-home-redesign`؛ **شاخه پیش‌فرض GitHub را در شروع هر مأموریت زنده بررسی کن** (در آخرین بررسی نیز همین شاخه بود).

**روش رسمی تست گوشی:** ابتدا تست محلی با Expo/Metro + ADB و Backend آزمایشی؛ برای اصلاحات JS/TS از Fast Refresh استفاده کن و APK مستقل را پس از هر باگ نساز. build/install نسخه توسعه فقط در صورت نیاز اولیه یا تغییر Native؛ CI همچنان برای تصمیم ادغام لازم است. جزئیات و محدودیت‌ها در [سیاست تست محلی سند تحویل](docs/PROJECT_HANDOFF.fa.md#سیاست-مصوب-تست-روزمره-روی-گوشی--expometro-و-سرور-محلی-۱۳-اکتبر-۲۰۲۶) ثبت شده است. این سیاست مجوز Merge یا تغییر شاخه نیست.

## دستور واحد ورود ایجنت تازه — قابل کپی و استفاده مجدد

> تو ایجنت تازه پروژه پاکشو هستی. **مخزن رسمی:** https://github.com/antigravity1344-code/my-mobile-app . تنها ورودی تو همین آدرس است؛ از روی اسناد داخل مخزن مأموریت را بشناس.
>
> ابتدا از شاخه `ui/customer-home-redesign` فایل `CLAUDE.md` را بخوان؛ سپس `docs/PROJECT_HANDOFF.fa.md`، `docs/ARCHITECTURE_DECISIONS.md` و [Issue #13](https://github.com/antigravity1344-code/my-mobile-app/issues/13) را بررسی کن. اسناد تاریخی را به‌عنوان snapshot بخوان، نه وضعیت زنده. برای داده‌های متغیر، GitHub را مستقیماً بررسی کن: default branch، HEAD شاخه مرجع، PRهای باز، base/head SHA، CI همان SHA و موانع ادغام. اگر دسترسی نداری، صریحاً اعلام کن؛ حدس نزن و اطلاعات را از مالک درخواست کن.
>
> این نوبت **فقط‌خواندنی** است. گزارش کوتاه شش‌بندی بده: (۱) هدف کنونی و معیار پایان، (۲) مرجع توسعه و default فعلی، (۳) کارهای بسته و PRهای باز، (۴) شرط و شواهد پذیرش باگ طبق Issue #13، (۵) عملیات نیازمند مجوز و checkpoint مجاز، (۶) سه گام بعدی برای تست نسخه یکپارچه روی گوشی. در پایان منابع واقعاً خوانده‌شده، SHAهای زنده و محدودیت‌ها را ذکر کن.
>
> هیچ کدنویسی، Commit/Push، ساخت شاخه، Merge/Rebase، Force Push، حذف، تغییر CI/تنظیمات، Deploy یا ممیزی/بازنویسی فراگیر انجام نده؛ منتظر دستور ناظر و مالک بمان. نتایج تست قدیمی را به SHA جدید نسبت نده.

این متن **آزمون ورودی و تحویل اولیه** است؛ بعد از پذیرش آن، هر مأموریت توسعه باید جداگانه با محدوده و اجازه مالک تعریف شود.

قبل از هر کار، این منابع همین شاخه را بخوان:
- [سند اصلی تحویل فارسی](docs/PROJECT_HANDOFF.fa.md)
- [ممیزی شاخه‌ها](docs/PROJECT_BRANCH_AUDIT.fa.md) و [مکمل](docs/PROJECT_BRANCH_AUDIT_SUPPLEMENT.fa.md)
- [تصمیم‌های معماری](docs/ARCHITECTURE_DECISIONS.md) و [Issue #11](https://github.com/antigravity1344-code/my-mobile-app/issues/11)

ابتدا `git status --short --branch`، `git rev-parse HEAD`، `git remote -v` و وضعیت واقعی PRهای #9/#10/#12 و CI را بررسی کن. قبل از هر ویرایش، گزارش فقط‌خواندنی از وضعیت پروژه و اقدام پیشنهادی بده. شواهد قدیمی را به head جدید تعمیم نده.

**بدون اجازه صریح مالک:** ساخت شاخه، merge/rebase، حذف، force-push، deploy، تغییر CI یا تنظیمات و تصمیم مالی D-60 ممنوع است. Commit/Push فقط طبق استثنای محدود checkpoint در شاخه اختصاصی ایجنت (بخش سیاست زیر) مجاز است. شاخه‌های بازگشت و کارهای ادغام‌نشده محفوظ‌اند. پس از کار مجاز، سند تحویل را به‌روزرسانی کن.

---

# Claude Code — project context















<!-- cloude-code-toolbox:mcp-skills-awareness-begin -->

### MCP & Skills awareness (Cloude Code ToolBox)

_Last synced: 2026-09-04T11:21:58.150Z._

- **Full report:** `.claude/cloude-code-toolbox-mcp-skills-awareness.md` in this workspace (auto-overwritten on each scan). Use it as ground truth for configured servers and skill folders.
- **MCP:** For **live tools** in Claude Code, enable the matching server via `/mcp`. Servers are configured in `~/.claude.json` (user) and `.mcp.json` (project).
- **When the user’s task matches a server** (e.g. Confluence work and a **Confluence** / **Atlassian** MCP is listed), **prefer that server id** and plan on tool use—not only file search.
- **Skills:** Folders below contain `SKILL.md`; attach or cite paths in chat when relevant.

#### Workspace MCP

- `c:\Users\mohammad\Desktop\cleaning-mobile\.mcp.json` _(workspace: cleaning-mobile)_ — _file missing_

_No active workspace servers in mcp.json._

#### User MCP

- `C:\Users\mohammad\.claude.json` — _no servers defined_

_No active user-scoped servers in mcp.json._

#### Project skills

_None found (or no workspace open)._

#### User skills

_None found._

<!-- cloude-code-toolbox:mcp-skills-awareness-end -->


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
