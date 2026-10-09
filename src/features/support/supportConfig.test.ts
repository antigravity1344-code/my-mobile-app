import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_URL } from './supportConfig';

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
