import { afterEach, describe, expect, it } from 'vitest';
import { parsePricingRules, setPricingRules, SOFA_DISABLED_MESSAGE, SOFA_SERVICE_ID } from '../../../config/serviceAvailability';
import { buildQuoteRequest } from './serverQuote';

function useMode(pricingMode: string | null, seatSizes: string[] | null = null) {
  setPricingRules(parsePricingRules({ success: true, pricingRules: [{
    serviceId: SOFA_SERVICE_ID, model: 'count', pricingMode, seatSizes,
  }] }) ?? []);
}

function quote(sofaQuantity: string, seatSize?: string) {
  return buildQuoteRequest({ serviceId: SOFA_SERVICE_ID, pricingType: 'count_based', durationHours: 4,
    serviceOptions: { sofaQuantity, seatSize: seatSize ?? '', price: 5 } });
}

afterEach(() => setPricingRules([]));

describe('server-driven sofa quote', () => {
  it('uses mattresses and a confirmed seat size in mode B', () => {
    useMode('mattress_seat', ['7', '9']);
    expect(quote('2', '9')).toEqual({ ok: true, body: { serviceId: SOFA_SERVICE_ID, quantity: 2, options: { seatSize: '9' } } });
    expect(quote('2')).toMatchObject({ ok: false });
    expect(quote('2', '8')).toMatchObject({ ok: false });
  });

  it('uses whole units and drops the previous seat size in mode A', () => {
    useMode('units');
    expect(quote('2', '9')).toEqual({ ok: true, body: { serviceId: SOFA_SERVICE_ID, quantity: 2, options: {} } });
    for (const value of ['', '0', '1.5', '-1']) expect(quote(value)).toMatchObject({ ok: false });
  });

  it('blocks a quote when mode is off or missing', () => {
    useMode(null);
    expect(quote('2', '9')).toEqual({ ok: false, message: SOFA_DISABLED_MESSAGE });
    setPricingRules([]);
    expect(quote('2')).toEqual({ ok: false, message: SOFA_DISABLED_MESSAGE });
  });
});
