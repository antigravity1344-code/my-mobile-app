import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// UX (11 Oct 2026): order cards in «سفارش‌های من» are centre-aligned.
const src = readFileSync(join(__dirname, 'components', 'OrderCard.tsx'), 'utf8');
const style = (name: string) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{([^}]*)\\}`));
  expect(m, name).not.toBeNull();
  return m![1];
};

describe('OrderCard text is centred', () => {
  it('text lines use textAlign center', () => {
    for (const s of ['serviceTitle', 'serviceSubtitle', 'specText', 'cleanerName', 'cleanerRole', 'priceLabel', 'priceValue']) {
      expect(style(s), s).toContain("textAlign: 'center'");
    }
    expect(src).not.toContain("textAlign: 'right'");
  });
  it('icon+text groups and rows are centred as groups', () => {
    for (const s of ['headerRow', 'specsContainer', 'cleanerStrip']) expect(style(s), s).toContain("justifyContent: 'center'");
    for (const s of ['serviceRow', 'priceWrap']) expect(style(s), s).toContain("alignItems: 'center'");
  });
  it('buttons row is unchanged (price left, actions right)', () => {
    expect(style('footerRow')).toContain("justifyContent: 'space-between'");
    expect(style('actionsWrap')).toContain("flexDirection: 'row-reverse'");
  });
});
