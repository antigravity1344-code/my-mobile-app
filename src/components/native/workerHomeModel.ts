import { gregorianToJalali } from '../../utils/pricing';
import { toPersianDigits } from '../../utils/jalaliDateOptions';
import { isActiveWorkerJob, type WorkerOrderStatus } from './workerOrderStatus';

/** منطق خالص خانهٔ متخصص (بدون React Native تا قابل تست باشد). */

export const WORKER_HOME_FALLBACK_GREETING = 'سلام، متخصص عزیز!';
export const WORKER_PRICE_UNKNOWN = 'مبلغ نهایی هنوز مشخص نشده';
/** نماد «هنوز معلوم نیست»؛ هیچ‌وقت به‌جای عدد ۰ ناشناخته نمایش داده نمی‌شود. */
export const WORKER_STAT_PLACEHOLDER = '—';
/** برچسب روزهای هفته از شنبه. */
export const WORKER_WEEKDAY_LABELS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

export function workerGreeting(name: string | null | undefined): string {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  return first ? `سلام، ${first} عزیز!` : WORKER_HOME_FALLBACK_GREETING;
}

/** عدد آمار یا «—» وقتی هنوز نرسیده یا خطا دارد. */
export function workerStatText(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? toPersianDigits(value) : WORKER_STAT_PLACEHOLDER;
}

/** نشان روی تب سفارش‌ها: پنهان برای ۰ یا نامعلوم، «۹۹+» برای بیشتر از ۹۹. */
export function workerTabBadge(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? `${toPersianDigits(99)}+` : toPersianDigits(count);
}

/**
 * خدمت‌هایی که قیمت ثابت و معلوم دارند (D-70): فقط نظافت راه‌پله و مشاعات.
 * نظافت منزل و اداره ساعتی‌اند و مبلغشان نهایی نیست؛ خدمت ناشناخته هم نهایی حساب نمی‌شود.
 */
export const WORKER_FIXED_PRICE_SERVICE_IDS: readonly string[] = ['staircase_common_areas'];

/**
 * خط مبلغ کارت سفارش در خانهٔ متخصص (D-70). نوع خدمت از کلید serviceId سرور تشخیص داده می‌شود، نه از متن عنوان.
 * فقط برای خدمت با قیمت ثابت و مبلغ معتبر مثبت، مبلغ ثبت‌شده نمایش داده می‌شود.
 */
export function workerPriceLine(
  serviceId: string | null | undefined,
  rawPrice: number | null | undefined,
  format: (amount: number) => string,
): string {
  if (!serviceId || !WORKER_FIXED_PRICE_SERVICE_IDS.includes(serviceId)) return WORKER_PRICE_UNKNOWN;
  if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice <= 0) return WORKER_PRICE_UNKNOWN;
  return `مبلغ سفارش: ${format(rawPrice)}`;
}

const toLatin = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export type JalaliDay = [number, number, number];

/** تاریخ سفارش (شمسی یا میلادی، با ارقام فارسی یا لاتین) به روز شمسی؛ نامعتبر = null. */
export function parseOrderDay(raw: string | null | undefined): JalaliDay | null {
  const m = toLatin((raw || '').trim()).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y < 1700 ? [y, mo, d] : gregorianToJalali(y, mo, d);
}

export function jalaliDayOf(date: Date): JalaliDay {
  return gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

const sameDay = (a: JalaliDay, b: JalaliDay) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** «امروز، ساعت ۱۴:۰۰» / «فردا، …» / «۱۴۰۵/۰۸/۱۰، …»؛ بدون داده چیزی ساخته نمی‌شود. */
export function workerOrderTimeLabel(rawDate: string, rawTime: string, now: Date = new Date()): string {
  const day = parseOrderDay(rawDate);
  const today = jalaliDayOf(now);
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let dayText = '';
  if (day && sameDay(day, today)) dayText = 'امروز';
  else if (day && sameDay(day, jalaliDayOf(tomorrowDate))) dayText = 'فردا';
  else if ((rawDate || '').trim()) dayText = toPersianDigits(rawDate.trim());
  const t = toLatin((rawTime || '').trim()).match(/^(\d{1,2}):(\d{2})/);
  const timeText = t ? `ساعت ${toPersianDigits(`${t[1].padStart(2, '0')}:${t[2]}`)}` : '';
  return [dayText, timeText].filter(Boolean).join('، ');
}

/** کارهای امروزِ همین متخصص: کار فعال یا انجام‌شده با تاریخ امروز. */
export function workerTodayJobsCount(
  mine: ReadonlyArray<{ status: WorkerOrderStatus; rawDate: string }>,
  now: Date = new Date(),
): number {
  const today = jalaliDayOf(now);
  return mine.filter((o) => {
    if (!(isActiveWorkerJob(o.status) || o.status === 'COMPLETED')) return false;
    const day = parseOrderDay(o.rawDate);
    return !!day && sameDay(day, today);
  }).length;
}

/**
 * درآمد هفتگی فقط از دادهٔ واقعی تسویه ساخته می‌شود. سیاست تسویهٔ متخصص هنوز تعیین نشده
 * و سرور مبلغ قابل پرداخت به متخصص را نمی‌فرستد؛ پس فعلاً همیشه «در دسترس نیست».
 * مبلغ ناخالص سفارش درآمد متخصص نیست و برای تخمین استفاده نمی‌شود.
 */
export function workerWeeklyIncome(): { available: false } {
  return { available: false };
}
