import { jalaliToGregorian } from './pricing';

/** منطقه زمانی مبنای زمان سفارش (D-50). */
export const ORDER_TIME_ZONE = 'Asia/Tehran';

const toLatinDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

/**
 * اعتبار تاریخ شمسی با همان تبدیل موجود jalaliToGregorian: روز ۳۰ اسفند فقط وقتی معتبر است که
 * با اول فروردین سال بعد یکی نشود (سال کبیسه).
 */
export function isValidJalaliDate(year: number, month: number, day: number): boolean {
  if (![year, month, day].every(Number.isInteger)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  if (month <= 6) return day <= 31;
  if (month <= 11) return day <= 30;
  if (day <= 29) return true;
  if (day > 30) return false;
  const esfand30 = jalaliToGregorian(year, 12, 30);
  const nextNowruz = jalaliToGregorian(year + 1, 1, 1);
  return esfand30.join('-') !== nextNowruz.join('-');
}

const DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** اختلاف ساعت محلی منطقه با UTC در یک لحظه، بر اساس داده منطقه زمانی Intl (بدون عدد ثابت). */
function zoneOffsetMs(instantMs: number, formatter: Intl.DateTimeFormat): number {
  const parts = formatter.formatToParts(new Date(instantMs));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  const wallAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour') % 24,
    part('minute'),
    part('second'),
  );
  return wallAsUtc - instantMs;
}

/** ساعت دیواری یک منطقه زمانی را به لحظه UTC تبدیل می‌کند؛ اگر Intl منطقه را نشناسد null برمی‌گرداند. */
export function zonedWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = ORDER_TIME_ZONE,
): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    const firstGuess = wallAsUtc - zoneOffsetMs(wallAsUtc, formatter);
    const result = wallAsUtc - zoneOffsetMs(firstGuess, formatter);
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * زمان مورد انتظار ساختاریافته سفارش: شروع بازه انتخاب‌شده، به وقت تهران، به‌صورت UTC ISO.
 * dateString شمسی (مثل خروجی فرم سفارش) یا میلادی است؛ startTime به شکل HH:MM. مقدار نامعتبر null می‌دهد.
 */
export function expectedStartAtFromSelection(
  dateString: string | null | undefined,
  startTime: string | null | undefined,
  timeZone: string = ORDER_TIME_ZONE,
): string | null {
  if (typeof dateString !== 'string' || typeof startTime !== 'string') return null;
  const dateMatch = DATE_PATTERN.exec(toLatinDigits(dateString.trim()));
  const timeMatch = TIME_PATTERN.exec(toLatinDigits(startTime.trim()));
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hour, minute] = [Number(timeMatch[1]), Number(timeMatch[2])];
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;

  let gregorian: [number, number, number];
  if (year >= 1200 && year < 1600) {
    if (!isValidJalaliDate(year, month, day)) return null;
    gregorian = jalaliToGregorian(year, month, day);
  } else {
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    gregorian = [year, month, day];
  }

  const utcMs = zonedWallTimeToUtcMs(gregorian[0], gregorian[1], gregorian[2], hour, minute, timeZone);
  return utcMs == null ? null : new Date(utcMs).toISOString();
}
