import { formatToman, toPersianDigits } from './format';

import { describe, expect, it } from 'vitest';

describe('persian display formatting', () => {
  it('maps western digits without touching non-digits', () => {
    expect(toPersianDigits('سفارش 12')).toBe('سفارش ۱۲');
  });

  it('groups toman amounts and prints persian digits', () => {
    expect(formatToman(150000)).toBe('۱۵۰٬۰۰۰ تومان');
  });
});
