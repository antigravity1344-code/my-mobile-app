import { describe, expect, it } from 'vitest';
import { FETCH_TIMEOUT_MS, withTimeoutSignal } from './fetchTimeout';

describe('withTimeoutSignal', () => {
  it('keeps a 30s client timeout as an implementation limit, not a product fee', () => {
    expect(FETCH_TIMEOUT_MS).toBe(30_000);
  });

  it('aborts when the timer fires', () => {
    let fired: (() => void) | null = null;
    const handle = withTimeoutSignal(null, 30_000, () => 0, (fn) => {
      fired = fn;
      return { clear() {} };
    });
    expect(handle.signal.aborted).toBe(false);
    fired?.();
    expect(handle.signal.aborted).toBe(true);
  });
});
