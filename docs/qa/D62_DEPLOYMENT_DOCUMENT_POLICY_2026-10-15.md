# D-62 — Deployment document-policy implementation handoff

Date: 2026-10-15
Base: `ui/customer-home-redesign` @ `55a2a4add6bd0824b28660c5e2b5cb1ad57365ba`
Branch: `feat/d62-deployment-document-policy-20261015`

## Implemented
- Added `src/policy/documentPolicy.ts` with explicit deployment ID, permitted input/stored MIME sets, max byte size, lossless-versus-explicitly-approved lossy picker quality, oversize rejection, legibility description and approver fields.
- Missing configuration is an error, never silently populated with invented per-customer numeric values.
- `PAKSHO_COMPAT_DOCUMENT_POLICY` retains *historical* `quality=0.5` and `maxBytes=614400`, without establishing a product approval or a default for other tenants.
- Image-selection boundary on existing Paksho worker screen uses the named compatibility profile. Binary signature rather than Expo asset MIME/filename determines stored MIME. Displayed extension is normalized to match bytes. The client rejects oversized files before building the upload payload.
- Added Vitest tests for incomplete profiles, explicit lossless mode, Paksho regression, signature handling, format allowlist and oversize rejection.
- No APK, device, QA database or production app touched.

## Tenant/deployment resolution boundary — deliberately not fabricated
The current worker flow does not provide an authenticated, trustworthy per-deployment policy resolver. The named Paksho compatibility profile is supplied explicitly to this flow. Other deployments **must not** use that constant: the app/bootstrap and trusted server configuration need a deployment-policy resolution contract (with version, provenance and approval), and the server upload validator must enforce the *same* resolved policy before any second deployment is enabled. Server currently still has a fixed 600 KiB cap, so multi-tenant enforcement is **NOT shipped** and this branch must not be deployed as a general multi-tenant solution. Until this contract exists, any non-Paksho deployment must fail closed rather than reuse legacy values.

## Verification
- Standalone Node 22 TypeScript-strip test of policy routines: **PASS** (5 assertions covering compatibility, MIME, extension, absent policy, oversize).
- TypeScript 6 strict single-module compile: **PASS** (NodeNext).
- Added `src/policy/documentPolicy.test.ts` for repository Vitest execution; **full repository Vitest, ESLint, end-to-end / API integration and full app typecheck NOT RUN** in this isolated handoff. Those are release gates, not claimed passes.
- Reusing the complete D-62 picker/device test was explicitly prohibited and was not done.

## Next gates before merging/deployment
1. Define server-authoritative deployment identification and policy delivery; do not infer tenant from user metadata or permissive defaults.
2. Align server-side MIME and maxBytes authorization with the resolved policy. Keep current Paksho behavior during rollout.
3. Run full repository app/server tests and typecheck on clean checkout of this branch, plus end-to-end upload-denial tests for configured deployments.
4. Product owner to approve numeric policies and legibility acceptance criteria per deployment.


## Follow-up to Issue #16 — architecture A approved (15 October 2026)

Decision: **one isolated server process, SQLite database and document directory per customer deployment**. This is not a shared multi-tenant server. The trusted server environment binds one deployment to one approved document policy. Client tenant identifiers and API URLs are not used as proof of tenant identity.

### Server configuration contract

- Legacy Paksho deployment: explicitly set `PAKSHO_DOCUMENT_POLICY=paksho-compat`; the named compatibility policy has `version=paksho-compat-v1`, quality `0.5`, and `maxBytes=614400`. Normal server startup without an explicit policy fails closed.
- Other customer deployments: set `PAKSHO_DEPLOYMENT_ID` and `PAKSHO_DOCUMENT_POLICY_PATH` to a trusted, server-local JSON policy file. The file must pass structural validation and its `deploymentId` must match the server environment. Do not put this file under a public or client-writable path.
- New deployments must explicitly set their own `PAKSHO_SQLITE_PATH` and `PAKSHO_WORKER_DOC_DIR`; provision independent storage for each server process, set least-privilege filesystem permissions, and never mount another customer's database or upload root. The code verifies presence, but distinctness across independent server instances remains a deployment orchestration responsibility.
- `NODE_ENV=test` without deployment configuration uses the named Paksho compatibility profile solely to preserve legacy isolated node:test fixtures. This is NOT a deployment option.
- Required policy fields: `version`, `deploymentId`, `allowedStoredMimes`, `maxBytes`, `compression`, `oversizeAction=reject`, `approvedBy`, `minimumLegibility`. Values must be explicitly approved. No numeric default is invented for other customers.

### MIME semantics and security

`allowedInputMimes` has been **removed** from the implementation. The Expo picker may re-encode an input before returning Base64; after conversion, its metadata cannot provide reliable binary proof of the original MIME. In this implementation the verifiable constraint is `allowedStoredMimes`: the bytes actually returned for storage. The server uses independent signature detection, rejects a mismatch with the MIME header, checks the per-deployment size cap and refuses disallowed stored formats. The client also checks the output bytes before attempting a PUT. The server does not allow a tenant ID supplied by the client to select policy.

The client fetches `GET /api/document-policy` for a non-secret server-selected policy before showing the native picker. A failed or incomplete response fails closed. **Caveat:** a malicious or outdated client can ignore UI quality settings; only the server's checks are authoritative for stored MIME and byte cap, not for how compression was performed. Policy version is returned to the client, but no version is currently persisted alongside each submitted document; this is a follow-up auditability improvement.

`quality:1` is used when lossy compression is not explicitly enabled. The approved compat policy continues to use 0.5. Server JSON body size is derived from configured `maxBytes` with Base64 overhead. No image upload occurs before server-side validation.

### Verification limitations and release gates

The PR must remain draft until complete Actions checks (app tests, all server tests, typecheck and lint) are confirmed for the final SHA. Test coverage includes isolated policy resolver and binary signature checks; additionally, full authenticated HTTP upload-denial tests, source-MIME pretransformation proof and cross-deployment storage audits are not established by the current unit tests. Verify document payloads with all relevant policy MIME branches and confirm no files are written on denial before production deployment. No phone/QA/APK work is part of Issue #16.
