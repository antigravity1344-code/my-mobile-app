import { AddressDetails } from '../types/booking';

export const normalizePersianDigits = (value: string): string =>
  value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export const isValidIranianMobile = (value: string): boolean =>
  /^09[0-9]{9}$/.test(normalizePersianDigits(value.trim()));

export const isValidAddress = (address: AddressDetails): boolean =>
  address.fullAddress.trim().length >= 8 &&
  address.plaque.trim().length > 0 &&
  address.recipientName.trim().length >= 3 &&
  isValidIranianMobile(address.contactPhone);
