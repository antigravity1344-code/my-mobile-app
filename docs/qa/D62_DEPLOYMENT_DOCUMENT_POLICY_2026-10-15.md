# D-62 — Per-deployment document-policy implementation and verification

Date: 2026-10-15  
Base branch: `ui/customer-home-redesign` @ `55a2a4add6bd0824b28660c5e2b5cb1ad57365ba`  
Work branch: `feat/d62-deployment-document-policy-20261015`  
Initial implementation SHA verified (historical): `8d85d37030fddbece88310d30db41f78f196d66b`  
Initial implementation CI (historical): [GitHub Actions run 38756089386](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38756089386) — **success**, all recorded steps passed.

## Final review and Sharp upgrade status — 16 Oct 2026 (latest)

**Scope:** PR #15, branch `feat/d62-deployment-document-policy-20261015`. This section supersedes older statements about reviews and prerequisites where they conflict; the historical commits and CI records below remain preserved.

### Reviews completed and boundaries

- **Independent D-62 implementation review completed** on `e86b9890bff18bc4f162913481cd0ad66dfef9df`. The outcome is constrained to the independently tested scenarios. This review is **not** an operational deployment approval.
- **Limited independent Sharp-upgrade review: PASS** on `95dad4d43baeda062400e3d4a3882ec22f8525cd`, covering the server-only transition `sharp@0.34.5` → `sharp@0.35.5`. The limited verdict does not replace broader deployment isolation or real-document/product approval.
- `npm ci` with the updated server lockfile **PASS**. `npm audit` for server dependencies **PASS: 0 known vulnerabilities reported** at the time checked. This is **not** a guarantee that no undiscovered or future vulnerabilities exist.
- Sharp `0.35.5` declares **Node.js >=20.9.0** in the server lockfile. GitHub CI succeeded on **Node.js 24.21.0**, but **the actual production runtime version has NOT been verified**. Confirm runtime compatibility before any deployment.

| Gate | Latest exact status | Qualification |
| --- | --- | --- |
| **G2 — image validation** | **PASS only in tested scenarios** | Authenticated HTTP rejected malformed APNG (corrupt second frame), animated WebP and incomplete inputs; valid single-frame PNG/JPEG/WebP passed relevant tests. No claim of exhaustive malformed-image coverage. |
| **F1 — orphan recovery** | **PASS for reconstructed/tested scenarios; correspondence to original evidence UNVERIFIED** | File-recovery and restart tests pass for independently reconstructed cases. One-to-one matching of those cases to the initial reviewer's original evidence bundle is still unverified. |
| **G1 — isolation in production** | **OPEN / BLOCKED FOR PRODUCTION** | Per-customer real storage/database paths, mount/symlinks, ACL/ownership, process separation, and infrastructure configuration have not been proven on actual provisioned deployments. |
| **Product acceptance** | **OPEN** | Real identity-document legibility and each customer's numerical size/compression/quality criteria remain for product approval. |

### Separate test environments and exact counts

- **Limited independent Sharp review:** **29 / 29 related tests PASS**. This is narrower than the entire server suite.
- **Independent full-server sandbox:** **110 observed tests = 102 PASS + 8 FAIL**. All eight failures were attributed to the **absence of Chromium** in that sandbox; this is not a clean full-suite PASS. The remaining **32 nested XSS subtests** included in the 142-case CI count **were not independently executed in the sandbox**.
- **GitHub Actions on Sharp-upgrade SHA `95dad4d43baeda062400e3d4a3882ec22f8525cd`:** [run #38842008114](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38842008114), **completed/success**. The CI checkout was the PR test merge-ref `c0064d8374ff073f000048862d289a55b026604b`, joining that head with base `55a2a4add6bd0824b28660c5e2b5cb1ad57365ba` (not a merged PR). Node `24.21.0`; **142/142 server tests PASS**, **218/218 app tests PASS** (45 files), TypeScript PASS, lint PASS with 0 errors and 4 existing warnings.
- **Review/CI distinction:** the independent 29-case verdict, independent sandbox 110-case result, and CI 142-case result are three **different executions and coverage levels**. None proves G1 or real-world product criteria.

**PR control:** PR #15 remains **OPEN / DRAFT / UNMERGED**. No merge, deploy, APK, phone or real identity-data testing is authorised by these results.

## D-62 implementation baseline — 16 Oct 2026 (historical, before Sharp upgrade)

**Scope and version of this historical D-62 implementation baseline:** PR #15, `feat/d62-deployment-document-policy-20261015`. The independently reviewed **implementation SHA was `e86b9890bff18bc4f162913481cd0ad66dfef9df`**; Sharp was subsequently upgraded and independently reviewed as described in the **latest section above**. Commit **`df4c2668b2bece8706271d608467d9c606817b9b` changed documentation only**, not code or dependencies; this subsequent documentation-only clarification also makes no code changes. The PR was checked as **OPEN / DRAFT / UNMERGED**. Preserve all historical implementation SHAs and CI runs below. CI success alone is not security acceptance.

| Gate | Current classification | Evidence and qualification |
| --- | --- | --- |
| **G2 — multi-frame/malformed images** | **PASS only in tested scenarios; independent code review performed on `e86b9890`** | An authenticated HTTP upload of an APNG with a corrupt second frame and a separate animated-WebP request were rejected with HTTP 400. The HTTP tests check that the worker record and the document directory (including pending intents) are unchanged after each rejection. Single-frame image decoding remains enforced; this is **not** evidence of every malformed or adversarial image case, nor of identity-document legibility. |
| **F1 — document orphan recovery** | **PASS for independently reconstructed and tested scenarios; one-to-one match with the original review evidence: UNVERIFIED** | Synthetic SQLite/filesystem and real process-restart regression tests cover (1) an unreferenced final `wd_<id>.jpg` without a journal, (2) an abandoned `wd_<id>.tmp` without a journal, and (3) an unreferenced historical `DOC-*.png`. They check preservation of DB-referenced documents and unknown files, a failed unlink causing startup to fail closed with a recoverable intent, recovery on a subsequent restart and malformed-intent fail-closed handling. The original evidence bundle at `/tmp/review-evidence/` was not available to the implementer; **it is not verified that these three reconstructed paths exactly match the reviewer's original three findings**. Multi-process/shared-directory races and all filesystem crash modes are not proven safe. |
| **G1 — deployment isolation** | **OPEN / BLOCKED FOR PRODUCTION** | Actual per-deployment separation has **not** been demonstrated on provisioned customer infrastructure: SQLite and document paths, realpath/symlinks, mount overlap, ACL/ownership, server process identity and configuration permissions need operational evidence. Different pathname strings alone do not guarantee isolation. |
| **Product acceptance** | **OPEN** | Readability of real identity documents and numeric size/quality/compression thresholds for each customer still require explicit product-owner approval; historical Paksho `quality:0.5` and `614400` are compatibility values, not global defaults or newly approved customer criteria. |

**Security-review status:** independent review **was performed on the code implementation `e86b9890bff18bc4f162913481cd0ad66dfef9df`**. Earlier independent findings prompted the G2/F1 fixes; subsequent review does **not** turn the limited test results into universal guarantees. G2 remains PASS **only for tested scenarios**; F1 remains PASS **for reconstructed/tested scenarios, with exact matching to the original evidence bundle UNVERIFIED**. G1 remains OPEN/BLOCKED FOR PRODUCTION and product approvals remain outstanding. Commit `df4c2668b2bece8706271d608467d9c606817b9b` changed **only this QA document**; a second security review of the **same unchanged code** is **not required merely because of that documentation commit**. A future code change or new evidence may warrant new review. The older statements “independent review not yet performed” and “authenticated HTTP negative tests not yet performed” are **historical, not the current status**.

### Test-count reconciliation: independent sandbox vs CI

- **Independent sandbox execution:** **110 observed test cases = 102 passed + 8 failed**, with those **eight failures caused by missing Chromium** in that sandbox. Do not label this run 110/110 passed.
- **32-case count difference:** the 32 cases separating 110 and 142 are **nested XSS subtests**, executed with Chromium available in the CI environment. These **32 nested subtests were not independently executed in the sandbox**. The difference is explained by coverage/environment, not evidence of 142 independently passing in the sandbox.
- **GitHub Actions evidence:** [run #38829158836](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38829158836), **Node `v24.21.0`**. The checkout log identifies PR merge commit **`ee676a0964f5632eae9907faae7441e9cd95056a`**, whose second parent is implementation HEAD `e86b9890bff18bc4f162913481cd0ad66dfef9df`; it is **not** a merge of PR #15 into the base branch. CI result: **142/142 server tests passed**, **218/218 app tests passed (45 files)**, typecheck and lint passed (lint: 0 errors, 4 existing warnings). This is a CI result on the PR merge-ref tree, not a substitute for the sandbox's missing independent Chromium subtests.
- **Reconciliation conclusion:** the test-count discrepancy is documented; **independent execution of those 32 XSS subtests in the Chromium-less sandbox remains UNVERIFIED**. Neither test-count reconciliation nor CI closes G1 or grants merge/deploy approval.

### Documentation-only commit and CI attribution (verified 16 Oct 2026)

- **Reviewed executable implementation:** `e86b9890bff18bc4f162913481cd0ad66dfef9df`; independent review on that implementation has been completed. **No duplicate code-security review is required solely for documentation-only commit `df4c2668b2bece8706271d608467d9c606817b9b`**, whose changed-file comparison contains only `docs/qa/D62_DEPLOYMENT_DOCUMENT_POLICY_2026-10-15.md`. Review findings and deployment/product gates remain as classified above.
- **CI tied to documentation HEAD:** [GitHub Actions run 38839590230](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38839590230) has `head_sha=df4c2668b2bece8706271d608467d9c606817b9b` and `completed/success`. The actual checked-out PR **merge-ref** in its logs was `8c86668b8c578a4e10f7e3c0f5e66b8ca2ca6418`; its parents are base `55a2a4add6bd0824b28660c5e2b5cb1ad57365ba` and documentation commit `df4c2668b2bece8706271d608467d9c606817b9b`. This test merge commit is **not** a PR merge into the base branch.
- **CI environment and counts:** Node.js `v24.21.0`; `218/218` app tests, `142/142` server tests (including Chromium-dependent nested XSS tests), typecheck and lint pass; four existing lint warnings, zero lint errors. Independent sandbox evidence remains **110 = 102 PASS + 8 FAIL (Chromium absent)**, and **the 32 extra nested XSS cases were not independently executed in that sandbox**. This distinction does not change G1 or product-acceptance status.
- **This documentation-only follow-up:** no change to executable code, dependency versions, policy selection, tests or operational deployment; PR remains open/draft/unmerged. The follow-up CI run must be attributed to its own new documentation commit SHA and merge-ref, not retroactively to this historical run.

## Implemented architecture — option A approved in Issue #16

Architecture A **requires** each customer to have an isolated server deployment, SQLite database and document directory; this is **not** intended to be a shared multi-tenant server. **G1 remains OPEN / BLOCKED FOR PRODUCTION:** actual isolation on customer infrastructure (including paths, mount/symlinks, ACL/ownership and process identity) is not yet evidenced. The server alone selects its policy from trusted deployment configuration, never from an untrusted tenant identifier supplied by a client or inferred from an API URL.

- `server/documentPolicy.js`: validates a named/versioned policy, loads it from trusted server configuration and inspects the bytes, MIME claim, allowlisted stored format and configured maximum size before storage.
- `server/index.js`: refuses startup for missing or invalid policy, uses that policy on worker onboarding, exposes its non-secret configuration via `GET /api/document-policy` and sizes the JSON body limit from the configured cap.
- `src/policy/documentPolicy.ts` and `src/components/native/WorkerOnboardingScreen.tsx`: validate the server-selected profile before opening the picker; inspect returned image bytes and fail closed if policy or selected file is invalid.
- `server/documentPolicy.test.js`, `src/policy/documentPolicy.test.ts`: regression checks for missing policy, unapproved MIME, declared/binary MIME mismatch, oversize rejection and historic Paksho compatibility.
- `.github/workflows/verify-safe-ui.yml`: app tests, full server regression suite, typecheck and lint. Chromium sandbox override applies only to this isolated CI.
- `docs/ARCHITECTURE_DECISIONS.md`: records architecture A and MIME semantics.

## Trusted configuration and compatibility

The legacy Paksho server must explicitly set `PAKSHO_DOCUMENT_POLICY=paksho-compat`; the named compatibility policy retains picker `quality:0.5`, the 614400-byte cap and the historic oversize message. Those are **not defaults for other customers**.

A new isolated deployment must configure `PAKSHO_DEPLOYMENT_ID` and `PAKSHO_DOCUMENT_POLICY_PATH` for its approved server-local JSON profile, with an exact deployment ID match. It must also explicitly configure `PAKSHO_SQLITE_PATH` and `PAKSHO_WORKER_DOC_DIR`. The policy requires explicit version, allowed stored MIME types, maximum bytes, compression settings, oversize handling, approver and legibility criteria. No numerical policy for an unidentified customer has been invented. Missing/invalid policy results in startup failure; `NODE_ENV=test` has an isolated legacy test-fixture-only compatibility path, not a production default.

## Meaning of MIME and compression

`allowedInputMimes` was removed because the image picker can re-encode the source before exposing its Base64 output. Neither `asset.mimeType` nor its filename proves the original bytes. The enforceable contract is `allowedStoredMimes` for the actual output bytes. The server independently checks binary signatures, declared MIME and maximum bytes; subsequent D-62 changes also perform bounded full-image decode and explicitly reject APNG and animated WebP in the tested scenarios. The client performs pre-upload checks, but server-side validation is authoritative. These checks do not prove real-document legibility. Lossy picker quality is enabled only when the explicit server-selected profile allows it, with Paksho compatibility set to 0.5. The server cannot prove the original source MIME or that a client obeyed the requested compression quality.

## Verified tests (for SHA 8d85d37030fddbece88310d30db41f78f196d66b)

GitHub Actions run [38756089386](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38756089386) finished with **success**:
- App and server lockfile dependency installation — PASS
- `npm run typecheck` — PASS
- `npm test -- --reporter=dot` — PASS
- `npm run lint` — PASS
- `node --test --test-concurrency=2 server/*.test.js` — PASS (fake SMS; isolated Chromium setting)

Earlier intermediate CI failures are superseded by this successful run on the implementation SHA; they are not evidence that tests remained unexecuted.

## Still-open acceptance gates

- Review **actual operational isolation** across independently provisioned servers, databases, document directories, access controls and configuration permissions; a passing unit suite does not prove cross-customer filesystem separation.
- Independent security review **has occurred on code SHA `e86b9890bff18bc4f162913481cd0ad66dfef9df`** after earlier G2/F1 findings and fixes. Authenticated HTTP negative/no-write tests **have also been implemented and run**, including APNG and animated WebP regressions. **G2 is PASS only in tested scenarios; F1 is PASS for reconstructed/tested scenarios while one-to-one correspondence with original evidence is UNVERIFIED**. The review is not a blanket guarantee; G1 remains **OPEN / BLOCKED FOR PRODUCTION**, and real-document legibility/customer numeric criteria still require product approval. Subsequent documentation-only commits do not themselves require repeat code-security review.
- Persist/version-audit the policy associated with individual documents if required for long-term traceability; current validation does not establish that audit trail.
- Product owner to approve customer-specific numeric limits and real-document legibility criteria before each deployment; synthetic QA files do not prove legibility of a real ID.
- PR #15 remains **draft/unmerged/unreleased**. No phone testing, APK build/install, production app modification or QA database changes occurred during Issue #16.

This document supersedes the initial implementation handoff's outdated assertions that the server policy resolver/enforcement were absent or that the full repository suites had not run.


## Issue #16 follow-up — authenticated HTTP negative-path/no-write gate (15 Oct 2026)

Test implementation commit: `7d6a6947b523415a3b9e26ccb687c7023a9721cc`.
Added `server/documentPolicy.http.test.js`, included in the full server suite by the existing `server/*.test.js` CI glob.

The fixture creates a synthetic isolated deployment with a trusted server-local JSON policy (`deploymentId=synthetic-deployment`, `allowedStoredMimes=['image/png']`, `maxBytes=64` **test-only value**), temporary SQLite path and temporary documents directory. It creates a fictional WORKER account through the fake OTP harness and authenticates using a real bearer token. No actual SMS, identity documents, phone or QA account is used.

Four genuine HTTP `PUT /api/users/worker-onboarding` cases are submitted:
1. PNG bytes with a forged JPEG MIME claim → HTTP 400, declared MIME does not match bytes.
2. JPEG bytes declared as JPEG but disallowed by deployment policy → HTTP 400, output MIME not permitted.
3. Valid PNG magic with bytes above this test policy's cap → HTTP 400, over-limit.
4. JSON request larger than the configured body parser allowance → HTTP 413.

For **each denial**, the test compares a snapshot of the complete worker record (serialized) and the names and contents of the temporary document directory, before and after the HTTP response. All must remain byte-for-byte unchanged, with the initial worker status `REGISTERED`; no rejected document file is written. The test checks the actual HTTP status and, for controlled 400 responses, the user-visible error category.

Verification: [Actions run 38758550964](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38758550964) on the test-implementation SHA completed **SUCCESS**, including app tests, full server suite, TypeScript and lint.

**Gates at the time of this historical follow-up (15 Oct 2026):** separate independent security review, operational proof of isolation across provisioned customer deployments, configuration permissions, positive-path policy/version auditability, image decoding and real identity-document legibility. Subsequent reviews and fixes are recorded in the current-status section above: independent review **was completed on `e86b9890bff18bc4f162913481cd0ad66dfef9df`**, and authenticated HTTP denial tests were performed. The 15 Oct requirement to commission an independent review is historical, **not a current unfulfilled requirement for that already reviewed SHA**. G2/F1 qualifications, G1 and real-document/product approvals remain open as described above. PR #15 remains draft and unmerged; no deploy or APK/device/QA change occurred.
