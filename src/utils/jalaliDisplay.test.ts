import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatJalaliDateTime, tehranWallParts } from './jalaliDisplay';

describe('formatJalaliDateTime', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('formats a UTC timestamp as a Shamsi date in Tehran time', () => {
    expect(formatJalaliDateTime('2026-10-09T00:40:00.000Z')).toBe('۱۷ مهر ۱۴۰۵');
    expect(formatJalaliDateTime('2026-10-09T00:40:00.000Z', { withTime: true })).toBe('۱۷ مهر ۱۴۰۵، ۰۴:۱۰');
    expect(formatJalaliDateTime('2026-03-21T06:30:00.000Z')).toBe('۱ فروردین ۱۴۰۵');
    expect(formatJalaliDateTime('2025-03-20T04:30:00.000Z')).toBe('۳۰ اسفند ۱۴۰۳');
  });

  it('uses the Tehran calendar day around Tehran midnight, not the UTC day', () => {
    expect(formatJalaliDateTime('2026-10-08T20:29:00.000Z', { withTime: true })).toBe('۱۶ مهر ۱۴۰۵، ۲۳:۵۹');
    expect(formatJalaliDateTime('2026-10-08T20:30:00.000Z', { withTime: true })).toBe('۱۷ مهر ۱۴۰۵، ۰۰:۰۰');
  });

  it('returns an empty string for missing or invalid input', () => {
    for (const bad of [undefined, null, '', 'not a date', '2026-13-45T99:00:00Z', Number.NaN]) {
      expect(formatJalaliDateTime(bad as string)).toBe('');
    }
  });

  it('does not depend on the Intl Persian calendar (Hermes empty-year case)', () => {
    const Real = Intl.DateTimeFormat;
    const Stub = function (locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
      const inner = new Real(locales, options);
      const persian = String(locales ?? '').includes('persian') || String(locales ?? '').startsWith('fa');
      return {
        formatToParts: (d: Date) =>
          inner.formatToParts(d).map((p) => (persian && p.type === 'year' ? { ...p, value: '' } : p)),
        format: (d: Date) => inner.format(d),
        resolvedOptions: () => inner.resolvedOptions(),
      };
    } as unknown as typeof Intl.DateTimeFormat;
    vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: Stub });
    expect(formatJalaliDateTime('2026-10-09T00:40:00.000Z', { withTime: true })).toBe('۱۷ مهر ۱۴۰۵، ۰۴:۱۰');
  });

  it('falls back to the fixed Tehran offset when Intl time zones are unavailable', () => {
    const Throwing = function () {
      throw new RangeError('no time zone support');
    } as unknown as typeof Intl.DateTimeFormat;
    vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: Throwing });
    expect(tehranWallParts(Date.parse('2026-10-08T20:30:00.000Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 9,
      hour: 0,
      minute: 0,
    });
    expect(formatJalaliDateTime('2026-10-08T20:29:00.000Z', { withTime: true })).toBe('۱۶ مهر ۱۴۰۵، ۲۳:۵۹');
  });
});
