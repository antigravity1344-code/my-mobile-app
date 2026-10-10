import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addressFieldTone, firstAddressHint } from './addressFieldTone';

describe('addressFieldTone (U-new4: no red on fields the user has not filled yet)', () => {
  it('empty field is neutral (was red as soon as step 3 opened, even optional «واحد»)', () => {
    expect(addressFieldTone('', true)).toBe('neutral');
    expect(addressFieldTone('  ', true)).toBe('neutral');
    expect(addressFieldTone(undefined, false)).toBe('neutral');
  });
  it('filled + invalid is red, filled + valid is green', () => {
    expect(addressFieldTone('0912', true)).toBe('error');
    expect(addressFieldTone('09121234567', false)).toBe('ok');
  });
});

describe('firstAddressHint', () => {
  it('returns the first missing item in form order', () => {
    expect(firstAddressHint({ plaque: 'پلاک را وارد کنید.', contactPhone: 'x' })).toBe('پلاک را وارد کنید.');
    expect(firstAddressHint({ district: 'محله را انتخاب کنید.', plaque: 'p' })).toBe('محله را انتخاب کنید.');
  });
  it('null when valid', () => {
    expect(firstAddressHint({})).toBeNull();
  });
});

describe('wizard wiring (source-level)', () => {
  const src = readFileSync(join(__dirname, 'NativeBookingWizard.tsx'), 'utf8');
  it('getInputStyle uses addressFieldTone and no longer marks empty fields red', () => {
    expect(src).toContain('addressFieldTone(booking.addressDetails[field], hasError)');
    expect(src).not.toContain('if (!value) return styles.inputError;');
  });
  it('step 3 explains why «ادامه» is disabled', () => {
    expect(src).toMatch(/booking\.step === 3 && !canContinue && addressHint \?/);
  });
});
