import { describe, expect, it, beforeEach } from 'vitest';
import { parsePricingRules, setPricingRules, servicePricingMode } from './serviceAvailability';
import { sofaInputsFor, sofaQuoteShape, SOFA_SERVICE_ID } from './sofaPricingMode';
import { buildQuoteRequest } from '../features/orders/services/serverQuote';

describe('sofa form follows the server pricing mode', () => {
  beforeEach(() => setPricingRules([]));

  it('mattress_seat shows seat size and mattress count', () => {
    expect(sofaInputsFor('mattress_seat').map((input) => input.id)).toEqual(['sofaSeats', 'mattresses']);
  });

  it('units shows a single unit count', () => {
    const inputs = sofaInputsFor('units');
    expect(inputs.map((input) => input.id)).toEqual(['mattresses']);
    expect(inputs[0].label).toContain('واحد');
  });

  it('disabled mode shows no sofa fields', () => {
    expect(sofaInputsFor(null)).toEqual([]);
  });
});

describe('sofa quote shape', () => {
  it('mattress_seat sends the seat size and the mattress count as quantity', () => {
    expect(sofaQuoteShape('mattress_seat', { sofaSeats: '۹ نفره', mattresses: 2 })).toEqual({ quantity: 2, options: { seatSize: '9' } });
    expect(sofaQuoteShape('mattress_seat', { sofaSeats: '۷ نفره', mattresses: 1 })).toEqual({ quantity: 1, options: { seatSize: '7' } });
  });

  it('units sends only the count', () => {
    expect(sofaQuoteShape('units', { mattresses: 5 })).toEqual({ quantity: 5, options: {} });
  });

  it('rejects a missing or non-positive count and a missing seat size', () => {
    expect(sofaQuoteShape('units', { mattresses: 0 })).toBeNull();
    expect(sofaQuoteShape('mattress_seat', { sofaSeats: '۷ نفره' })).toBeNull();
    expect(sofaQuoteShape('mattress_seat', { mattresses: 1 })).toBeNull();
    expect(sofaQuoteShape(null, { mattresses: 1 })).toBeNull();
  });
});

describe('server rules carry the pricing mode', () => {
  it('parses pricingMode and ignores unknown values', () => {
    const rules = parsePricingRules({
      success: true,
      pricingRules: [
        { serviceId: SOFA_SERVICE_ID, model: 'count', exemptFromTierLock: false, pricingMode: 'mattress_seat' },
        { serviceId: 'other', model: 'fixed', exemptFromTierLock: false, pricingMode: 'weird' },
      ],
    });
    expect(rules?.[0].pricingMode).toBe('mattress_seat');
    expect(rules?.[1].pricingMode).toBeNull();
  });

  it('stores the mode per service after setPricingRules', () => {
    setPricingRules([{ serviceId: SOFA_SERVICE_ID, model: 'count', exemptFromTierLock: false, pricingMode: 'units' }]);
    expect(servicePricingMode(SOFA_SERVICE_ID)).toBe('units');
    expect(servicePricingMode('unknown')).toBeNull();
  });
});

describe('buildQuoteRequest for the sofa service', () => {
  it('blocks the quote when the mode is not set on the server', () => {
    setPricingRules([]);
    const built = buildQuoteRequest({
      serviceId: SOFA_SERVICE_ID, pricingType: 'count_based', durationHours: 0,
      serviceOptions: { sofaSeats: '۷ نفره', mattresses: 2 },
    });
    expect(built.ok).toBe(false);
  });

  it('builds the mattress_seat body with seatSize and quantity', () => {
    setPricingRules([{ serviceId: SOFA_SERVICE_ID, model: 'count', exemptFromTierLock: false, pricingMode: 'mattress_seat' }]);
    const built = buildQuoteRequest({
      serviceId: SOFA_SERVICE_ID, pricingType: 'count_based', durationHours: 0,
      serviceOptions: { sofaSeats: '۹ نفره', mattresses: 3 },
    });
    expect(built).toEqual({ ok: true, body: { serviceId: SOFA_SERVICE_ID, quantity: 3, options: { seatSize: '9' } } });
    setPricingRules([]);
  });
});
