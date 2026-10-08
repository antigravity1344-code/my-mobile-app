import { describe, expect, it } from 'vitest';

import { expectedStartAtFromSelection, isValidJalaliDate, zonedWallTimeToUtcMs } from './expectedStartAt';
import { jalaliToGregorian } from './pricing';

describe('expectedStartAtFromSelection', () => {
  it('turns the selected Jalali day and slot start into UTC using Tehran time', () => {
    expect(expectedStartAtFromSelection('1405-07-16', '08:00')).toBe('2026-10-08T04:30:00.000Z');
    expect(expectedStartAtFromSelection('1405-07-16', '16:00')).toBe('2026-10-08T12:30:00.000Z');
  });

  it('accepts Persian digits as produced by the booking forms', () => {
    expect(expectedStartAtFromSelection('۱۴۰۵-۰۷-۱۶', '۱۴:۰۰')).toBe('2026-10-08T10:30:00.000Z');
  });

  it('handles the year boundary around Nowruz', () => {
    expect(expectedStartAtFromSelection('1405-01-01', '10:00')).toBe('2026-03-21T06:30:00.000Z');
    expect(expectedStartAtFromSelection('1404-12-29', '10:00')).toBe('2026-03-20T06:30:00.000Z');
  });

  it('accepts a Gregorian date string as a fallback', () => {
    expect(expectedStartAtFromSelection('2026-10-08', '08:00')).toBe('2026-10-08T04:30:00.000Z');
  });

  it('uses the time zone data instead of a fixed offset', () => {
    expect(expectedStartAtFromSelection('1405-07-16', '08:00', 'UTC')).toBe('2026-10-08T08:00:00.000Z');
    // Tehran used daylight saving time before 2022; the zone data must reflect that.
    expect(expectedStartAtFromSelection('1400-03-01', '08:00')).toBe('2021-05-22T03:30:00.000Z');
  });

  it('returns null for missing or invalid input', () => {
    const bad: Array<[string | null | undefined, string | null | undefined]> = [
      [undefined, '08:00'],
      ['1405-07-16', undefined],
      [null, null],
      ['', '08:00'],
      ['امروز', '08:00'],
      ['1405-13-01', '08:00'],
      ['1405-07-31', '08:00'],
      ['1405-00-10', '08:00'],
      ['2026-02-30', '08:00'],
      ['1405-07-16', '25:00'],
      ['1405-07-16', '8'],
      ['1405-07-16', 'صبح زود'],
    ];
    for (const [date, time] of bad) {
      expect(expectedStartAtFromSelection(date, time)).toBeNull();
    }
    expect(zonedWallTimeToUtcMs(2026, 10, 8, 8, 0, 'Not/A_Zone')).toBeNull();
  });
});

describe('Jalali month lengths and leap years', () => {
  it('accepts Esfand 30 only in real leap years', () => {
    expect(expectedStartAtFromSelection('1403-12-30', '08:00')).toBe('2025-03-20T04:30:00.000Z');
    expect(expectedStartAtFromSelection('1404-12-30', '08:00')).toBeNull();
    expect(expectedStartAtFromSelection('1405-12-30', '08:00')).toBeNull();
    expect(expectedStartAtFromSelection('1408-12-30', '08:00')).toBe('2030-03-20T04:30:00.000Z');
    expect(expectedStartAtFromSelection('1404-12-29', '08:00')).toBe('2026-03-20T04:30:00.000Z');
  });

  it('checks month-length edges', () => {
    expect(expectedStartAtFromSelection('1405-06-31', '08:00')).toBe('2026-09-22T04:30:00.000Z');
    expect(expectedStartAtFromSelection('1405-07-31', '08:00')).toBeNull();
    expect(expectedStartAtFromSelection('1405-11-30', '08:00')).not.toBeNull();
    expect(expectedStartAtFromSelection('1405-12-31', '08:00')).toBeNull();
    expect(expectedStartAtFromSelection('1405-07-00', '08:00')).toBeNull();
  });

  it('agrees with the Intl Persian calendar on which years have Esfand 30', () => {
    const formatter = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    for (let year = 1395; year <= 1415; year += 1) {
      const [gy, gm, gd] = jalaliToGregorian(year, 12, 29);
      const parts = formatter.formatToParts(new Date(Date.UTC(gy, gm - 1, gd + 1)));
      const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
      const intlLeap = part('month') === 12 && part('day') === 30;
      expect(isValidJalaliDate(year, 12, 30)).toBe(intlLeap);
      expect(expectedStartAtFromSelection(`${year}-12-30`, '08:00') !== null).toBe(intlLeap);
    }
  });
});

describe('jalaliToGregorian', () => {
  it('matches the Intl Persian calendar for every day from 2020 to 2032', () => {
    const formatter = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const start = Date.UTC(2020, 0, 1);
    const end = Date.UTC(2032, 11, 31);
    for (let ms = start; ms <= end; ms += 24 * 60 * 60 * 1000) {
      const parts = formatter.formatToParts(new Date(ms));
      const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
      const date = new Date(ms);
      expect(jalaliToGregorian(part('year'), part('month'), part('day'))).toEqual([
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
      ]);
    }
  });
});
