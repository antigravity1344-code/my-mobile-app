# SECURITY-004 validation

Agent: CODEX-MANAGER. Instruction: PR #9 comment 6128564865.
Base: `e2365404bba64f72d0a5d5aef6c786873fbd9c23`.
Branch: `feature/pakshoo-agent-manager`.

Final execution: Node v24.19.0. Raw output and exit codes:
[evidence/security-004.json](evidence/security-004.json).

| Execution | Result | Exit |
| --- | --- | --- |
| npm test | 62 passed; 0 failed, skipped or cancelled | 0 |
| npm run demo | COMPLETED; 6 events, 6 simulated receipts, 0 pending; both launchers launched=false | 0 |
| CLI subprocess tests | valid registration/replay, report-size boundaries, raw-input boundaries and page cursor round-trip accepted; malformed, oversized, invalid UTF-8/config and stalled stdin rejected | 0 for valid requests; 1 for expected rejections |

All 37 previous test cases remain. The sole previous-test edit adapts the CLI
collection assertion from array length to `items.length` and additionally checks
`nextCursor === null`; this is the documented page-envelope contract change, not
a removed assertion. There are 25 new cases: 11 input/CLI, 5 pagination, 9 trusted
ingress. The earlier report-size test file and process-race helpers are unchanged.

Evidence includes exact raw 262144/262145-byte boundaries (ASCII/Persian/emoji),
depth 32/33, quoted braces/escapes, invalid UTF-8, open-stream early rejection,
the actual CLI 5000ms deadline, 10000/10001 members, direct-object cycles/getters,
full durable-state snapshots including an active resource lock, and CLI rejection
before database creation. Pages cover 100/500 limits, invalid cursors, concurrent
append, acknowledgement between pages, UTF-8 response volume, and oversized
historical rows retained with explicit error IDs.

Offline trust tests cover missing host identity, self-asserted identity/approval,
scope/source/SHA/action/resource and edited-instruction mismatches, missing or
expired approval, wrong roles, cross-task reads/receipts, a complete offline
lifecycle, persistent replay after reopening, conflicting replay bindings and
separate principals. Host context is synthetic; these tests do not validate a
real identity provider or GitHub instruction/owner verification.

Implemented bounds and API contracts are in [SECURITY_004.fa.md](SECURITY_004.fa.md).
No dependencies, migrations, network transport, CI, live execution or application
changes are part of this delivery. The existing npm `http-proxy` configuration
warning is retained in raw evidence; it did not prevent test/demo completion.

Remaining limitations: CLI/Manager are trusted-local APIs and can bypass the
separate adapter; real authentication is BLOCKED_FOR_REAL_AUTH. Host identity,
approval provenance, revocation, clock integrity and unique worker/run mapping
are external prerequisites. Cursor signatures, retention/export, process quotas,
multi-host execution and external-effect fencing remain unimplemented. This
completion is scoped to offline SECURITY-004, not production readiness.
