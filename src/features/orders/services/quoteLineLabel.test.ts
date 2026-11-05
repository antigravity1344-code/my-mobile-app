import { describe, expect, it } from 'vitest';
import { quoteLineLabel } from './quoteLineLabel';

describe('quoteLineLabel', () => {
  it('maps a known service option id to its Persian label', () => {
    expect(quoteLineLabel('detergent', 'surcharge')).toBe('تهیه مواد شوینده');
  });
  it('keeps ids that are already Persian', () => {
    expect(quoteLineLabel('تخفیف همکاری', 'discount')).toBe('تخفیف همکاری');
  });
  it('never shows a raw technical id to the customer', () => {
    expect(quoteLineLabel('existing', 'discount')).toBe('تخفیف');
    expect(quoteLineLabel('x_fee_2', 'surcharge')).toBe('هزینهٔ افزوده');
  });
});
