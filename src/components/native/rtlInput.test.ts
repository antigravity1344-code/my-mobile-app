import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RTL_SINGLE_LINE_INPUT } from './rtlInput';

// Phone bug (11 Oct 2026): an empty right-aligned single-line TextInput on Android scrolls
// horizontally on focus, so caret and placeholder are drawn outside the box — the tapped
// «واحد» field looked dead. Single-line RTL fields render as one-line multiline (no horizontal scroll).
const root = join(__dirname, '..', '..');
const sheet = readFileSync(join(root, 'features/profile/components/NativeAddressManagerModal.tsx'), 'utf8');
const wizard = readFileSync(join(root, 'components/booking/NativeBookingWizard.tsx'), 'utf8');

describe('RTL inputs keep caret and placeholder visible', () => {
  it('shared props: one-line multiline that blurs on submit', () => {
    expect(RTL_SINGLE_LINE_INPUT).toEqual({ multiline: true, numberOfLines: 1, submitBehavior: 'blurAndSubmit' });
  });
  it('address sheet: every single-line input uses it; full address is multiline', () => {
    const inputs = sheet.match(/<TextInput[^>]*\/>/g) ?? [];
    expect(inputs).toHaveLength(7);
    for (const tag of inputs) expect(tag).toMatch(/\{\.\.\.RTL_SINGLE_LINE_INPUT\}|multiline/);
    expect(inputs.filter((t) => t.includes('{...RTL_SINGLE_LINE_INPUT}'))).toHaveLength(6);
  });
  it('wizard step 3: plaque, unit, name and mobile use it', () => {
    for (const field of ['plaque', 'unit', 'recipientName', 'contactPhone']) {
      const at = wizard.indexOf(`setSelectedSavedAddressId(null); booking.updateAddressField('${field}'`);
      expect(at).toBeGreaterThan(-1);
      const open = wizard.lastIndexOf('<TextInput', at);
      expect(wizard.slice(open, at)).toContain('{...RTL_SINGLE_LINE_INPUT}');
    }
  });
});

describe('placeholders read as examples (مثلاً + Persian digits), labels stay', () => {
  it('address sheet', () => {
    for (const p of ['مثلاً خانه', 'مثلاً سعادت‌آباد', 'مثلاً خیابان آزادی، کوچه ۵', 'مثلاً ۱۲', 'مثلاً ۳', 'مثلاً علی رضایی', 'مثلاً ۰۹۱۲۳۴۵۶۷۸۹']) {
      expect(sheet).toContain(`placeholder="${p}"`);
    }
    for (const l of ['عنوان آدرس', 'محله', 'نشانی دقیق', 'پلاک', 'واحد', 'نام مشتری', 'موبایل مشتری']) {
      expect(sheet).toContain(`<Text style={styles.label}>${l}</Text>`);
    }
    expect(sheet).not.toContain('0912...');
  });
  it('wizard step 3', () => {
    for (const p of ['مثلاً خیابان آزادی، کوچه ۵', 'مثلاً ۱۲', 'مثلاً ۳', 'مثلاً علی رضایی', 'مثلاً ۰۹۱۲۳۴۵۶۷۸۹']) {
      expect(wizard).toContain(`placeholder="${p}"`);
    }
    expect(wizard).not.toContain('09121111111');
  });
  it('placeholder colour is slate-400 on every input of both screens', () => {
    for (const src of [sheet, wizard]) {
      for (const tag of src.match(/<TextInput[\s\S]*?\/>/g) ?? []) expect(tag).toContain('placeholderTextColor="#94a3b8"');
    }
  });
});
