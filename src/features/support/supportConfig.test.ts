import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SUPPORT_FAQ, SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_URL, WORKER_SUPPORT_FAQ } from './supportConfig';

describe('support contact', () => {
  it('uses the real support number (Latin for tel:, Persian digits for display)', () => {
    expect(SUPPORT_PHONE).toBe('09129289422');
    expect(SUPPORT_TEL_URL).toBe('tel:09129289422');
    expect(SUPPORT_PHONE_DISPLAY).toBe('۰۹۱۲۹۲۸۹۴۲۲');
  });

  it('the support screen shows the Persian-digit number', () => {
    const screen = readFileSync(join(__dirname, 'components', 'NativeSupportScreen.tsx'), 'utf8');
    expect(screen).toContain('{SUPPORT_PHONE_DISPLAY}');
    expect(screen).not.toContain('شماره: {SUPPORT_PHONE}<');
  });
});

describe('worker FAQ', () => {
  it('has its own 8 items, separate from the customer list', () => {
    expect(WORKER_SUPPORT_FAQ.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `worker_faq_${n}`));
    expect(SUPPORT_FAQ.some((f) => f.id.startsWith('worker_faq_'))).toBe(false);
  });

  it('the support screen picks the worker list only for the worker appearance', () => {
    const screen = readFileSync(join(__dirname, 'components', 'NativeSupportScreen.tsx'), 'utf8');
    expect(screen).toContain("appearance === 'worker' ? WORKER_SUPPORT_FAQ : SUPPORT_FAQ");
  });
});
