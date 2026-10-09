import { describe, expect, it, vi } from 'vitest';

import { createScrollToEndOnce, rtlOrder } from './rtlHorizontalList';

describe('rtlOrder', () => {
  it('puts the first item last (rightmost in a row) without mutating the input', () => {
    const days = ['today', 'tomorrow', 'day3'];
    expect(rtlOrder(days)).toEqual(['day3', 'tomorrow', 'today']);
    expect(days).toEqual(['today', 'tomorrow', 'day3']);
  });

  it('keeps every item (all 35 days stay reachable)', () => {
    const items = Array.from({ length: 35 }, (_, i) => i);
    const ordered = rtlOrder(items);
    expect(ordered).toHaveLength(35);
    expect(ordered[ordered.length - 1]).toBe(0);
    expect([...ordered].sort((a, b) => a - b)).toEqual(items);
  });
});

describe('createScrollToEndOnce', () => {
  it('scrolls to the end once, without animation, on the first non-empty layout', () => {
    const target = { scrollToEnd: vi.fn() };
    const handler = createScrollToEndOnce(() => target);
    handler.onContentSizeChange(0);
    expect(target.scrollToEnd).not.toHaveBeenCalled();
    handler.onContentSizeChange(2900);
    handler.onContentSizeChange(2950);
    expect(target.scrollToEnd).toHaveBeenCalledTimes(1);
    expect(target.scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('waits for the ref and allows one more jump after reset', () => {
    let target: { scrollToEnd: ReturnType<typeof vi.fn> } | null = null;
    const handler = createScrollToEndOnce(() => target);
    handler.onContentSizeChange(500);
    target = { scrollToEnd: vi.fn() };
    handler.onContentSizeChange(500);
    expect(target.scrollToEnd).toHaveBeenCalledTimes(1);
    handler.reset();
    handler.onContentSizeChange(300);
    expect(target.scrollToEnd).toHaveBeenCalledTimes(2);
  });
});
