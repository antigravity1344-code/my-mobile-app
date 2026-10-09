import { JALALI_MONTH_NAMES, toPersianDigits } from './jalaliDateOptions';
import { ORDER_TIME_ZONE } from './expectedStartAt';
import { gregorianToJalali } from './pricing';

/** Tehran has had no daylight saving time since 1401 (2022); used only if Intl time zones fail. */
const TEHRAN_FIXED_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Gregorian wall-clock parts of an instant in Tehran. Uses Intl time-zone data (Gregorian, en-US). */
export function tehranWallParts(instantMs: number): WallParts {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ORDER_TIME_ZONE,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(instantMs));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
    const wall = {
      year: part('year'),
      month: part('month'),
      day: part('day'),
      hour: part('hour') % 24,
      minute: part('minute'),
    };
    if (Object.values(wall).every(Number.isFinite) && wall.year > 1900 && wall.month >= 1 && wall.day >= 1) {
      return wall;
    }
  } catch {
    // fall through to the fixed offset
  }
  const shifted = new Date(instantMs + TEHRAN_FIXED_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/**
 * Shamsi (Jalali) display of a timestamp in Tehran time, without the Intl Persian calendar
 * (unreliable on Hermes). Example: '۱۷ مهر ۱۴۰۵' or, with time, '۱۷ مهر ۱۴۰۵، ۰۴:۱۰'.
 * Returns '' for missing or invalid input.
 */
export function formatJalaliDateTime(
  value: string | number | Date | null | undefined,
  options: { withTime?: boolean } = {},
): string {
  if (value === null || value === undefined || value === '') return '';
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ms)) return '';
  const wall = tehranWallParts(ms);
  const [jy, jm, jd] = gregorianToJalali(wall.year, wall.month, wall.day);
  const date = `${toPersianDigits(jd)} ${JALALI_MONTH_NAMES[jm - 1]} ${toPersianDigits(jy)}`;
  if (!options.withTime) return date;
  const time = `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`;
  return `${date}، ${toPersianDigits(time)}`;
}
