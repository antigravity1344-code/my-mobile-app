ROLE: MAIN_CODEX
AGENT_ID: CODEX-MANAGER
TASK_ID: PAKSHO-AGENT-MANAGER-ARCH-001
TASK_COMMENT_ID: 6123734979
STATUS: DESIGN_REPORTED / IMPLEMENTATION_NEXT

## طرح نسخه اول — پیش از کدنویسی

منابع مستقیم: دستور 6123734979، پروتکل 6123403231، سند تحویل docs/project-handoff-20261012@84b51e3، PR9@8ac99c5 و PR10@ef061cc. گزارش 6123827150 پایان مأموریت قبلی را ثبت کرده است. طرح و ساخت حاضر مستقل‌اند و آزمون ترکیبی قدیمی را اجرا نمی‌کنند.

### اجزا و مرجع وضعیت
- GitHub Issue/Comment ورودی مأموریت تأییدشده و محل نمایش گزارش است؛ متن نظر یا نام نویسنده مشترک به‌تنهایی هویت/مجوز معتبر نیست. task-id، repository، comment-id، تأیید مالک و نقش باید در درگاه مورد اعتماد بررسی شوند.
- هسته مستقل Node.js 24 + node:sqlite، بدون dependency یا اتصال خارجی، در tools/pakshoo-agent-manager. SQLite تازه و جدا از DB اپ مرجع معتبر نمونه اولیه است؛ نظر GitHub نمای گزارش است، نه قفل.
- ثبت تعریف مأموریت immutable با task-id یکتا؛ تکرار همان تعریف بدون اجرای جدید، اختلاف تعریف با همان شناسه خطا. وابستگی‌ها فقط به مأموریت موجود؛ از این راه حلقه وابستگی ایجاد نمی‌شود.
- claim در BEGIN IMMEDIATE؛ مالک شامل agent-id و run-id است. lease/heartbeat، epoch افزایشی برای fencing و revision برای تصمیم ناظر. هر نوشتن عامل باید مالک+epoch+مهلت معتبر داشته باشد. منابع مشترک نام‌دار (مثلاً شاخه) نیز در همان تراکنش قفل می‌شوند.
- ثبت رخداد append-only، نتیجه و outbox گزارش در همان تراکنش تغییر وضعیت. command-id یکتا + fingerprint از محتوای فرمان برای جلوگیری از تکرار. تکرار کلید با payload متفاوت رد می‌شود.
- منقضی شدن lease در CLAIMED/RUNNING اجازه claim جدید می‌دهد؛ اجرای قبلی اجازه heartbeat/گزارش/تکمیل ندارد. پس از crash، وضعیت و رخدادهای committed باقی می‌مانند؛ transaction ناقص rollback می‌شود.
- در REVIEW عامل حق تکمیل ندارد؛ قفل منبع تا تصمیم ناظر باقی می‌ماند. COMPLETED فقط با تصمیم ناظر و revision فعلی؛ BLOCKED/FAILED قابل بازگشایی صریح ناظر هستند. COMPLETED خودکار یا با claim دوباره اجرا نمی‌شود.

### مدل وضعیت و حدود
NEW → CLAIMED → RUNNING → REVIEW → COMPLETED.
عاملِ دارای lease می‌تواند BLOCKED/FAILED گزارش کند؛ ناظر می‌تواند با revision صحیح توقف دهد. بازگشت BLOCKED/FAILED به NEW فقط با دلیل و تصمیم صریح ناظر. تغییر RUNNING منقضی به CLAIMED رخداد بازیابی دارد.
مجوزهای نمونه محدود به READ_REPO، WRITE_ISOLATED_BRANCH، REPORT؛ merge/delete/deploy/force-push/financial/production پذیرفته نمی‌شوند. این allowlist کنترل هسته است، نه sandbox سیستم‌عامل؛ launcher واقعی آینده باید آن را با دسترسی محدود enforce کند.
گزارش: task-id، role، agent/run، status، revision/epoch، source comment، base SHA، evidence/test results، محدودیت‌ها. outbox تحویل شبیه‌سازی‌شده است؛ درگاه واقعی GitHub در این نسخه نصب نمی‌شود. exactly-once برای effects خارجی ادعا نمی‌شود؛ مرحله ارسال/receipt پس از crash ممکن است at-least-once باشد و marker گزارش نیاز به reconcile دارد.

### گزینه‌های راه‌اندازی
| گزینه | مرجع معتبر و مزیت | محدودیت |
|---|---|---|
| Actions فقط | شاخه اختصاصی state با CAS روی ref؛ concurrency کمک تکمیلی | کامنت/label قفل اتمی نیست؛ DB محلی runner بین اجراها کافی نیست؛ heartbeatها commit فراوان می‌سازند؛ outbox/reconcile لازم |
| Actions + state service | DB تراکنشی مشترک و CAS/lease؛ runner فقط مجری | انتخاب پیشنهادی برای چند runner؛ service/auth/backup تازه نیازمند مجوز مستقل |
| سرویس مستقل | dispatcher/DB/heartbeat و بازیابی متمرکز | هزینه و نگهداری دائم؛ احراز هویت و دسترسی محدود باید ساخته شوند |
نسخه حاضر فقط هسته تک‌میزبان SQLite و simulator است؛ SQLite روی network filesystem یا چند runner مستقل توصیه/آزمایش نشده است.

Codex headless در Actions با official openai/codex-action قابل طراحی است؛ README رسمی API key از secret را پیش‌نیاز می‌داند: https://github.com/openai/codex-action . هیچ کلید/secret/workflow جدیدی در این مأموریت ساخته نمی‌شود. اتصال فعلی GitHub، امکان اجرای خودکار یا دسترسی API مدل را اثبات نمی‌کند.
راه‌اندازی/ادامه خودکار همین گفت‌وگوی ChatGPT UX/UI توسط این ابزارها اثبات نشده؛ درگاه مستقل API عامل UX جای این گفت‌وگو نیست. تا آزمون رسمی، تحویل UX/UI دستی با P1 می‌ماند. هیچ browser/session automation برای دورزدن این مرز ساخته نمی‌شود.
GitHub concurrency قفل business-state نیست. طبق مستندات فعلی queue:max امکان صف بیشتر دارد اما به‌تنهایی جای ضدتکرار/lease نیست: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency .

### برآورد (فرض بودجه، نه قیمت جاری یا وعده مصرف)
نمونه بدون تماس مدل: صفر توکن و صفر سرویس خریداری‌شده. برای 100 مأموریت/ماه × 10 دقیقه: 1000 دقیقه runner؛ هزینه runner = دقیقه billable × تعرفه جاری حساب، پس از سهمیه. سرویس state کوچک: بودجه فرضی 5–20 دلار/ماه؛ سرویس مستقل 10–40 دلار/ماه، بدون نگهداری/مدل.
اگر هر مأموریت 50k ورودی + 10k خروجی داشته باشد: 5M ورودی + 1M خروجی/ماه. هزینه مدل = 5×P_in + 1×P_out، با P قیمت هر میلیون توکن مدل انتخابی. مثال صرفاً حسابی P_in=2 و P_out=10 ⇒ 20 دلار/ماه؛ retry/reasoning/context می‌تواند بیشتر کند. قیمت مدل، سهمیه Actions و workload واقعی قبل فعال‌سازی مستقل بررسی شوند. هسته deterministic برای heartbeat/report مدل مصرف نمی‌کند.

### آزمون امکان‌سنجی و تصمیم‌های باز
ابتدا بدون credential: واحد، duplicate/conflict، دو process روی یک task و دو task با منبع مشترک، heartbeat/expiry/fencing، crash قبل commit و بعد claim، dependency/review/retry، rollback ساعت، outbox و منع actions حساس.
بعداً فقط با مجوز مستقل: trigger معتبر از workflow_dispatch/issue_comment، اعتبارسنجی allowlist و task/comment/owner approval، runner disposable، مدل آزمایشی با سقف هزینه، ارسال/بازیابی گزارش با marker، قطع runner و بازیابی؛ نه اپ واقعی. UX/UI نیاز به endpoint/lifecycle رسمی و اثبات جدا دارد.
تصمیم باز: service/provider و احراز هویت فردی ناظر، budget، TTL عملیاتی، policy retry، shared resource naming، backup/HA، امکان API گفتگو. TTLهای demo سیاست عملیاتی نیستند.
ساخت فقط شاخه feature/pakshoo-agent-manager از febe14ee؛ فقط مسیر tools/pakshoo-agent-manager. هیچ تغییر app/CI/شاخه مرجع/PR heads، ادغام یا استقرار.

