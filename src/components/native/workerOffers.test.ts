import { describe, expect, it } from 'vitest';
import {
  clampBasisPoints, offerRangeFromSelection, parseOffersResponse, priceDeltaLabel, stepBasisPoints,
} from './workerOffersModel';

describe('workerOffers helpers', () => {
  it('builds a Tehran-time ISO range from a Jalali date, start hour and duration', () => {
    const range = offerRangeFromSelection('1405-01-01', 10, 3);
    expect(range).not.toBeNull();
    expect(Date.parse(range!.endAt) - Date.parse(range!.startAt)).toBe(3 * 3600000);
    expect(offerRangeFromSelection('1405-13-01', 10, 3)).toBeNull();
    expect(offerRangeFromSelection('1405-01-01', 10, 0)).toBeNull();
  });
  it('keeps price percent inside tier bounds and 1% steps', () => {
    expect(clampBasisPoints(20000, 5000, 10000)).toBe(10000);
    expect(clampBasisPoints(1000, 5000, 13000)).toBe(5000);
    expect(clampBasisPoints(7049, 5000, 13000)).toBe(7000);
    expect(stepBasisPoints(10000, 1, 5000, 10000)).toBe(10000);
    expect(stepBasisPoints(10000, 1, 5000, 13000)).toBe(10500);
    expect(stepBasisPoints(5000, -1, 5000, 13000)).toBe(5000);
  });
  it('describes the difference from the tariff in Persian', () => {
    expect(priceDeltaLabel(7000)).toBe('۳۰٪ ارزان‌تر از تعرفه');
    expect(priceDeltaLabel(10000)).toBe('برابر تعرفهٔ شرکت');
    expect(priceDeltaLabel(11000)).toBe('۱۰٪ بالاتر از تعرفه');
  });
  it('rejects malformed server responses and drops malformed offers', () => {
    expect(parseOffersResponse({ success: false })).toBeNull();
    expect(parseOffersResponse({ success: true, offers: [], minBasisPoints: 0, maxBasisPoints: 10000 })).toBeNull();
    const parsed = parseOffersResponse({
      success: true, minBasisPoints: 5000, maxBasisPoints: 10000,
      offers: [{ id: 'a', serviceId: 's', startAt: 'x', endAt: 'y', adjustmentBasisPoints: 7000, status: 'OPEN' }, { id: 1 }],
    });
    expect(parsed?.offers).toHaveLength(1);
  });
});
