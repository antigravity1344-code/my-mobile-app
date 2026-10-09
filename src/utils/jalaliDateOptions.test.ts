import { afterEach, describe, expect, it, vi } from 'vitest';

import { expectedStartAtFromSelection } from './expectedStartAt';
import { buildJalaliDateOptions } from './jalaliDateOptions';
import { getEarlyBirdDiscountRate, jalaliToGregorian } from './pricing';

/** همان منطق قدیمی makeDates که به formatToParts پارسی وابسته بود (برای اثبات باگ). */
function legacyMakeDatesFromIntl(fromDate: Date, count = 35) {
  const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const keyFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(fromDate);
    date.setDate(fromDate.getDate() + index);
    const parts = formatter.formatToParts(date);
    const keyParts = keyFormatter.formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const keyValue = (type: string) => keyParts.find((part) => part.type === type)?.value ?? '';
    return {
      dateString: `${keyValue('year')}-${keyValue('month')}-${keyValue('day')}`.replace(
        /[۰-۹]/g,
        (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)),
      ),
      dayOfWeek: days[date.getDay()]!,
      dayOfMonth: Number(
        value('day').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))),
      ),
      monthName: `${value('month')} ${value('year')}`,
      isToday: index === 0,
      isTomorrow: index === 1,
    };
  });
}

function stubEmptyPersianYear() {
  const RealDTF = Intl.DateTimeFormat;
  const Stub = function (
    this: unknown,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    const inner = new RealDTF(locales, options);
    const locale = typeof locales === 'string' ? locales : Array.isArray(locales) ? locales[0] : '';
    const usesPersian =
      typeof locale === 'string' && (locale.includes('persian') || locale.includes('fa-IR'));
    return {
      formatToParts(date: Date) {
        const parts = inner.formatToParts(date);
        if (!usesPersian) return parts;
        return parts.map((part) => (part.type === 'year' ? { ...part, value: '' } : part));
      },
      format(date: Date) {
        return inner.format(date);
      },
      resolvedOptions() {
        return inner.resolvedOptions();
      },
    };
  } as unknown as typeof Intl.DateTimeFormat;
  Stub.supportedLocalesOf = RealDTF.supportedLocalesOf.bind(RealDTF);
  vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: Stub });
  return () => {
    vi.unstubAllGlobals();
  };
}

describe('buildJalaliDateOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matches Node Intl output for 2026-11-10 (1405-08-19)', () => {
    const option = buildJalaliDateOptions(new Date(2026, 10, 10), 1)[0]!;
    expect(option.dateString).toBe('1405-08-19');
    expect(option.dayOfMonth).toBe(19);
    expect(option.monthName).toBe('آبان ۱۴۰۵');
    expect(option.isToday).toBe(true);
  });

  it('still yields a valid dateString when Intl persian year is empty (Hermes bug)', () => {
    stubEmptyPersianYear();
    const today = new Date(2026, 9, 9); // ۹ مهر ۱۴۰۵ / ۹ اکتبر ۲۰۲۶
    const options = buildJalaliDateOptions(today, 35);
    const target = options.find((item) => item.dateString === '1405-08-19');
    expect(target).toBeDefined();
    expect(target!.monthName).toBe('آبان ۱۴۰۵');

    const expectedStartAt = expectedStartAtFromSelection(target!.dateString, '08:00');
    expect(expectedStartAt).toBe('2026-11-10T04:30:00.000Z');
    expect(getEarlyBirdDiscountRate(target!.dateString, today)).toBe(0.1);
  });

  it('documents that the old Intl-based makeDates breaks when year is empty', () => {
    stubEmptyPersianYear();
    const legacy = legacyMakeDatesFromIntl(new Date(2026, 10, 10), 1)[0]!;
    expect(legacy.dateString).toBe('-08-19');
    expect(legacy.monthName).toBe('آبان ');
    expect(expectedStartAtFromSelection(legacy.dateString, '08:00')).toBeNull();
    expect(getEarlyBirdDiscountRate(legacy.dateString, new Date(2026, 9, 9))).toBe(0);
  });
});

describe('gregorianToJalali round-trip', () => {
  it('round-trips with jalaliToGregorian over a wide range including Esfand 30 leap years', async () => {
    const { gregorianToJalali } = await import('./pricing');
    const leapYears = [1403, 1408];
    for (const year of leapYears) {
      const g = jalaliToGregorian(year, 12, 30);
      expect(gregorianToJalali(...g)).toEqual([year, 12, 30]);
    }
    for (let year = 1390; year <= 1420; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const maxDay = month <= 6 ? 31 : month <= 11 ? 30 : 30;
        for (let day = 1; day <= maxDay; day += 1) {
          if (month === 12 && day === 30) {
            const esfand30 = jalaliToGregorian(year, 12, 30);
            const nextNowruz = jalaliToGregorian(year + 1, 1, 1);
            if (esfand30.join('-') === nextNowruz.join('-')) continue;
          }
          const g = jalaliToGregorian(year, month, day);
          expect(gregorianToJalali(...g)).toEqual([year, month, day]);
        }
      }
    }
    const start = Date.UTC(2020, 0, 1);
    const end = Date.UTC(2035, 11, 31);
    for (let ms = start; ms <= end; ms += 24 * 60 * 60 * 1000) {
      const date = new Date(ms);
      const gy = date.getUTCFullYear();
      const gm = date.getUTCMonth() + 1;
      const gd = date.getUTCDate();
      const j = gregorianToJalali(gy, gm, gd);
      expect(jalaliToGregorian(...j)).toEqual([gy, gm, gd]);
    }
  });
});
