# پاکشو

مرجع ادامه توسعه ui/customer-home-redesign است؛ پیش‌فرض فعلی گیت‌هاب هنوز feature/orders.

**پیش از کار [سند تحویل پروژه](docs/PROJECT_HANDOFF.fa.md) را بخوانید.** این نسخه مستندات برای بازبینی است؛ انتشار آن، ادغام PR9، رفع PR10 یا آمادگی مالی نیست.

Node24 و lockfileها لازم‌اند:

~~~bash
npm ci
npm ci --prefix server
npm run typecheck
npm test -- --maxWorkers=2 --minWorkers=1
npm run lint
~~~

تست سرور، کلید رمزنگاری، Chromium و ورودی دو اپ در سند تحویل آمده است؛ روی DB/حساب واقعی تست نکنید. npm run web داشبورد قدیمی است. شاخه مستندات فقط README/docs دارد؛ ادغام/حذف/default نیازمند تأیید جداگانه‌اند.
