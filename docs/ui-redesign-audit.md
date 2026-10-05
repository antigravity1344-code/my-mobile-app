# Paksho UI audit — Phase 1

Audit date: 2026-10-05. Base: `main` @ `165ad0b` (`fix(android): bundle each app flavor from its own entry`).

This pass is visual only. OTP, auth, API, storage, pricing, and order submission stay as they are.

## Branch check

Nothing that should be the UI source of truth lives only off `main`.

| Branch                                | Versus `main`                | What would be lost if ignored                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/orders`                      | Ancestor of `main`           | Nothing                                                                                                                                                                                                                                                                                               |
| `feature/profile-and-auth`            | Ancestor of `main`           | Nothing                                                                                                                                                                                                                                                                                               |
| `say_hello`                           | Ancestor of `main`           | Nothing                                                                                                                                                                                                                                                                                               |
| `feature/customers`                   | 3 commits not in `main`      | Payment-currency and payment-response validation in `src/api/payment.ts` and `src/utils/pricing.ts`. Not a redesign. Leave it off this branch.                                                                                                                                                        |
| `agents/greeting-in-persian-b5e6f654` | Copy tweaks on an older tree | Web wizard summary text for per-square-meter and hourly labor, two pricing-table scenarios, and the label «انتخاب نوع سرویس». Also drops a `console.warn` in `getCurrentPosition`. Worth a look in the booking phase. Not a design system, and it sits on a stale lockfile, so it is not merged here. |

## Design system today

There is no shared theme module. Each screen owns a `StyleSheet` (native) or Tailwind classes (web dashboard). Repeated decisions:

- Page background `#f8fafc`, ink `#0f172a`, muted `#64748b`
- Action color `#0284c7` (sky), money/success `#059669`, warning amber
- Chrome for customer and worker shells: slate `#0f172a` / `#1e293b`
- Radius mostly 12–16, padding 16–20, type weight 800 with the platform font
- Buttons, inputs, empty states, and headers are copied, not shared

The implemented palette is cool slate + sky. It is not yet the warm cream and teal Paksho should feel like. Phase 1 adds that palette as tokens and keeps the old hex values on `colors.legacy` so unmigrated screens do not change by accident.

Typography is the system font. Persian copy is right-aligned in most native screens, but there is no Persian typeface, so digits and tone depend on the device. Web admin HTML already names Vazirmatn; the app did not load it.

RTL is manual: `flexDirection: 'row-reverse'`, `textAlign: 'right'`, and `dir="rtl"` on the web dashboard. `I18nManager` is not forced, which is correct for now — a global flip would double-reverse screens that already use `row-reverse`. Directional icons are inconsistent (the old home rotated `ArrowRight`; many chevrons are not mirrored).

Two styling stacks sit side by side: Tailwind + `lucide-react` on the web dashboard, and `StyleSheet` + `lucide-react-native` on the product screens.

## Cross-cutting issues

- No shared button, field, card, header, empty/loading/error, or tab bar. Touch height and color drift per screen.
- Customer native app had no home. After login it opened the booking wizard under a dark icon bar (orders, profile, support, alerts, logout).
- Web home lived in a white card on a dark admin dashboard, visually separate from the native shell.
- Latin step numbers and some ungrouped prices. `toLocaleString('fa-IR')` is used in places and skipped in others.
- Empty and error UI is often one line of gray text. Notifications have no loading state. Worker errors use `alert()`.
- Marketing on the old home is not backed by the app: a first-order gift badge and a 4.8 score. The pricing engine does not apply a first-order discount (`NEW` tier is zero).

## Screen notes

### 1. Customer Home

Web `HomeScreen` was a sky gradient banner, three stat tiles, a 2-column service grid, and an amber recurring strip. Service cards were title + price only, with no icon. The native customer app did not render this screen at all.

### 2. Booking wizard

`NativeBookingWizard` is one long StyleSheet (sky stepper, slate page). Step numbers are western digits. Web `BookingWizardContainer` is a separate Tailwind layout, so the two wizards can drift.

GitHub issue #1 describes `useGps()` leaving the spinner on forever because `setGpsLoading(false)` sat outside `try/finally`. On current `main` the `finally` is already there (`NativeBookingWizard.tsx`). What is still weak, and stays a UI task for the booking phase:

- `getCurrentPosition()` returns `null` on denial or failure and the wizard shows no error.
- `getCurrentPositionAsync` has no timeout, so a stuck permission or GPS fix can leave «در حال دریافت موقعیت...» up.
- The loading UI is inline text plus a small spinner on the same row, not a calm status block.

Do not change location or submit logic when that screen is restyled. Show a clear loading label and, when coordinates are null, an error the user can dismiss and retry, with manual address entry still available.

### 3. My Orders

`OrdersScreen` is the strongest native screen: filters, search, stats, cards, empty state. It still uses the sky/slate kit, a tiny refresh icon, and its own empty/loading styles. The empty state is useful and should be re-skinned with the shared `EmptyState`, not rewritten.

### 4. Order details

`OrderDetailModal` is a long bottom sheet: timeline, invoice, rating, cancel. Dense, mixed sky and amber, easy to lose the primary action. Later phase: one summary header, status, then invoice, with the same buttons and type scale.

### 5. Profile

`NativeProfileScreen` stacks identity edit, loyalty, wallet, and addresses in one scroll with the same card chrome. The web `ProfileScreen` is a different CSS module. Phone and id are not consistently Persian-digit. Logout exists here, which is why the home shell can stop duplicating it as a primary action.

### 6. Addresses

`NativeAddressManagerModal` is a raw bottom sheet: stacked fields, little hierarchy, error as a red strip. Keyboard avoidance was fixed earlier (`93e46ad`) and must stay. Restyle with `TextField` and `ScreenHeader`; do not change save/default/delete behavior.

### 7. Support

`NativeSupportScreen` has FAQ, call, and a message composer. Functional and flat. FAQ chevrons are fine (vertical). Call and send should become the shared primary button. Copy and `SUPPORT_*` config stay.

### 8. Notifications

`NativeNotificationsScreen` is a title, a hint, and cards. No spinner while `GET /notifications` runs, so the empty sentence can flash. Unread state is a sky border. Dates use `toLocaleString('fa-IR')`. Later: shared loading/error/empty, unread as a teal edge, no API changes.

### 9. Worker

`NativeWorkerPortal` is a dark slate tool: available jobs vs my jobs, category chips, accept and complete. Empty boxes are icon + one line. Category chips only list «همه»، «نظافتچی منزل»، and «کارگر ساعتی» even though the type also has painter and sofa cleaner — a real filter gap to fix visually in the worker phase without changing accept/complete. Auth and onboarding (`WorkerAuthScreen`, `WorkerOnboardingScreen`) are separate dark forms. `alert()` on failed accept/complete should become the shared error state later, still calling the same endpoints.

## Phase plan

1. **Foundation + Customer Home** (this branch). Tokens, Vazirmatn, shared controls, customer home, customer tab shell.
2. **Booking wizard**, both native steps and the web wizard shell. Graceful GPS loading and null-result error UI. No change to `getCurrentPosition`, pricing, or submit.
3. **Orders list and order details.** Re-skin cards, filters, timeline, rating. Same hooks.
4. **Profile and addresses.** Same save and address APIs. Shared fields and sheets.
5. **Support and notifications.** Shared states. Same FAQ, call, and notification endpoints.
6. **Worker portal, auth chrome, and onboarding.** Same accept/complete flow. Restore the missing category chips in the UI. Leave `com.paksho.worker`, flavors, and entry bundling alone.
7. **Cleanup.** Point leftover sky/slate styles at tokens, including auth if it still feels like a different product. Do not force `I18nManager` until every `row-reverse` screen has moved.

## Phase 1 decisions

- New UI uses cream paper (`#FFFBF6`) and deep teal (`#0A5E56` / `#084842`). Legacy sky and slate stay on `colors.legacy`.
- Vazirmatn (OFL) loads through `@expo-google-fonts/vazirmatn`. If the font fails, text falls back to the system font and the app still opens.
- New components set `direction: 'rtl'` on themselves and use normal `row`, so the first child sits on the right. Old screens keep `row-reverse` until they migrate.
- Customer native landing is Home. رزرو opens the existing wizard. Order creation still jumps to سفارش‌ها. Logout still calls the same API.
- The old home’s unverified gift badge and 4.8 score are not carried over. Quick-select still does `setSelectedService` and then opens booking, as before.
