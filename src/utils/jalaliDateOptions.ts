import type { JalaliDateOption } from '../types/booking';
import { gregorianToJalali } from './pricing';

const WEEKDAY_NAMES = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'] as const;

export const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const toPersianDigits = (value: number | string): string =>
  String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]!);

/**
 * گزینه‌های تاریخ شمسی برای فرم رزرو؛ فقط از تبدیل خالص میلادی→شمسی استفاده می‌کند
 * و به Intl تقویم پارسی وابسته نیست (Hermes روی برخی دستگاه‌ها year خالی برمی‌گرداند).
 */
export function buildJalaliDateOptions(fromDate: Date = new Date(), count = 35): JalaliDateOption[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(fromDate);
    date.setDate(fromDate.getDate() + index);
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return {
      dateString: `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`,
      dayOfWeek: WEEKDAY_NAMES[date.getDay()]!,
      dayOfMonth: jd,
      monthName: `${JALALI_MONTH_NAMES[jm - 1]} ${toPersianDigits(jy)}`,
      isToday: index === 0,
      isTomorrow: index === 1,
    };
  });
}
