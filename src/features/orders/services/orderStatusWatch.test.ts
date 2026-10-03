import { describe, expect, it } from 'vitest';

import {
  createLatestRequestGuard,
  createOrderStatusTicker,
  startOrderStatusWatch,
} from './orderStatusWatch';

describe('customer order status watch', () => {
  it('keeps only the latest refresh result', () => {
    const isCurrent = createLatestRequestGuard();
    const first = isCurrent();
    const second = isCurrent();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('does not start a second refresh while one is still running and stops after disposal', async () => {
    let release: (() => void) | undefined;
    let calls = 0;
    const ticker = createOrderStatusTicker(
      () =>
        new Promise<void>((resolve) => {
          calls += 1;
          release = resolve;
        }),
    );

    const first = ticker.tick();
    const overlapped = ticker.tick();
    expect(calls).toBe(1);
    await expect(overlapped).resolves.toBe(false);
    release?.();
    await expect(first).resolves.toBe(true);

    ticker.stop();
    await expect(ticker.tick()).resolves.toBe(false);
    expect(calls).toBe(1);
  });

  it('clears the interval when the orders screen stops watching', () => {
    const timers: Array<() => void> = [];
    let cleared = 0;
    const stop = startOrderStatusWatch({
      refresh: async () => undefined,
      intervalMs: 1000,
      setIntervalFn(callback) {
        timers.push(callback);
        return 7;
      },
      clearIntervalFn() {
        cleared += 1;
      },
    });
    stop();
    expect(cleared).toBe(1);
    expect(timers).toHaveLength(1);
  });
});
