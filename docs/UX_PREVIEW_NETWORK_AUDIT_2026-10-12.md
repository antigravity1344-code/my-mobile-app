# ممیزی شبکه پیش‌نمایش پاکشو — ۱۴۰۵/۰۷/۲۰ (2026-10-12)

مخزن: `antigravity1344-code/my-mobile-app`، شاخه `ui/ux-ui-development`، درخواست ادغام #10.

## دامنه و روش
- گوشی Galaxy A06، چهار شناسه بسته هم‌زمان: `com.paksho.customer` (UID 10373)، `com.paksho.worker` (UID 10372)، `com.paksho.customer.uxpreview` (UID 10285) و `com.paksho.worker.uxpreview` (UID 10294).
- اتصال توسعه با `adb reverse --list`: فقط `tcp:8081 tcp:8081`، برای Metro پروژه مستقل.
- ثبت با `adb logcat -c` پیش از سناریو و سپس `adb logcat -d | Select-String 'PAKSHO_PREVIEW_NETWORK_AUDIT'`. برای جلوگیری از انتشار داده واقعی فقط نوع رویداد، روش درخواست و شمارنده در لاگ چاپ می‌شود؛ نه توکن، نشانی، بدنه یا پاسخ.
- قبل از اجرای صفحات، `beginPreview` گارد JS را فعال می‌کند و `previewApi` همه درخواست‌های مرکزی را به پاسخ ساختگی هدایت می‌کند. عملیات تغییردهنده پیش از هر پاسخ رد می‌شوند. تماس‌های مستقیم `fetch` و `XMLHttpRequest.open` به خارج از `localhost:8081` قبل از ارسال مسدود می‌شوند؛ در خروج، متدهای اصلی بازگردانده می‌شوند.
- جست‌وجوی کد `src` برای `fetch(`، `XMLHttpRequest`، `https?://` و `WebSocket` انجام شد. سه مسیر مستقیم در `apiClient`، `booking` و `payment` یافت شد که با محافظ پیش‌نمایش پوشانده شده‌اند. یک تصویر آواتار خارجی پیش‌فرض در `NativeWorkerApp` نیز یافت شد و منبع شبکه‌ای آن فقط در پیش‌نمایش غیرفعال گردید.

## شواهد لاگ مستقیم گوشی
**مشتری**، 12:47:19 تا 12:47:20:
```
12:47:19.956 [PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled
12:47:20.261 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 1
12:47:20.295 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 2
12:47:20.295 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 3
12:47:20.296 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 4
12:47:20.886 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 5
12:47:20.892 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 6
```

**متخصص**، 12:49:53 تا 12:50:54؛ بازکردن کارتابل و تلاش برای پذیرش سفارش:
```
12:49:53.579 [PAKSHO_PREVIEW_NETWORK_AUDIT] guard_enabled
12:49:54.137 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 1
12:49:54.140 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 2
12:50:49.537 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request PUT mocked_count 13
12:50:49.613 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 14
12:50:49.614 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 15
12:50:54.192 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 16
12:50:54.194 [PAKSHO_PREVIEW_NETWORK_AUDIT] mocked_request GET mocked_count 17
```
پس از لمس «پذیرش سفارش»، پیام «این عملیات در پیش‌نمایش غیرفعال است؛ داده‌ای ارسال نشد» در ساختار رابط Android ثبت شد. در این بازه `blocked_fetch` یا `blocked_xhr` رخ نداد، زیرا مسیرهای درخواست شناسایی‌شده اساساً با داده آزمایشی پاسخ گرفتند.

## آزمون منفی پوشش شبکه
`src/components/native/previewNetworkAudit.test.ts`:
1. درخواست `fetch` خارجی پیش از رسیدن به تابع شبکه رد شد.
2. `localhost:8081` مجاز و `localhost:3000` مسدود شد.
3. `XMLHttpRequest.open` خارجی در سطح نمونه اولیه مسدود شد.
در صورت پایان پیش‌نمایش، تابع شبکه اصلی بازیابی می‌شود. آزمون‌های قبلی جدا بودن حافظه، توکن و مسدود بودن رزرو، پرداخت و تغییر اطلاعات همچنان برقرارند.

## آزمون اتصال TCP اندروید و محدودیت انتساب
- `adb shell ss -tn state established` وجود چند اتصال `127.0.0.1:8081` را تأیید کرد؛ این‌ها با مسیر Metro سازگارند.
- در کنار آن اتصالات بیرونی با پورت 443 و پورت‌های دیگر نیز روی کل گوشی قابل مشاهده بودند. فرمان `ss` با پیام `Cannot open netlink socket: Permission denied` مواجه شد و **امکان انتساب مطمئن این اتصالات به UID اپ‌های پیش‌نمایش وجود نداشت**. بنابراین نمی‌توان گفت تمام ترافیک کل گوشی مربوط به Metro بوده است.
- با این سطح دسترسی، ضبط بسته‌ها با شناسه پردازش/برنامه و مقصد واقعی در سطح سیستم‌عامل کامل نیست. شواهد حاضر عدم عبور مسیرهای شناسایی‌شده React Native از شبکه واقعی و رد عملیات را تأیید می‌کنند، **نه نفی مطلق تمام ارتباطات احتمالی بومی در تمام زمان‌ها**.

## رفتار خروج متخصص
- دکمه داخلی خروج در حالت پیش‌نمایش اکنون از callback سطح اپ به `endPreview(); DevSettings.reload()` می‌رود. خروج واقعی در حالت معمول بدون تغییر است.
- آزمون تکراری روی Galaxy A06 در ساعت 12:43 با لمس خروج داخلی، صفحه «پاکشو — متخصص / ورود به پیش‌نمایش بدون پیامک / ورود واقعی با پیامک» را نمایش داد.
- لاگ همراه: `guard_enabled`، دو `mocked_request GET` و `guard_disabled mocked_count 2 blocked_count 0`.

## صفحه جزئیات متخصص
- کارتابل، کارت سفارش جدید، «کارهای من» و سوابق واقعی بررسی شدند. صفحه جزئیات مستقلِ قابل بازشدن با مسیر مشخص در این بازبینی تأیید نشد؛ هیچ صفحه جایگزینی ساخته نشده است.

## سیاست ادغام
درخواست #10 تا تصمیم ناظر فنی پیش‌نویس باقی بماند. هیچ تغییری در PR #9 یا شاخه `ui/customer-home-redesign` اعمال نشد.
