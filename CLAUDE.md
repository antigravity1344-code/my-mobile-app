# راهنمای ایجنت‌های پروژه پاکشو

**لینک مستقیم سند اصلی تحویل (برای همه ایجنت‌ها):** https://github.com/antigravity1344-code/my-mobile-app/blob/ui/customer-home-redesign/docs/PROJECT_HANDOFF.fa.md

**الزام شروع:** صرف مشاهده این لینک کافی نیست؛ سند اصلی را باز کن، بخوان و در گزارش اولیه تأیید کن که بررسی شده است.

**شاخه پیش‌فرض و مرجع توسعه:** `ui/customer-home-redesign`.

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
