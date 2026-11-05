import { describe, expect, it } from 'vitest';
import { offerDurationChoices } from './offerBookingDraft';
import { formatOfferPrice, offerStartSelection, parseCustomerOffers, tierLabel } from './customerOffersModel';

describe('customer offers model', () => {
  it('parses offers and drops malformed rows', () => {
    const parsed = parseCustomerOffers({
      success: true,
      offers: [
        { id: 'OFR-1', serviceId: 'home_unit_cleaning', startAt: '2030-01-01T10:00:00.000Z', endAt: '2030-01-01T14:00:00.000Z', adjustmentBasisPoints: 7000, total: 700, tariffTotal: 1000, currencyUnit: 'toman', worker: { name: 'علی', tierKey: 'gold', ratingAverage: 4.8, ratingCount: 12 } },
        { id: 2 },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed![0].worker.ratingAverage).toBe(4.8);
    expect(parseCustomerOffers({ success: false })).toBeNull();
  });
  it('converts start to Jalali date and Tehran wall time', () => {
    // 2030-03-21T08:30Z = 12:00 Tehran (UTC+3:30) = 1 Farvardin 1409
    const sel = offerStartSelection('2030-03-21T08:30:00.000Z');
    expect(sel?.startTime).toBe('12:00');
    expect(sel?.dateString).toMatch(/^1409-01-0[12]$/);
    expect(offerStartSelection('bad')).toBeNull();
  });
  it('offers only durations that fit inside the window', () => {
    expect(offerDurationChoices('2030-01-01T10:00:00.000Z', '2030-01-01T14:30:00.000Z')).toEqual([1, 2, 3, 4]);
    expect(offerDurationChoices('2030-01-01T10:00:00.000Z', '2030-01-01T12:00:00.000Z', 4)).toEqual([]);
  });
  it('formats price and tier', () => {
    expect(formatOfferPrice(1400000, 'toman')).toBe('۱,۴۰۰,۰۰۰ تومان');
    expect(tierLabel('gold')).toBe('طلایی');
  });
});
