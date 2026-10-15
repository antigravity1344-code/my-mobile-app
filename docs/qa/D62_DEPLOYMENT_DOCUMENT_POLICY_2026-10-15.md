# D-62 — Per-deployment document-policy implementation and verification

Date: 2026-10-15  
Base branch: `ui/customer-home-redesign` @ `55a2a4add6bd0824b28660c5e2b5cb1ad57365ba`  
Work branch: `feat/d62-deployment-document-policy-20261015`  
Implementation SHA verified: `8d85d37030fddbece88310d30db41f78f196d66b`  
CI: [GitHub Actions run 38756089386](https://github.com/antigravity1344-code/my-mobile-app/actions/runs/38756089386) — **success**, all recorded steps passed.

## Implemented architecture — option A approved in Issue #16

Each customer uses an **isolated server deployment** with its own policy, SQLite database and document directory; this is **not** a shared multi-tenant server. The server alone selects its policy from trusted deployment configuration, never from an untrusted tenant identifier supplied by a client or inferred from an API URL.

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

`allowedInputMimes` was removed because the image picker can re-encode the source before exposing its Base64 output. Neither `asset.mimeType` nor its filename proves the original bytes. The enforceable contract is `allowedStoredMimes` for the actual output bytes. The server independently checks binary signatures, declared MIME and maximum bytes; the client does equivalent pre-upload checks. Lossy picker quality is enabled only when the explicit server-selected profile allows it, with Paksho compatibility set to 0.5. The server cannot prove the original source MIME or that a client obeyed the requested compression quality.

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
- Independent security review and full authenticated HTTP upload-denial scenarios for new deployment profiles, including proving that denial creates no stored document.
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

**Remaining gates:** independent security review by a separate reviewer; operational proof of isolation across provisioned customer deployments, controlled configuration permissions, positive-path policy/version auditability, image decoding and real identity-document legibility review as required by policy. This authenticated negative-path test does not establish any of those. PR #15 remains draft and unmerged; no deploy or APK/device/QA change occurred.
