ROLE: MAIN_CODEX
TASK_ID: PAKSHO-INTEGRATION-RETEST-20261012-03
STATUS: EVIDENCE

شواهد مستقیم بازآزمایی یک‌باره روی ترکیب deacb58ae4c882d03d6846efc88a70cb949f45b2، tree f0d96bff341ed3597866c46b1735c69807951578؛ دو parent دقیق 8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40 و ef061ccdee4e00a3558fec773ad91a43010535cf.
این نظر صرفاً شواهد است؛ نتیجه و تفسیر در گزارش STATUS: COMPLETED ثبت می‌شود. هیچ کد یا آزمون اصلی تغییر نکرده است.

<details>
<summary>فرمان‌ها، کد خروج و SHA اجرای عمومی</summary>

~~~json
{
  "synthetic_commit": "deacb58ae4c882d03d6846efc88a70cb949f45b2",
  "tree": "f0d96bff341ed3597866c46b1735c69807951578",
  "source_clean_before_and_after": true,
  "sequential_checks": true,
  "completed_utc": "2026-10-12T11:51:58Z",
  "results": {
    "typecheck": {
      "command": [
        "npm",
        "run",
        "typecheck"
      ],
      "exit_code": 0,
      "duration_seconds": 7.7,
      "log": "/workspace/reports/pr9-pr10-retest-03-20261012/full-checks/typecheck.log"
    },
    "server": {
      "command": [
        "node",
        "--test",
        "--test-concurrency=1",
        "server/accountFeatures.test.js",
        "server/adminDashboard.xss.test.js",
        "server/batch4.test.js",
        "server/cancelRequest.test.js",
        "server/isolatedOtp.test.js",
        "server/kavenegarSms.test.js",
        "server/orderEvents.test.js",
        "server/orderStart.test.js",
        "server/pointsService.test.js",
        "server/sensitiveData.test.js",
        "server/smsOtpFlow.test.js",
        "server/sqliteFlow.test.js",
        "server/startIntegration.test.js",
        "server/workerCompletionIntegration.test.js",
        "server/workerDocumentStorage.test.js",
        "server/workerOrderPrivacy.test.js"
      ],
      "exit_code": 0,
      "duration_seconds": 31.38,
      "log": "/workspace/reports/pr9-pr10-retest-03-20261012/full-checks/server.log"
    },
    "app": {
      "command": [
        "npm",
        "test",
        "--",
        "--reporter=dot",
        "--maxWorkers=2",
        "--minWorkers=1"
      ],
      "exit_code": 0,
      "duration_seconds": 10.12,
      "log": "/workspace/reports/pr9-pr10-retest-03-20261012/full-checks/app.log"
    },
    "lint": {
      "command": [
        "npm",
        "run",
        "lint"
      ],
      "exit_code": 0,
      "duration_seconds": 4.93,
      "log": "/workspace/reports/pr9-pr10-retest-03-20261012/full-checks/lint.log"
    }
  }
}

~~~
</details>

<details>
<summary>ماتریس چهار assertion اصلی و نتایج مکمل</summary>

~~~json
{
  "combined_head": "deacb58ae4c882d03d6846efc88a70cb949f45b2",
  "pr9_head": "8ac99c5bd8228f7fd0ecdd8b74b41abc36df7f40",
  "pr10_head": "ef061ccdee4e00a3558fec773ad91a43010535cf",
  "original_test_sha256": "eead1391e0f585cc6b210b5160394b9c0779fa5f55e08920d0fa92516d97fcc1",
  "raw_full14": {
    "passed": 9,
    "failed": 5,
    "skipped": 0,
    "exit_code": 1
  },
  "raw_selected4": {
    "passed": 1,
    "failed": 3,
    "other_tests_skipped": 10,
    "exit_code": 1
  },
  "original_four": [
    {
      "name": "pending actual customer start response",
      "raw_status": "FAIL",
      "first_failure_line": 97,
      "diagnostic_expected": "previewActive() === false",
      "diagnostic_observed": "true",
      "primary_zero_network_assertion_line": 100,
      "primary_security_assertion_status": "NOT_REACHED",
      "supplemental_security_acceptance": "PASS"
    },
    {
      "name": "scheduled preview worker refresh",
      "raw_status": "FAIL",
      "first_failure_line": 118,
      "diagnostic_expected": "calls.read === 1",
      "diagnostic_observed": "0",
      "primary_zero_network_assertion_line": 120,
      "primary_security_assertion_status": "NOT_REACHED",
      "supplemental_security_acceptance": "PASS"
    },
    {
      "name": "pending profile address timer",
      "raw_status": "FAIL",
      "first_failure_line": 139,
      "diagnostic_expected": "calls.read === 1",
      "diagnostic_observed": "0",
      "primary_zero_network_assertion_line": 141,
      "primary_security_assertion_status": "NOT_REACHED",
      "supplemental_security_acceptance": "PASS"
    },
    {
      "name": "mounted preview persistent storage callback",
      "raw_status": "PASS",
      "primary_security_assertion_line": 151,
      "primary_security_assertion_status": "PASS",
      "supplemental_security_acceptance": "PASS"
    }
  ],
  "supplemental_four": {
    "passed": 4,
    "failed": 0,
    "skipped": 0,
    "exit_code": 0,
    "runtime_reset": "vi.resetModules per case",
    "sequence": "same legacy endPreview(); deferred reload stub",
    "per_case_assertions": [
      "outbound transport count === 0",
      "persistent reads === 0",
      "persistent writes === 0",
      "persistent removes === 0",
      "getApiAuthToken() === empty",
      "reload stub called once"
    ],
    "additional_assertions": [
      "stored worker/customer token bytes unchanged",
      "existing stored session survives remove/read attempt"
    ]
  },
  "limitations": [
    "Original tests untouched; supplemental suite is new independent security-only acceptance and is not the original four passing.",
    "Original full14 runtime lifetime is shared; quarantine persists between cases, so some active cases observe retired preview.",
    "No native UI mounted; worker/profile timer bodies are source-equivalent using actual production service/storage/auth/api modules.",
    "All transports are offline spies; no real network, credentials, operational data, Android build or handset test."
  ]
}

~~~
</details>

<details>
<summary>بازیابی بایت‌به‌بایت آزمون و mockها</summary>

~~~json
{
  "integrationPreviewProbe.test.ts": {
    "source": "/workspace/reports/pr9-pr10-integration-20261012/independent-preview-latest/integrationPreviewProbe.test.ts",
    "copy": "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/integrationPreviewProbe.test.ts",
    "sha256": "eead1391e0f585cc6b210b5160394b9c0779fa5f55e08920d0fa92516d97fcc1",
    "byte_identical": true
  },
  "expoMock.ts": {
    "source": "/workspace/reports/pr9-pr10-integration-20261012/independent-preview-latest/expoMock.ts",
    "copy": "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/expoMock.ts",
    "sha256": "8eea93e6f7d863a8142867d0adbfa11f998cfd05316804a52e2376793cdd3e65",
    "byte_identical": true
  },
  "storageMock.ts": {
    "source": "/workspace/reports/pr9-pr10-integration-20261012/independent-preview-latest/storageMock.ts",
    "copy": "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/storageMock.ts",
    "sha256": "c1d42998c8bc7596ca43ca460a0fd9fd48efb20b72c50598cf3d5531a74d7bea",
    "byte_identical": true
  }
}

~~~
</details>

<details>
<summary>فرمان‌های دقیق سه اجرای original14 / selected4 / supplemental4</summary>

~~~json
{
  "head": "deacb58ae4c882d03d6846efc88a70cb949f45b2",
  "tree": "f0d96bff341ed3597866c46b1735c69807951578",
  "tests": [
    {
      "label": "original-14",
      "command": [
        "/workspace/pr9-pr10-integration-20261012/node_modules/.bin/vitest",
        "run",
        "--config",
        "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/vitest.config.mjs",
        "--reporter=verbose",
        "--reporter=json",
        "--outputFile=/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/original14-results.json"
      ],
      "cwd": "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes",
      "exit_code": 1,
      "duration_seconds": 1.522,
      "log": "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/original-14.log"
    },
    {
      "label": "original-exit-4",
      "command": [
        "/workspace/pr9-pr10-integration-20261012/node_modules/.bin/vitest",
        "run",
        "--config",
        "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/vitest.config.mjs",
        "--testNamePattern",
        "EXIT acceptance:",
        "--reporter=verbose",
        "--reporter=json",
        "--outputFile=/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/original4-results.json"
      ],
      "cwd": "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes",
      "exit_code": 1,
      "duration_seconds": 1.237,
      "log": "/workspace/reports/pr9-pr10-retest-03-20261012/original-probes/original-exit-4.log"
    },
    {
      "label": "strict-original-sequence-4",
      "command": [
        "/workspace/pr9-pr10-integration-20261012/node_modules/.bin/vitest",
        "run",
        "--config",
        "/workspace/reports/pr9-pr10-retest-03-20261012/strict-original-sequence-acceptance/vitest.config.mjs",
        "--reporter=verbose",
        "--reporter=json",
        "--outputFile=/workspace/reports/pr9-pr10-retest-03-20261012/strict-original-sequence-acceptance/results.json"
      ],
      "cwd": "/workspace/reports/pr9-pr10-retest-03-20261012/strict-original-sequence-acceptance",
      "exit_code": 0,
      "duration_seconds": 1.353,
      "log": "/workspace/reports/pr9-pr10-retest-03-20261012/strict-original-sequence-acceptance/strict-original-sequence-4.log"
    }
  ],
  "completed_utc": "2026-10-12T11:50:52.779108+00:00"
}

~~~
</details>

<details>
<summary>خروجی خام فایل اصلی کامل ۱۴تایی</summary>

~~~text

 RUN  v3.2.7 /workspace/reports/pr9-pr10-retest-03-20261012/original-probes

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start PUT before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 1

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start PUT before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start-response PUT before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start-response PUT before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /admin/orders/PREVIEW-ORDER-1/start-decision PUT before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /admin/orders/PREVIEW-ORDER-1/start-decision PUT before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start POST before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start POST before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start-response POST before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start-response POST before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /admin/orders/PREVIEW-ORDER-1/start-decision POST before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /admin/orders/PREVIEW-ORDER-1/start-decision POST before outbound fetch
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview unknown and admin read routes fail closed with no fallback
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview unknown and admin read routes fail closed with no fallback
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > actual customer start-response service is blocked while ACTIVE
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > actual customer start-response service is blocked while ACTIVE
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > current preview fixture omits references necessary to show new start controls
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > current preview fixture omits references necessary to show new start controls
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > entrypoints clear boundary before reload without changing mounted preview mode
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > entrypoints clear boundary before reload without changing mounted preview mode
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: mounted preview callback cannot write real persisted storage before reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: mounted preview callback cannot write real persisted storage before reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: mounted preview callback cannot write real persisted storage before reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start PUT before outbound fetch 7ms
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start-response PUT before outbound fetch 1ms
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /admin/orders/PREVIEW-ORDER-1/start-decision PUT before outbound fetch 1ms
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start POST before outbound fetch 1ms
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start-response POST before outbound fetch 2ms
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /admin/orders/PREVIEW-ORDER-1/start-decision POST before outbound fetch 2ms
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview unknown and admin read routes fail closed with no fallback 1ms
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > actual customer start-response service is blocked while ACTIVE 1ms
 × integrationPreviewProbe.test.ts > actual combined-source preview boundary > current preview fixture omits references necessary to show new start controls 17ms
   → Cannot read properties of undefined (reading '0')
 × integrationPreviewProbe.test.ts > actual combined-source preview boundary > entrypoints clear boundary before reload without changing mounted preview mode 23ms
   → expected 'import { useState } from \'react\';\n…' to contain 'onExit={() => { endPreview(); DevSett…'
 × integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes 5ms
   → expected true to be false // Object.is equality
 × integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload 6ms
   → expected +0 to be 1 // Object.is equality
 × integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload 2ms
   → expected +0 to be 1 // Object.is equality
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: mounted preview callback cannot write real persisted storage before reload 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  integrationPreviewProbe.test.ts > actual combined-source preview boundary > current preview fixture omits references necessary to show new start controls
TypeError: Cannot read properties of undefined (reading '0')
 ❯ integrationPreviewProbe.test.ts:75:49
     73|     beginPreview('worker');
     74|     setPreviewScenario('ACCEPTED');
     75|     const order = (await previewApi('/orders')).orders[0];
       |                                                 ^
     76|     expect(order.startAcceptanceKey).toBeUndefined();
     77|     expect(order.startPrompt).toBeUndefined();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  integrationPreviewProbe.test.ts > actual combined-source preview boundary > entrypoints clear boundary before reload without changing mounted preview mode
AssertionError: expected 'import { useState } from \'react\';\n…' to contain 'onExit={() => { endPreview(); DevSett…'

- Expected
+ Received

- onExit={() => { endPreview(); DevSettings.reload(); }}
+ import { useState } from 'react';
+ import { View, Text, Pressable, StyleSheet, DevSettings } from 'react-native';
+ import { beginPreview, endPreview, beginPreviewShutdown, previewAvailable } from './src/components/native/previewRuntime';
+ import { RealUiPreview } from './src/components/native/RealUiPreview';
+ import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
+ import { BookingProvider } from './src/context/BookingContext';
+ import { OrdersProvider } from './src/features/orders';
+ import { ProfileProvider } from './src/features/profile';
+ import { NativeCustomerApp } from './src/components/native/NativeCustomerApp';
+
+ function ProductionApp() {
+   return (
+     <SafeAreaProvider initialMetrics={initialWindowMetrics}>
+     <BookingProvider>
+       <OrdersProvider>
+         <ProfileProvider>
+           <NativeCustomerApp />
+         </ProfileProvider>
+       </OrdersProvider>
+     </BookingProvider>
+     </SafeAreaProvider>
+   );
+ }
+
+ /** Preview mounts the real UI behind isolated storage/network. Reload clears the sandbox before real login. */
+ export default function App() {
+   const [mode, setMode] = useState<'select' | 'real' | 'preview'>('select');
+   if (!previewAvailable()) return <ProductionApp />;
+   if (mode === 'preview') return <RealUiPreview role="customer" onExit={() => { beginPreviewShutdown(); DevSettings.reload(); }} renderApp={(revision) => <ProductionApp key={revision} />} />;
+   if (mode === 'real') return <ProductionApp />;
+   return (
+     <View style={previewStyle.container}>
+       <Text style={previewStyle.title}>پاکشو — مشتری</Text>
+       <Text style={previewStyle.note}>نسخه توسعه | حالت پیش‌نمایش کاملاً آزمایشی</Text>
+       <Pressable style={previewStyle.button} onPress={() => { beginPreview('customer'); setMode('preview'); }}>
+         <Text style={previewStyle.buttonText}>ورود به پیش‌نمایش بدون پیامک</Text>
+       </Pressable>
+       <Pressable style={previewStyle.button} onPress={() => { endPreview(); setMode('real'); }}>
+         <Text style={previewStyle.buttonText}>ورود واقعی با پیامک</Text>
+       </Pressable>
+     </View>
+   );
+ }
+ const previewStyle = StyleSheet.create({
+   container: { flex: 1, backgroundColor: '#102b43', justifyContent: 'center', padding: 24, gap: 20 },
+   title: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
+   note: { color: '#f8d78b', fontSize: 13, textAlign: 'center' },
+   button: { backgroundColor: '#087caf', padding: 17, minHeight: 52, borderRadius: 14, justifyContent: 'center' },
+   buttonText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
+ });
+

 ❯ integrationPreviewProbe.test.ts:84:22
     82|     for (const file of ['App.customer.tsx', 'App.worker.tsx']) {
     83|       const source = readFileSync('/workspace/pr9-pr10-integration-202…
     84|       expect(source).toContain('onExit={() => { endPreview(); DevSetti…
       |                      ^
     85|     }
     86|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ integrationPreviewProbe.test.ts:97:29
     95|     requestReload();
     96|     await pending;
     97|     expect(previewActive()).toBe(false);
       |                             ^
     98|     expect(sentAuthorization).toBe(true);
     99|     // Security criterion deliberately RED on the current source.

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ integrationPreviewProbe.test.ts:118:24
    116|     await vi.advanceTimersByTimeAsync(10000);
    117|     clearInterval(timer);
    118|     expect(calls.read).toBe(1);
       |                        ^
    119|     expect(sentAuthorization).toBe(true);
    120|     expect(network.mock.calls.length, 'preview-origin poll reached rea…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ integrationPreviewProbe.test.ts:139:24
    137|     await vi.advanceTimersByTimeAsync(250);
    138|     clearTimeout(timer);
    139|     expect(calls.read).toBe(1);
       |                        ^
    140|     expect(sentAuthorization).toBe(true);
    141|     expect(network.mock.calls.length, 'preview-origin address timer re…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  1 failed (1)
      Tests  5 failed | 9 passed (14)
   Start at  11:50:49
   Duration  734ms (transform 280ms, setup 0ms, collect 342ms, tests 72ms, environment 0ms, prepare 104ms)

JSON report written to /workspace/reports/pr9-pr10-retest-03-20261012/original-probes/original14-results.json

~~~
</details>

<details>
<summary>خروجی خام همان چهار تست منتخب</summary>

~~~text

 RUN  v3.2.7 /workspace/reports/pr9-pr10-retest-03-20261012/original-probes

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes
[PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: mounted preview callback cannot write real persisted storage before reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: mounted preview callback cannot write real persisted storage before reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stdout | integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: mounted preview callback cannot write real persisted storage before reload
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start PUT before outbound fetch
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start-response PUT before outbound fetch
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /admin/orders/PREVIEW-ORDER-1/start-decision PUT before outbound fetch
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start POST before outbound fetch
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /orders/PREVIEW-ORDER-1/start-response POST before outbound fetch
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview denies /admin/orders/PREVIEW-ORDER-1/start-decision POST before outbound fetch
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > ACTIVE preview unknown and admin read routes fail closed with no fallback
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > actual customer start-response service is blocked while ACTIVE
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > current preview fixture omits references necessary to show new start controls
 ↓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > entrypoints clear boundary before reload without changing mounted preview mode
 × integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes 36ms
   → expected true to be false // Object.is equality
 × integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload 7ms
   → expected +0 to be 1 // Object.is equality
 × integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload 4ms
   → expected +0 to be 1 // Object.is equality
 ✓ integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: mounted preview callback cannot write real persisted storage before reload 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending actual customer start response stays offline until reload completes
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ integrationPreviewProbe.test.ts:97:29
     95|     requestReload();
     96|     await pending;
     97|     expect(previewActive()).toBe(false);
       |                             ^
     98|     expect(sentAuthorization).toBe(true);
     99|     // Security criterion deliberately RED on the current source.

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ integrationPreviewProbe.test.ts:118:24
    116|     await vi.advanceTimersByTimeAsync(10000);
    117|     clearInterval(timer);
    118|     expect(calls.read).toBe(1);
       |                        ^
    119|     expect(sentAuthorization).toBe(true);
    120|     expect(network.mock.calls.length, 'preview-origin poll reached rea…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  integrationPreviewProbe.test.ts > actual combined-source preview boundary > EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ integrationPreviewProbe.test.ts:139:24
    137|     await vi.advanceTimersByTimeAsync(250);
    138|     clearTimeout(timer);
    139|     expect(calls.read).toBe(1);
       |                        ^
    140|     expect(sentAuthorization).toBe(true);
    141|     expect(network.mock.calls.length, 'preview-origin address timer re…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 1 passed | 10 skipped (14)
   Start at  11:50:50
   Duration  639ms (transform 215ms, setup 0ms, collect 275ms, tests 51ms, environment 0ms, prepare 88ms)

JSON report written to /workspace/reports/pr9-pr10-retest-03-20261012/original-probes/original4-results.json

~~~
</details>

<details>
<summary>خلاصه خروجی سرور</summary>

~~~text
✔ a blocked user gets 403 with code ACCOUNT_BLOCKED and the unchanged Persian message on every request (8.338942ms)
ℹ tests 196
ℹ suites 0
ℹ pass 196
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 31317.353655
~~~
</details>

<details>
<summary>خلاصه خروجی اپ</summary>

~~~text
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

················································································································

 Test Files  53 passed (53)
      Tests  262 passed (262)
   Start at  11:51:43
   Duration  9.22s (transform 1.11s, setup 0ms, collect 2.08s, tests 1.75s, environment 13ms, prepare 4.37s)

npm notice
npm notice New major version of npm available! 11.9.0 -> 12.2.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.0
npm notice To update run: npm install -g npm@12.2.0
npm notice
~~~
</details>

<details>
<summary>خروجی lint</summary>

~~~text

> my-mobile-app@1.0.0 lint
> eslint . --ext .ts,.tsx


/workspace/pr9-pr10-integration-20261012/App.tsx
  361:47  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/workspace/pr9-pr10-integration-20261012/src/components/booking/NativeBookingWizard.tsx
  207:6  warning  React Hook useEffect has missing dependencies: 'applySavedAddressToWizard' and 'booking'. Either include them or remove the dependency array  react-hooks/exhaustive-deps

/workspace/pr9-pr10-integration-20261012/src/components/dashboard/AdminPanelScreen.tsx
  70:6  warning  React Hook useEffect has a missing dependency: 'loadData'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

/workspace/pr9-pr10-integration-20261012/src/components/native/NativeCustomerApp.tsx
  78:6  warning  React Hook useEffect has a missing dependency: 'syncAuthenticatedUser'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

/workspace/pr9-pr10-integration-20261012/src/components/native/previewDirectExit.test.ts
  5:67  warning  'previewApi' is defined but never used  @typescript-eslint/no-unused-vars

/workspace/pr9-pr10-integration-20261012/src/components/native/previewNetworkAudit.ts
  17:3    warning  Unexpected console statement. Only these console methods are allowed: warn, error  no-console
  36:113  warning  Unexpected any. Specify a different type                                           @typescript-eslint/no-explicit-any
  42:41   warning  Unexpected any. Specify a different type                                           @typescript-eslint/no-explicit-any
  45:3    warning  Unexpected console statement. Only these console methods are allowed: warn, error  no-console
  49:5    warning  Unexpected console statement. Only these console methods are allowed: warn, error  no-console

/workspace/pr9-pr10-integration-20261012/src/components/native/previewRuntime.ts
  17:3   warning  Unexpected console statement. Only these console methods are allowed: warn, error  no-console
  75:88  warning  Unexpected any. Specify a different type                                           @typescript-eslint/no-explicit-any

✖ 12 problems (0 errors, 12 warnings)

npm notice
npm notice New major version of npm available! 11.9.0 -> 12.2.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.0
npm notice To update run: npm install -g npm@12.2.0
npm notice

~~~
</details>

<details>
<summary>فرمان و نتیجه بررسی runtime تازه</summary>

~~~json
{
  "command": [
    "./node_modules/.bin/vitest",
    "run",
    "--config",
    "/workspace/reports/pr9-pr10-retest-03-20261012/fresh-runtime-lifecycle/vitest.config.mjs",
    "--reporter=verbose",
    "--reporter=json",
    "--outputFile=/workspace/reports/pr9-pr10-retest-03-20261012/fresh-runtime-lifecycle/results.json"
  ],
  "exit_code": 0,
  "duration_seconds": 1.02,
  "commit": "deacb58ae4c882d03d6846efc88a70cb949f45b2",
  "new_supplemental_suite_not_original_tests": true,
  "every_test_uses_fresh_modules": true,
  "no_real_transport_or_storage": true
}
~~~
</details>

<details>
<summary>خروجی بررسی runtime تازه</summary>

~~~text

 RUN  v3.2.7 /workspace/reports/pr9-pr10-retest-03-20261012/fresh-runtime-lifecycle

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 1

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 2

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 3

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 4

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 5

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 6

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 7

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 8

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 9

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 10

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 11

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 12

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 13

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 14

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 15

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 16

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 17

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 18

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 19

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 20

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 21

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 22

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 23

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 24

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 25

 ✓ freshRuntimeLifecycle.test.ts > independent fresh customer runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials 99ms
stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stderr | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] blocked_fetch blocked_count 1

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stderr | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] blocked_xhr blocked_count 2

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stderr | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] blocked_fetch blocked_count 1

stdout | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stderr | freshRuntimeLifecycle.test.ts > independent fresh customer runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] blocked_xhr blocked_count 2

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 1

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 2

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 3

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 4

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 5

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 6

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 7

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 8

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 9

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 10

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 11

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 12

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 13

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 14

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 15

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 16

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 17

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request POST mocked_count 18

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 19

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 20

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 21

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PATCH mocked_count 22

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 23

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request DELETE mocked_count 24

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials
[PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 25

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stderr | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] blocked_fetch blocked_count 1

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stderr | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] blocked_xhr blocked_count 2

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stderr | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] blocked_fetch blocked_count 1

stdout | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined
[PAKSHO_PREVIEW_NETWORK_AUDIT] preview_quarantined

stderr | freshRuntimeLifecycle.test.ts > independent fresh worker runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement
[PAKSHO_PREVIEW_NETWORK_AUDIT] blocked_xhr blocked_count 2

 ✓ freshRuntimeLifecycle.test.ts > independent fresh customer runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement 11ms
 ✓ freshRuntimeLifecycle.test.ts > independent fresh customer runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement 6ms
 ✓ freshRuntimeLifecycle.test.ts > independent fresh worker runtime > active preview blocks all start/customer/admin mutations and unknown route without credentials 8ms
 ✓ freshRuntimeLifecycle.test.ts > independent fresh worker runtime > endPreview holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement 8ms
 ✓ freshRuntimeLifecycle.test.ts > independent fresh worker runtime > beginPreviewShutdown holds fetch/XHR/token/persistent storage fence and clears sample memory until runtime replacement 7ms
 ✓ freshRuntimeLifecycle.test.ts > fresh initial real-login selection without any preview leaves ordinary transport/token/storage intact 7ms
 ✓ freshRuntimeLifecycle.test.ts > fresh release runtime ignores preview flag and preserves ordinary mock API behavior 11ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  11:53:24
   Duration  468ms (transform 128ms, setup 0ms, collect 49ms, tests 159ms, environment 0ms, prepare 77ms)

JSON report written to /workspace/reports/pr9-pr10-retest-03-20261012/fresh-runtime-lifecycle/results.json

~~~
</details>

SHA-256 خروجی‌های خام (فایل‌ها کامل و بدون تغییر در بسته محلی محفوظ‌اند):

~~~text
6e5d77fc6653e1f009ca18c839817bfd6f619037ae92a6bd3193009e93874e1b  original-probes/original-14.log
7531ea47f30d66a25aff1e61069ffe14447e25e0890303f8b3a787194ceed970  original-probes/original-exit-4.log
881b8f1f20c0105277f30201a66b1d5c5492fbaad2ca0c6b256d4af49a444e76  full-checks/server.log
72208a5097ff498309440c9f011998f5b638173d6bfce87ff7deffee74eb049e  full-checks/app.log
9cd3a50890521ff55efc9cd35eaa58a7e8c635b4ce7110883b1b7c8bbb8d7cbc  fresh-runtime-lifecycle/run.log
~~~

مسیر بسته کامل شواهد در محیط Codex است؛ در گیت‌هاب به‌عنوان artifact دانلودشده معرفی نمی‌شود. ANSI فقط برای نمایش این نظر حذف شده است؛ فایل‌های خروجی اصلی با hashes بالا محفوظ‌اند.

