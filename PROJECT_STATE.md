# PROJECT_STATE — پاکشو / cleaning-mobile

**آخرین به‌روزرسانی:** 2026-09-21 حدود ۰۲:۳۵ (Asia/Tehran)  
**نقطه تحویل امن:** پس از Completion — آماده توقف / انتقال به چت یا مدل بعدی  
**Repo:** `antigravity1344-code/my-mobile-app`  
**Branch:** `say_hello`  
**HEAD تأییدشده:** `490f9a6` — `feat(orders): ACCEPTED to COMPLETED via complete endpoint`  
**مسیر کاری محلی:** `C:\app` (ماشین `DESKTOP-TI55VSP`)  
**Package مشتری:** `com.paksho.customer`

---

## ۱) هدف پروژه

اپ موبایل Expo/RN چندطعمه‌ای (Customer / Worker) + بک‌اند Express محلی (`server/index.js` + `db.json`) برای سفارش نظافت منزل («پاکشو»):

- مشتری: ثبت سفارش واقعی بدون پیش‌پرداخت → لیست سفارش‌ها
- متخصص: دیدن سفارش‌های PENDING، accept، سپس complete
- ادمین: آمار، تایید متخصص، مشاهده سفارش‌ها، امکان complete از پنل React

---

## ۲) معماری خلاصه

| لایه | مسیر / نکته |
|------|-------------|
| Customer native | `NativeCustomerApp`, `NativeBookingWizard`, Orders / Profile / Support |
| Worker native | `NativeWorkerPortal` — available + my jobs + accept/complete |
| Specialist web | `SpecialistPortalScreen` — API available/accept/complete |
| Admin React | `AdminPanelScreen` — stats/users/orders + complete |
| Admin HTML | `GET /admin` داخل `server/index.js` (عمدتاً خواندنی) |
| API client | `src/api/apiClient.ts` — **دست نزن مگر صریحاً خواسته شود** |
| Storage | `appStorage`؛ کلیدهای کاربر مثل `PAKSHO_USER_CUSTOMER` / `PAKSHO_USER_WORKER` |
| Flavors | `assembleCustomerDebug` / workerDebug؛ اسکریپت‌ها در `package.json` |

**چرخه سفارش سمت سرور (واقعی):**

```
PENDING ──accept──► ACCEPTED (+ cleanerId/Name/Avatar)
                         │
                         └──complete──► COMPLETED (+ completedAt)
```

- بدون `IN_PROGRESS` اجباری
- `CONFIRMED` / `ASSIGNED` فقط legacy فرانت / mock آفلاین

---

## ۳) آخرین commitهای مهم (`say_hello`)

| SHA کوتاه | پیام |
|-----------|------|
| **`490f9a6`** | Completion: `PUT .../complete` + UI Worker/Specialist/Admin |
| **`3b29b99`** | NativeWorker: map درست `ACCEPTED` (قبلاً اشتباه COMPLETED می‌شد) |
| **`9fbb02f`** | توقف seed دموی `INITIAL_MOCK_ORDERS` وقتی API موفق؛ اضافه شدن `ACCEPTED` به type/badge |
| **`d50bf9d`** | SpecialistPortal بدون mock → API available/accept |
| **`f41e049`** | وب BookingWizard بدون پیش‌پرداخت → PENDING |
| `dac8939` | پاک کردن demo `DEFAULT_ADDRESS` |
| `dddb955` / `94010ce` | آدرس ذخیره‌شده در wizard + prefill پروفایل |
| `5d3a683` | CTA موفقیت سفارش؛ حذف PaymentReceipt بلااستفاده |
| `4a2daf5` | Support بومی (FAQ/تماس/پیام محلی) |
| `98ad87c` | پروفایل + آدرس‌های ذخیره‌شده بومی |
| `93e46ad` | کیبورد روی مرحله آدرس |
| `8c0eb81` | P0: بدون پیش‌پرداخت + صفحه Orders |
| `7e32255` | هویت واقعی مشتری برای orders |

---

## ۴) وضعیت Customer

**انجام‌شده**

- OTP / لاگین، هویت واقعی (`PAKSHO_USER_CUSTOMER`)
- ویزارد رزرو بومی بدون درگاه پیش‌پرداخت → `POST /api/orders` / `addNewOrder` → `PENDING`
- صفحه سفارش‌های من (API با `userId` + role CUSTOMER)
- پروفایل + آدرس‌های ذخیره‌شده + استفاده در مرحله آدرس
- Support (FAQ، تماس، پیام محلی per-user)
- UX کیبورد آدرس، CTA موفقیت
- ویزارد وب هم‌تراز بدون پیش‌پرداخت (`f41e049`)

**شکاف**

- لغو مشتری فقط روی memory محلی (`orderService.cancelOrder`) — با سرور sync نیست
- Payment بعد از خدمت / settlement هنوز نیست
- تست فیزیکی اندروید معوق (ADB اینترنت PC را می‌اندازد)

---

## ۵) وضعیت Worker / Specialist

**انجام‌شده**

- `NativeWorkerPortal`: `GET /orders/available`, accept, لیست کارهای من, **اتمام کار** → complete
- `SpecialistPortalScreen`: همان APIها + بخش «کارهای فعال من» + اتمام
- Accept فقط برای worker با وضعیت `APPROVED`/`ACTIVE`
- Complete فقط توسط همان `cleanerId` پذیرنده و فقط از `ACCEPTED`

**شکاف**

- Worker حق لغو ندارد (قانون محصول؛ درست است)
- تخصیص دستی ادمین از UI هنوز نیست (API PUT با `cleanerId` هست)

---

## ۶) وضعیت Admin

**انجام‌شده**

- `AdminPanelScreen`: stats، لیست سفارش‌ها، تایید/مسدود متخصص، **اتمام سفارش** (`PUT /admin/orders` + `COMPLETED`)
- `/admin` HTML: لیست/آمار (عمدتاً نمایش)
- API: `PUT/DELETE /api/admin/orders/:id` — DELETE = حذف فیزیکی رکورد

**شکاف**

- UI ادمین دکمه لغو/حذف سفارش ندارد
- DELETE با مدل soft-cancel فرانت یکی نیست
- «درآمد کل» = جمع `price` همه سفارش‌ها (نه تسویه واقعی)

---

## ۷) APIهای موجود (خلاصه)

| Method | Path | نقش |
|--------|------|-----|
| POST | `/api/auth/send-otp`, `/api/auth/verify-otp` | ورود |
| PUT | `/api/users/customer-profile`, `/api/users/worker-onboarding` | پروفایل |
| POST | `/api/orders` | ایجاد → PENDING |
| GET | `/api/orders?userId&role=` | لیست مشتری/کارگر |
| GET | `/api/orders/available` | فقط PENDING |
| PUT | `/api/orders/:orderId/accept` | → ACCEPTED + cleaner* |
| PUT | `/api/orders/:orderId/complete` | → COMPLETED + completedAt |
| GET | `/api/admin/stats`, `/users`, `/orders` | ادمین |
| PUT | `/api/admin/users/:id/status`, `/approve-worker/:id` | تایید متخصص |
| PUT | `/api/admin/orders/:id` | status آزاد / cleaner؛ COMPLETED → completedAt |
| DELETE | `/api/admin/orders/:id` | حذف رکورد («لغو» لفظی) |
| GET | `/admin` | داشبورد HTML |

مدل سفارش سرور (فعلی):  
`id, customer*, serviceTitle, address, date, time, price, notes, status, cleaner*, createdAt, completedAt?`  
— بدون `cancelledAt` / `cancelledBy` / `cancelReason` / `paymentStatus` سمت سرور.

---

## ۸) کارهای باقی‌مانده (اولویت پیشنهادی)

1. **Cancel پایدار (تحلیل شروع شده، پیاده نشده)**  
   - پیشنهاد جهت‌گیری: soft cancel با `status=CANCELLED` + فیلدهای `cancelledAt` / `cancelledBy` / `cancelReason`؛ DELETE ادمین فقط برای موارد خاص  
   - قوانین پیشنهادی: قبل از accept آسان‌تر؛ بعد از accept با قید؛ بعد از complete ممنوع (جز اصلاح ادمین)
2. **Payment / Settlement** بعد از COMPLETED  
3. **Admin UI** برای cancel و/یا تخصیص دستی cleaner  
4. **تست دستگاه** وقتی کاربر صریحاً ADB را مجاز کند  
5. **UI polish**

---

## ۹) قوانین مهم توسعه (حتماً رعایت شود)

- Branch کار: `say_hello`؛ commitهای کوچک و مرتبط؛ push به `origin/say_hello`
- حلقه: کد → (در صورت نیاز) `assembleCustomerDebug` → commit → push → گزارش (fence + `.md`)
- **بدون ADB / نصب APK / وصل گوشی** مگر درخواست صریح همان نوبت (ADB اینترنت PC را قطع می‌کند)
- **دست نزن:** `apiClient.ts`، فایل‌های موقت `fix*.js` / `replace.js` / `test.js`، لاگ‌های `.expo`، مگر صریحاً خواسته شود
- **بدون mock جدید**؛ `INITIAL_MOCK_ORDERS` فقط fallback آفلاین وقتی API fail و کش خالی — عمداً نگه داشته شده
- گزارش‌ها به فارسی؛ ترجیح کاربر: کد فنس + فایل `.md` پیوست
- تغییرات محدود و قابل‌توضیح؛ تمیزکاری کورکورانه status/legacy ممنوع

---

## ۱۰) Dirty tree محلی (معمولاً commit نشود)

روی `C:\app` اغلب این‌ها کثیف/untracked می‌مانند و نباید وارد commit نقطه تحویل شوند مگر تصمیم جدا:

- `src/api/apiClient.ts`, `index.ts`, `.expo/...`
- `fix*.js`, `replace.js`, `test.js`, `server/db.json`

---

## ۱۱) خلاصه یک‌خطی برای چت بعدی

> پاکشو روی `say_hello` @ `490f9a6`: مشتری ثبت PENDING بدون پیش‌پرداخت؛ متخصص accept→complete؛ ادمین complete؛ بعدی Cancel پایدار (soft CANCELLED)؛ بدون ADB/apiClient/mock جدید.

