import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayServiceTitle } from './serviceTitleDisplay';

// Phone (11 Oct 2026): «نظافت داخل منزل / واحد» wrapped right after the slash, leaving «/» dangling
// at the end of line 1 and «واحد» alone on line 2. The slash is now glued to the following word.
const NBSP = '\u00A0';
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('displayServiceTitle', () => {
  it('keeps «/» with the next word (no-break space after the slash)', () => {
    expect(displayServiceTitle('نظافت داخل منزل / واحد')).toBe(`نظافت داخل منزل /${NBSP}واحد`);
    expect(displayServiceTitle('مبل‌شویی')).toBe('مبل‌شویی');
    expect(displayServiceTitle(undefined)).toBe('');
  });
  it('is used for the service title on home hero, order card and order detail', () => {
    expect(read('components/native/CustomerHomeScreen.tsx').match(/\{displayServiceTitle\(order\.serviceTitle\)\}/g)).toHaveLength(2);
    expect(read('features/orders/components/OrderCard.tsx')).toContain('{displayServiceTitle(order.serviceTitle)}');
    expect(read('features/orders/components/OrderDetailModal.tsx')).toContain('{displayServiceTitle(order.serviceTitle)}');
  });
});

describe('home active-order hero layout', () => {
  const src = read('components/native/CustomerHomeScreen.tsx');
  const style = (n: string) => src.match(new RegExp(`\\n  ${n}: \\{([^}]*)\\}`))?.[1] ?? '';
  it('status badge on its own line below the title, centred', () => {
    expect(style('heroTop')).toContain("flexDirection: 'column'");
    expect(style('heroTop')).toContain("alignItems: 'stretch'");
    // flex:1 in a column would collapse the title's height
    expect(src.match(/\n  heroTitle: \{[\s\S]*?\n  \}/)![0]).not.toContain('flex: 1');
    expect(src).toMatch(/<View style=\{\[styles\.statusPill, styles\.heroStatusPill, \{ backgroundColor: tone\.bg \}\]\}>/);
    expect(style('heroStatusPill')).toContain("alignSelf: 'center'");
    expect(src.indexOf('{displayServiceTitle(order.serviceTitle)}')).toBeLessThan(src.indexOf('styles.heroStatusPill'));
  });
  it('hero title centred', () => {
    const block = src.match(/\n  heroTitle: \{[\s\S]*?\n  \}/)![0];
    expect(block).toContain("textAlign: 'center'");
    expect(block).not.toContain("textAlign: 'right'");
  });
  it('«پیگیری سفارش» button centred', () => {
    expect(style('heroCtaBtn')).toContain("alignSelf: 'center'");
  });
});
