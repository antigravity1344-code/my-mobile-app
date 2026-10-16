# تست پیش‌نمایش روی گوشی — بدون پیامک

**تصمیم مالک ۱۷ اکتبر ۲۰۲۶:** فعلاً فقط مسیر پیش‌نمایش PR10. ورود واقعی/OTP برای بعد.

**کد ترکیبی محلی:** شاخه `qa/pr9-pr12-pr10-local` — ثبت کامل `docs/PROJECT_RECORD_2026-10-17.fa.md`، HEAD هنگام آن ثبت `ee87986`. درخت ادغام اولیه `326117f` است و کامیت‌های بعدی (GPS، پیش‌نمایش وب، D-11، مدارک) روی همان شاخه آمده‌اند.

این دستور روی **رایانهٔ شما** اجرا می‌شود (این sandbox به ADB و Galaxy A06 وصل نیست). پوشهٔ ویندوز با ۴۷ فایل ثبت‌نشده را `reset`/`clean` نکنید؛ از یک کپی جدا استفاده کنید.

## ۰. کپی جدا، نه پوشهٔ اصلی ویندوز

```powershell
cd $env:USERPROFILE\Desktop
git clone https://github.com/antigravity1344-code/my-mobile-app.git paksho-qa-phone
cd paksho-qa-phone
git fetch origin fix/server-acceptance-005 ui/ux-ui-development
git checkout -b qa/pr9-pr12-pr10-local origin/fix/server-acceptance-005
git merge origin/ui/ux-ui-development --no-ff -m "qa(local): PR9+PR12+PR10"
```

اگر این محیط Arena را کپی می‌کنید، همان درخت `326117f` است.

```powershell
npm ci
```

برای پیش‌نمایش **سرور API لازم نیست**؛ شبکه باید بسته بماند.

## ۱. نصب یک‌بارهٔ نسخهٔ توسعه (اگر روی گوشی نیست)

USB debugging، سپس:

```powershell
adb devices
npm run android:customer
```

صبر کنید تا `com.paksho.customer` نصب شود. بعد:

```powershell
npm run android:worker
```

اگر قبلاً با همین SDK نصب شده، این دو را تکرار نکنید.

## ۲. Metro مشتری

```powershell
adb reverse tcp:8081 tcp:8081
$env:EXPO_PUBLIC_PAKSHO_UI_PREVIEW="1"
npx expo start --port 8081
```

اپ مشتری را باز کنید. باید دو دکمه ببینید:

- ورود به پیش‌نمایش بدون پیامک
- ورود واقعی با پیامک ← در این دور لمس نشود

## ۳. چک‌لیست مشتری (پیش‌نمایش)

- خانه، رزرو، پروفایل، پشتیبانی باز می‌شوند.
- فرم رزرو از خدمت به زمان می‌رود.
- سفارش نمونه و جزئیات (از جمله تکمیل‌شده) دیده می‌شود.
- خروج از پیش‌نمایش به صفحهٔ انتخاب ورود برمی‌گردد.

## ۴. Metro متخصص (بعد از بستن Metro مشتری، یا پورت جدا)

```powershell
adb reverse tcp:8081 tcp:8081
$env:EXPO_PUBLIC_PAKSHO_UI_PREVIEW="1"
npx expo start --port 8081
```

اپ `com.paksho.worker` را باز کنید → پیش‌نمایش بدون پیامک.

- کارتابل با سفارش جدید؛ نشانی دقیق قبل از پذیرش پنهان.
- «پذیرش سفارش» باید بگوید عملیات در پیش‌نمایش غیرفعال است؛ داده ارسال نشد.
- سناریوی پذیرفته‌شده: نشانی کامل و دکمه اتمام؛ اتمام هم باید رد شود نه موفقیت دروغین.
- خروج پیش‌نمایش به انتخاب ورود.

## ۵. ثبت نتیجه

برای هر نقش بنویسید: مدل گوشی، SHA (`git rev-parse HEAD`)، بله/خیر هر بند بالا، اسکرین یا لاگ Metro در صورت شکست.

ورود واقعی، سفارش مالی، ادغام GitHub و D-60 در این دور نیستند.
