import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('web DateTimeSelector dates', () => {
  const src = readFileSync(join(__dirname, 'DateTimeSelector.tsx'), 'utf8');

  it('uses the pure Jalali helper instead of Intl persian calendar (empty year on Hermes)', () => {
    expect(src).not.toMatch(/ca-persian/);
    expect(src).toMatch(/buildJalaliDateOptions\(/);
  });
});
