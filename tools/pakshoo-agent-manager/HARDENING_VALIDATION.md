# HARDENING-003 validation

Agent: CODEX-MANAGER. Instruction: PR #9 comment 6125075744.
Base: `29e62c6afca2499a42b5bc852b1792c8c6567bfc`.
Branch: `feature/pakshoo-agent-manager`.

Implemented: F-01 only. The canonical report is serialized once, measured with
`Buffer.byteLength(serializedReport, 'utf8')`, then that same string is stored.
The fixed inclusive limit is 32768 bytes. No database migration is required;
historical command receipts retain their existing replay semantics.

Validation on Node v24.19.0:

| Check | Result | Exit |
| --- | --- | --- |
| New tests against unchanged base implementation | 6 passed, 4 failed as expected: multibyte oversize accepted (Persian, emoji, three-byte text, CLI) | 1 |
| `npm test` after fix | 37 passed, 0 failed/skipped: all 27 original tests unchanged plus 10 new tests | 0 |
| `npm run demo` | COMPLETED; 6 events, 6 simulated reports, 0 pending; both launchers simulated and launched=false | 0 |
| CLI exercised by new test | Persian 32769 bytes rejected with REPORT_TOO_LARGE; exact 32768 accepted; replay accepted without additional mutation | 1 / 0 / 0 |

New tests cover ASCII, Persian, emoji and three-byte Unicode at both exact byte
boundaries, serialized escaping and other report fields, replay after reopening,
conflicting payload rejection, and command ID reuse after rejection. Full rows in
tasks, events, outbox, commands and resources are compared around rejection and
replay. The monotonic clock metadata is intentionally excluded: observing time on
a rejected command is existing behavior, required to prevent lease resurrection.

The npm environment emitted its existing unknown `http-proxy` configuration
warning; execution completed successfully. No dependencies were installed.

F-02 and F-03 are **design only** in SECURITY_PROPOSAL.fa.md. Authentication,
trusted ingress, input byte/depth bounds before parsing/hashing, pagination,
retention, GitHub transport and live execution are not implemented or validated
as operational controls by this change. This is not production-readiness approval.
