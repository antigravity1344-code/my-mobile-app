import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');

describe('booking screens do not present an unapproved amount', () => {
  it('ServiceSelector does not show catalog basePrice', () => {
    const src = read('ServiceSelector.tsx');
    expect(src).not.toContain('basePrice');
    expect(src).toContain('قیمت را سرور اعلام می‌کند');
  });

  it('DateTimeSelector does not show an extra fee or hourly estimate', () => {
    const src = read('DateTimeSelector.tsx');
    expect(src).not.toContain('extraFee');
    expect(src).not.toContain('hourlyEstimate');
    expect(src).not.toContain('تومان');
  });

  it('PricingTable does not calculate a client scenario price', () => {
    const src = read('PricingTable.tsx');
    expect(src).not.toContain('calculatePrice');
    expect(src).not.toContain('تومان');
    expect(src).toContain('قیمت را سرور اعلام می‌کند');
  });
});
