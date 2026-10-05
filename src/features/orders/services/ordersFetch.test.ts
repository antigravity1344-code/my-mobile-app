import { describe, expect, it } from 'vitest';

import { createLatestRequestGuard } from './orderStatusWatch';
import { applyOrdersFetch, shouldStartOrdersRefresh } from './ordersFetch';

describe('orders fetch race', () => {
  it('does not let a stale failure latch the winner or clear a successful list', () => {
    const guard = createLatestRequestGuard();
    const first = guard();
    const second = guard();
    const winner = applyOrdersFetch(
      { loadError: 'ورود لازم است.', orders: [] as string[] },
      { isCurrent: second(), silent: false, error: null, orders: ['order-1'] },
    );
    const afterStaleFailure = applyOrdersFetch(winner, {
      isCurrent: first(),
      silent: false,
      error: 'ورود لازم است.',
      orders: [],
    });

    expect(winner).toEqual({ loadError: null, orders: ['order-1'] });
    expect(afterStaleFailure).toEqual({ loadError: null, orders: ['order-1'] });
  });

  it('clears loadError when the current fetch succeeds', () => {
    const next = applyOrdersFetch(
      { loadError: 'خطا در ارتباط با سرور محلی', orders: [] as string[] },
      { isCurrent: true, silent: true, error: null, orders: ['order-1'] },
    );
    expect(next).toEqual({ loadError: null, orders: ['order-1'] });
  });

  it('keeps existing orders when a later non-silent fetch fails', () => {
    const next = applyOrdersFetch(
      { loadError: null, orders: ['order-1'] },
      { isCurrent: true, silent: false, error: 'اتصال به سرور سفارش‌ها برقرار نشد.', orders: [] },
    );
    expect(next).toEqual({
      loadError: 'اتصال به سرور سفارش‌ها برقرار نشد.',
      orders: ['order-1'],
    });
  });

  it('does not set loadError or clear orders on a silent failure', () => {
    const state = { loadError: null, orders: ['order-1'] };
    expect(
      applyOrdersFetch(state, {
        isCurrent: true,
        silent: true,
        error: 'خطا در ارتباط با سرور محلی',
        orders: [],
      }),
    ).toBe(state);
  });

  it('does not start a silent refresh while a fetch is already in flight', () => {
    expect(shouldStartOrdersRefresh(true, true)).toBe(false);
    expect(shouldStartOrdersRefresh(true, false)).toBe(true);
    expect(shouldStartOrdersRefresh(false, true)).toBe(true);
  });
});
