import { describe, expect, it } from 'vitest';
import { applyMainAddress, extraAddressIsDefault, findMainAddress } from './mainAddress';
import type { SavedAddress } from './types/profile';

const base = { title: 'خانه', district: 'سعادت‌آباد', fullAddress: 'خیابان', plaque: '۱', unit: '', recipientName: 'مشتری', contactPhone: '09120000000' };
const a = (id: string, isDefault: boolean, title = id): SavedAddress => ({ ...base, id, title, isDefault });

describe('main address (آدرس اصلی)', () => {
  it('first main address is appended as default', () => {
    const out = applyMainAddress([], { ...base }, undefined, 'n1');
    expect(out).toEqual([{ ...base, id: 'n1', isDefault: true }]);
  });
  it('new main address becomes the only default; others stay, unflagged', () => {
    const out = applyMainAddress([a('x', true), a('y', false)], { ...base, title: 'جدید' }, undefined, 'n1');
    expect(out.map((r) => [r.id, r.isDefault])).toEqual([['x', false], ['y', false], ['n1', true]]);
  });
  it('edit replaces in place, keeps id, stays default', () => {
    const out = applyMainAddress([a('x', true), a('y', false)], { ...base, title: 'ویرایش‌شده' }, 'x', 'unused');
    expect(out).toEqual([{ ...base, id: 'x', title: 'ویرایش‌شده', isDefault: true }, a('y', false)]);
  });
  it('edit of an unknown id falls back to append', () => {
    const out = applyMainAddress([a('y', false)], { ...base }, 'gone', 'n1');
    expect(out.map((r) => [r.id, r.isDefault])).toEqual([['y', false], ['n1', true]]);
  });
  it('findMainAddress returns the default one or null', () => {
    expect(findMainAddress([a('x', false), a('y', true)])?.id).toBe('y');
    expect(findMainAddress([a('x', false)])).toBeNull();
    expect(findMainAddress([])).toBeNull();
  });
  it('extra address is default only when it is the first address', () => {
    expect(extraAddressIsDefault([])).toBe(true);
    expect(extraAddressIsDefault([a('x', true)])).toBe(false);
  });
});
