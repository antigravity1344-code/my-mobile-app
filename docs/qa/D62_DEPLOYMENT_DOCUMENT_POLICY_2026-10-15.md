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
