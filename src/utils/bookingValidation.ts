import { AddressDetails } from '../types/booking';

const PERSIAN_DIGIT_MAP: Record<string, string> = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

export const normalizePersianDigits = (value: string | null | undefined): string => {
  if (value == null) return '';

  return value.replace(/[۰-۹٠-٩]/g, (digit) => PERSIAN_DIGIT_MAP[digit] ?? digit);
};

export const isValidIranianMobile = (value: string | null | undefined): boolean => {
  const normalized = normalizePersianDigits(value ?? '').replace(/\D/g, '');
  const withoutCountryCode = normalized.startsWith('98') ? normalized.slice(2) : normalized;

  return /^09\d{9}$/.test(withoutCountryCode);
};

export const isValidAddress = (address: Partial<AddressDetails> | null | undefined): boolean => {
  if (!address) return false;

  const fullAddress = typeof address.fullAddress === 'string' ? address.fullAddress.trim() : '';
  const plaque = typeof address.plaque === 'string' ? address.plaque.trim() : '';
  const recipientName = typeof address.recipientName === 'string' ? address.recipientName.trim() : '';
  const contactPhone = typeof address.contactPhone === 'string' ? address.contactPhone : '';

  return (
    fullAddress.length >= 8 &&
    plaque.length > 0 &&
    recipientName.length >= 3 &&
    isValidIranianMobile(contactPhone)
  );
};
