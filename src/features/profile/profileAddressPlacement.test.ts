import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// UX (11 Oct 2026): the profile has a «آدرس اصلی» right after the identity fields.
const src = readFileSync(join(__dirname, 'components', 'NativeProfileScreen.tsx'), 'utf8');
const modal = readFileSync(join(__dirname, 'components', 'NativeAddressManagerModal.tsx'), 'utf8');
const ctx = readFileSync(join(__dirname, 'context', 'ProfileContext.tsx'), 'utf8');

describe('profile: main address right after identity', () => {
  it('save button still only saves identity (no fake combined save)', () => {
    expect(src).toContain('<Pressable onPress={() => void saveIdentity()} disabled={savingProfile} style={styles.saveBtn}>');
  });
  it('order: birth date → آدرس اصلی → ذخیره اطلاعات (single save at the end of the form) → آدرس‌های دیگر → باشگاه → کیف پول', () => {
    const idx = ['تاریخ تولد', 'آدرس اصلی', 'ذخیره اطلاعات', 'آدرس‌های دیگر', 'باشگاه مشتریان', 'کیف پول'].map((t) => src.indexOf(t));
    idx.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
  });
  it('main address: card with «ویرایش» or «ثبت آدرس اصلی» button, both open the modal in main mode', () => {
    expect(src).toContain('const mainAddress = findMainAddress(profile.savedAddresses);');
    expect(src).toContain('>ثبت آدرس اصلی<');
    expect(src).toContain('>ویرایش<');
    expect(src).toContain("openAddressModal('main')");
    expect(src).toContain("openAddressModal('main', mainAddress)");
    expect(src).toContain("openAddressModal('extra')");
  });
  it('dropped ideas / old texts are gone', () => {
    expect(src).not.toContain('افزودن آدرس جدید');
    expect(src).not.toContain('آدرس‌های ذخیره‌شده');
    expect(src).not.toContain('هنوز آدرسی ذخیره نشده است.');
  });
  it('modal: main mode saves via saveMainAddress (default), extra keeps first-is-default, edit prefills', () => {
    expect(modal).toContain('saveMainAddress(fields, editAddress?.id)');
    expect(modal).toContain('isDefault: extraAddressIsDefault(profile.savedAddresses)');
    expect(modal).toMatch(/useEffect\(\(\) => \{\s*if \(!visible\) return;/);
    expect(ctx).toContain('applyMainAddress(prev.savedAddresses, addr, replaceId, `addr_${Date.now()}`)');
  });
});

describe('«ثبت آدرس اصلی» button is text-only', () => {
  it('no Plus icon on the main-address button; «افزودن» keeps its Plus', () => {
    const m = src.match(/<Pressable onPress=\{\(\) => openAddressModal\('main'\)\}[^>]*>([\s\S]*?)<\/Pressable>/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toContain('<Plus');
    expect(m![1]).toContain('ثبت آدرس اصلی');
    const extra = src.match(/<Pressable onPress=\{\(\) => openAddressModal\('extra'\)\}[^>]*>([\s\S]*?)<\/Pressable>/);
    expect(extra![1]).toContain('<Plus');
  });
});
