import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatTomanAmount } from './services/money';

// Phone (11 Oct 2026): labels that wrap to two lines («کل سفارش‌ها», «جاری و فعال», «مجموع خرید»)
// had no textAlign → Android aligned the lines left; one-line «تکمیل‌شده» looked centred.
const src = readFileSync(join(__dirname, 'components', 'OrdersScreen.tsx'), 'utf8');
const style = (name: string) => src.match(new RegExp(`\\n  ${name}: \\{([^}]*)\\}`))?.[1] ?? '';

describe('orders stats tiles', () => {
  it('label and value are centred in every tile', () => {
    expect(style('statCard')).toContain("alignItems: 'center'");
    expect(style('statTitle')).toContain("textAlign: 'center'");
    expect(style('statNumber')).toContain("textAlign: 'center'");
    expect(style('statIconWrap')).toContain("alignItems: 'center'");
  });
  it('«مجموع خرید» shows the full amount in toman, one line, shrinking to fit', () => {
    expect(src).not.toContain('هـ.ت');
    expect(src).not.toContain('/ 1000');
    expect(src).toMatch(/numberOfLines=\{1\}\s+adjustsFontSizeToFit[^>]*>\s*\{formatTomanAmount\(stats\.totalSpent\)\}/);
  });
});

describe('formatTomanAmount (same as order card price)', () => {
  it('Persian digits, Persian thousands separator, «تومان»', () => {
    expect(formatTomanAmount(600000)).toBe('۶۰۰٬۰۰۰ تومان');
    expect(formatTomanAmount(1250000)).toBe('۱٬۲۵۰٬۰۰۰ تومان');
    expect(formatTomanAmount(0)).toBe('۰ تومان');
    expect(formatTomanAmount(undefined)).toBe('۰ تومان');
  });
  it('totalSpent counts completed orders only (cancelled and active excluded)', () => {
    const svc = readFileSync(join(__dirname, 'services', 'orderService.ts'), 'utf8');
    expect(svc).toMatch(/else if \(order\.status === 'COMPLETED'\) \{\s*completedCount\+\+;\s*totalSpent \+= toFiniteNumber\(order\.pricing\?\.total, 0\);\s*\}/);
    expect(svc.match(/totalSpent \+=/g)).toHaveLength(1);
  });
});
