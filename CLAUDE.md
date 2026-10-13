# راهنمای ایجنت‌های پروژه پاکشو

**شاخه پیش‌فرض و مرجع توسعه:** `ui/customer-home-redesign`.

قبل از هر کار، این منابع همین شاخه را بخوان:
- [سند اصلی تحویل فارسی](docs/PROJECT_HANDOFF.fa.md)
- [ممیزی شاخه‌ها](docs/PROJECT_BRANCH_AUDIT.fa.md) و [مکمل](docs/PROJECT_BRANCH_AUDIT_SUPPLEMENT.fa.md)
- [تصمیم‌های معماری](docs/ARCHITECTURE_DECISIONS.md) و [Issue #11](https://github.com/antigravity1344-code/my-mobile-app/issues/11)

ابتدا `git status --short --branch`، `git rev-parse HEAD`، `git remote -v` و وضعیت واقعی PRهای #9/#10/#12 و CI را بررسی کن. قبل از هر ویرایش، گزارش فقط‌خواندنی از وضعیت پروژه و اقدام پیشنهادی بده. شواهد قدیمی را به head جدید تعمیم نده.

**بدون اجازه صریح مالک:** ساخت شاخه، commit/push، merge/rebase، حذف، force-push، deploy، تغییر CI یا تنظیمات و تصمیم مالی D-60 ممنوع است. شاخه‌های بازگشت و کارهای ادغام‌نشده محفوظ‌اند. پس از کار مجاز، سند تحویل را به‌روزرسانی کن.

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
