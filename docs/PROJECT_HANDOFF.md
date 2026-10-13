# Paksho — durable project handoff / پرونده تحویل دائمی
Updated: 2026-10-13. Status: documentation snapshot, **not** authorization to implement or merge.
Repository: https://github.com/antigravity1344-code/my-mobile-app
Site (separate): https://github.com/antigravity1344-code/my-cleaning-site

## Mandatory startup procedure (new agent)
1. Confirm repository identity, local working directory, current branch, `git status`, remote URLs and upstream. Do **not** assume the default branch is the integration baseline. Never discard uncommitted changes.
2. Read this file, `CLAUDE.md`, `docs/ARCHITECTURE_DECISIONS.md`, Issue #11, and current PR #9, #10, #12 including their head/base SHAs, files changed, CI and latest comments. Read any relevant handoff evidence from the actual PR branch. GitHub is the authority for current remote state; this snapshot can become stale.
3. Produce a **read-only acceptance report** stating: verified repo/path/branch/SHAs, what is merged vs open, completed work, blocked work, risks, next proposed *single* task, and evidence links. Clearly separate verified facts, previous-agent claims and assumptions.
4. **STOP for owner approval** before edits, commits, pushes, PR creation, merges, rebases, force pushes, deployments, device operations or CI/security-setting changes. Do not repeat previously completed tasks.
5. On completion, update the handoff on the authorized branch and post a concise evidence report with commit SHA, tests, changed files, blockers and follow-up. If the handoff is not present on the checked-out branch, retrieve it explicitly from its branch/URL and disclose that limitation.

## Baseline and open work (observed 2026-10-13)
- Development/reference branch: `ui/customer-home-redesign`; reference SHA observed: `febe14ee679c4d71b177e3b65844be6b14ce9625`. Do not edit `main` directly.
- PR #9 https://github.com/antigravity1344-code/my-mobile-app/pull/9 — worker-start/order lifecycle; **open, draft, unmerged** at observation.
- PR #10 https://github.com/antigravity1344-code/my-mobile-app/pull/10 — isolated UX/UI preview; **open, draft, unmerged** at observation. Historical Galaxy A06 preview testing is described in PR; do not assume current device connectivity.
- PR #12 https://github.com/antigravity1344-code/my-mobile-app/pull/12 — notification-test stabilization, base on PR #9 branch; **open, draft, unmerged** at observation.
- Issue #11 https://github.com/antigravity1344-code/my-mobile-app/issues/11 — roadmap.
- `docs/ARCHITECTURE_DECISIONS.md` is the authoritative policy source. D-60 server-authoritative pricing/financial policy is **not finalized**; do not invent tariffs, commissions or pricing engine.
- PR #9 contains CI changes (Chromium/sandbox and Android workflows) requiring explicit review before acceptance.
- Notification ordering may be nondeterministic when `createdAt` timestamps tie; `unreadCount` limited to recent rows is a reported risk. Do not silently alter production behavior.
- Integration acceptance mission 006 was **reported** as passing executable JS suites (server 196, app 262, security 21), with native device/network and true reload tests **blocked** in that environment. This is prior-agent evidence, not a fresh execution by this document's author.
- Test-hardening mission 007: a proposed `server/orderEvents.test.js` change snapshots old notifications in a Map and asserts their preservation, but its actual pushed status and test outcome **must be verified**; do not assume it landed.
- Proposed integration order (not permission): review/accept PR #12 into PR #9, then PR #9 into reference branch, then PR #10, with CI and explicit owner approvals at each step. Re-evaluate after fetching latest state.

## Architecture and safety invariants
- Never silently revise decisions marked `قطعی`; items marked `نهایی نشده` are not approved business rules.
- Preserve order-event and points-ledger audit history; maintain privacy boundaries between customer, worker and admin.
- Preview builds and their tokens/storage/network must remain isolated from production; do not substitute simulated JS evidence for real-device verification.
- Keep site repo and app repo separate. A change in one is not evidence of change in the other.
- No hardcoded financial defaults or bypass of security controls to make tests pass.

## Agent map (historical, verify current ownership)
- CODEX-MANAGER / Codex #2: PR #9 lifecycle and app development.
- CODEX-CORE: core architecture, backend/security review.
- UX-UI: PR #10 isolated preview and user experience.
- ARENA-SITE-REVIEWER: separate website repo.
These labels are descriptive, not a delegation of write authority.

## Why prior handoff failed and how to prevent recurrence
A file existing on *one* branch does not make it available to an agent on another branch. Claude Code may read `CLAUDE.md` from its current working tree, not automatically from every remote branch. Older `CLAUDE.md` in the reference branch mainly documented MCP/toolbox setup and did not include current PR state. A new chat may also lack past chat context. Therefore: explicitly give the repository, handoff branch and file URL; require agent to report the exact file content/version it read, verify GitHub state, and stop for approval. Merge these docs to the actual onboarding baseline only after review.

## Evidence and update protocol
Every handoff update must include UTC date, observed ref/commit SHA, links to relevant PR comments, what changed since last handoff, verified tests, unresolved issues and next owner decision. Never claim test success or device availability without fresh evidence. Avoid credentials, secrets, private customer data and local machine tokens.
