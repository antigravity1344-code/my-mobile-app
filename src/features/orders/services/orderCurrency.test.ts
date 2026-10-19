import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatStoredAmount, reloadedOrderMoney, summarizeCompletedSpend } from './money';

describe('server currency after reload', () => {
  it('keeps the server unit and the same amount on the reloaded order', () => {
    const money = reloadedOrderMoney({ price: 1, pricing: { total: 945, currencyUnit: 'minor' } });
    expect(money.total).toBe(945);
    expect(money.currencyUnit).toBe('minor');
    expect(formatStoredAmount(money.total, money.currencyUnit)).toBe(`${(945).toLocaleString('fa-IR')} minor`);
    expect(formatStoredAmount(money.total, money.currencyUnit)).not.toContain('تومان');
    const mapper = readFileSync(join(__dirname, 'orderService.ts'), 'utf8');
    expect(mapper).toContain('reloadedOrderMoney({ price: o.price, pricing: storedPricing })');
    expect(mapper).toContain('quoteCurrencyUnit: reloadedMoney.currencyUnit');
  });

  it('does not change a historical amount that has no server unit', () => {
    const money = reloadedOrderMoney({ price: 150000, pricing: { total: 150000 } });
    expect(money.total).toBe(150000);
    expect(money.currencyUnit).toBeUndefined();
    expect(formatStoredAmount(money.total, money.currencyUnit)).toBe(`${(150000).toLocaleString('fa-IR')} تومان`);
  });

  it('sums one currency and refuses to add different units together', () => {
    const same = summarizeCompletedSpend([
      { status: 'COMPLETED', pricing: { total: 100 }, quoteCurrencyUnit: 'minor' },
      { status: 'COMPLETED', pricing: { total: 50 }, quoteCurrencyUnit: 'minor' },
      { status: 'PENDING', pricing: { total: 999 }, quoteCurrencyUnit: 'minor' },
    ]);
    expect(same).toEqual({ totalSpent: 150, currencyUnit: 'minor', mixed: false });
    const historical = summarizeCompletedSpend([
      { status: 'COMPLETED', pricing: { total: 100 } },
      { status: 'COMPLETED', pricing: { total: 50 } },
      { status: 'CANCELLED', pricing: { total: 25 } },
    ]);
    expect(historical.totalSpent).toBe(150);
    expect(historical.currencyUnit).toBeNull();
    expect(historical.mixed).toBe(false);
    const mixed = summarizeCompletedSpend([
      { status: 'COMPLETED', pricing: { total: 100 }, quoteCurrencyUnit: 'minor' },
      { status: 'COMPLETED', pricing: { total: 50 } },
    ]);
    expect(mixed.mixed).toBe(true);
    expect(mixed.totalSpent).toBe(0);
  });
});
