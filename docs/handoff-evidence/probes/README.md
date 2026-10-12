# probe مستقل؛ کد تولیدی نیست

txtها عین source/config شاهدند؛ در Vitest عادی اجرا نمی‌شوند. مسیر absolute به clone/گزارش original است؛ اصل/hash حفظ و برای بازآزمایی فقط path/config به ترکیب تازه تطبیق شود. fetch/AsyncStorage واقعی مجاز نیست.

۱۴ probe b86a351: ده موفق/چهار ناموفق. sentAuthorization=true، calls.read=1 و previewActive=false خام، تشخیص عارضه ناامن‌اند نه پذیرش اصلاح. بازبین آنها را مشاهده تشخیصی کند و معیار صفر شبکه/خواندن credential/read-write-delete پایدار را نگه دارد. وابستگی به flag یا ضعیف‌کردن حفاظت مجاز نیست. فعال/خروج/تأخیر/شکست reload/callback معوق/هر دو نقش پوشش داده شوند.

۱۰۳ فعال از apiFetch/orderService واقعی اجرا شدند؛ فقط platform/fetch/Expo حافظه‌ای‌اند. داده نمونه عملیاتی نیست؛ گوشی/mutation موفق واقعی ادعا نشده.
