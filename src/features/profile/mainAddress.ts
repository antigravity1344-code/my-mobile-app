import type { SavedAddress } from './types/profile';

export type AddressFields = Omit<SavedAddress, 'id' | 'isDefault'>;

/** The main address is the saved address flagged isDefault (used by the booking wizard). */
export function findMainAddress(list: SavedAddress[]): SavedAddress | null {
  return list.find((addr) => addr.isDefault) ?? null;
}

/**
 * Save the main address: edit in place when replaceId matches, otherwise append.
 * The result always has exactly one default — the main address.
 */
export function applyMainAddress(
  list: SavedAddress[],
  fields: AddressFields,
  replaceId: string | undefined,
  newId: string,
): SavedAddress[] {
  const others = list.map((addr) => ({ ...addr, isDefault: false }));
  const index = replaceId ? others.findIndex((addr) => addr.id === replaceId) : -1;
  if (index >= 0) {
    return others.map((addr, i) => (i === index ? { ...fields, id: addr.id, isDefault: true } : addr));
  }
  return [...others, { ...fields, id: newId, isDefault: true }];
}

/** An extra address is the default only when it is the very first address. */
export function extraAddressIsDefault(list: SavedAddress[]): boolean {
  return list.length === 0;
}
