import { describe, expect, it } from 'vitest';
import {
  NO_TARIFF_MESSAGE,
  buildQuoteRequest,
  formatServerAmount,
  isQuoteRefreshCode,
  parseServerQuote,
  quoteSelectionKey,
  requestServerQuote,
  serverQuoteAsFinalPrice,
} from './serverQuote';

const quote = {
  quoteToken: 'signed-token',
  subtotal: 1050,
  surcharges: [{ id: 'tools', amount: 50 }],
  discounts: [{ id: 'early', amount: 105 }],
  total: 945,
  currencyUnit: 'minor',
  tariffVersionId: 'v-published',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

describe('server quote contract', () => {
  it('asks the server for the selected service, duration and options', () => {
    const built = buildQuoteRequest({
      serviceId: 'home_unit_cleaning',
      pricingType: 'hourly',
      durationHours: 4,
      serviceOptions: { detergent: true, durationHours: 4, price: 150000 },
    });
    expect(built).toEqual({
      ok: true,
      body: { serviceId: 'home_unit_cleaning', quantity: 4, options: { detergent: true } },
    });
  });

  it('does not invent a quantity for a count that the customer has not chosen', () => {
    const built = buildQuoteRequest({
      serviceId: 'sofa',
      pricingType: 'count_based',
      durationHours: 3,
      serviceOptions: { sofaSeats: '۷ نفره' },
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.message).toBe('تعداد یا متراژ را انتخاب کنید.');
  });

  it('changes the quote key when an option changes', () => {
    const base = {
      serviceId: 'home',
      pricingType: 'hourly' as const,
      durationHours: 4,
      serviceOptions: { detergent: false },
    };
    expect(quoteSelectionKey(base)).not.toBe(quoteSelectionKey({ ...base, serviceOptions: { detergent: true } }));
    expect(quoteSelectionKey(base)).not.toBe(quoteSelectionKey({ ...base, durationHours: 5 }));
  });

  it('keeps the server amount and unit without converting them', () => {
    const parsed = parseServerQuote(quote);
    expect(parsed?.total).toBe(945);
    expect(parsed?.subtotal).toBe(1050);
    expect(parsed?.surcharges).toEqual([{ id: 'tools', amount: 50 }]);
    expect(parsed?.discounts).toEqual([{ id: 'early', amount: 105 }]);
    expect(parsed?.currencyUnit).toBe('minor');
    expect(formatServerAmount(945, 'minor')).toBe(`${(945).toLocaleString('fa-IR')} minor`);
    expect(formatServerAmount(945, 'minor')).not.toContain('تومان');
    expect(serverQuoteAsFinalPrice(parsed!).total).toBe(945);
  });

  it('rejects a quote that has no currency unit', () => {
    expect(parseServerQuote({ ...quote, currencyUnit: '' })).toBeNull();
    expect(parseServerQuote({ ...quote, currencyUnit: 'تومان' })?.currencyUnit).toBe('تومان');
  });

  it('shows the missing-tariff message and does not create a zero price', async () => {
    const view = await requestServerQuote(
      { serviceId: 'missing', quantity: 1, options: {} },
      async () => ({ success: false, code: 'NO_TARIFF', message: NO_TARIFF_MESSAGE }),
    );
    expect(view.status).toBe('unavailable');
    if (view.status === 'unavailable') {
      expect(view.message).toBe(NO_TARIFF_MESSAGE);
      expect(JSON.stringify(view)).not.toContain('"total":0');
    }
  });

  it('keeps a network failure from becoming an order price', async () => {
    const view = await requestServerQuote({ serviceId: 'home', quantity: 2, options: {} }, async () => {
      throw new Error('offline');
    });
    expect(view).toEqual({ status: 'network', message: expect.stringContaining('ارتباط برقرار نشد') });
  });

  it('requires a new confirmation after the server reports a changed or expired price', () => {
    expect(isQuoteRefreshCode('PRICE_CHANGED')).toBe(true);
    expect(isQuoteRefreshCode('QUOTE_EXPIRED')).toBe(true);
    expect(isQuoteRefreshCode('ORDER_REQUEST_CONFLICT')).toBe(false);
  });
});
