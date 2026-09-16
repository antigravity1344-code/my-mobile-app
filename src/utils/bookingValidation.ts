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

export interface AddressValidationErrors {
  district?: string;
  fullAddress?: string;
  plaque?: string;
  recipientName?: string;
  contactPhone?: string;
}

export const getAddressValidationErrors = (address: Partial<AddressDetails> | null | undefined): AddressValidationErrors => {
  const errors: AddressValidationErrors = {};
  if (!address) {
    return {
      district: 'محله را انتخاب کنید.',
      fullAddress: 'نشانی دقیق را وارد کنید.',
      plaque: 'پلاک را وارد کنید.',
      recipientName: 'نام و نام خانوادگی را وارد کنید.',
      contactPhone: 'شماره موبایل را وارد کنید.',
    };
  }

  const district = typeof address.district === 'string' ? address.district.trim() : '';
  const fullAddress = typeof address.fullAddress === 'string' ? address.fullAddress.trim() : '';
  const plaque = typeof address.plaque === 'string' ? address.plaque.trim() : '';
  const recipientName = typeof address.recipientName === 'string' ? address.recipientName.trim() : '';
  const contactPhone = typeof address.contactPhone === 'string' ? address.contactPhone : '';

  if (!district) errors.district = 'محله را انتخاب کنید.';
  if (!fullAddress) errors.fullAddress = 'نشانی دقیق را وارد کنید.';
  else if (fullAddress.length < 8) errors.fullAddress = 'نشانی دقیق باید حداقل ۸ کاراکتر باشد.';
  if (!plaque) errors.plaque = 'پلاک را وارد کنید.';
  if (!recipientName) errors.recipientName = 'نام و نام خانوادگی را وارد کنید.';
  else if (recipientName.length < 3) errors.recipientName = 'نام و نام خانوادگی باید حداقل ۳ کاراکتر باشد.';
  if (!contactPhone) errors.contactPhone = 'شماره موبایل را وارد کنید.';
  else if (!isValidIranianMobile(contactPhone)) errors.contactPhone = 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.';

  return errors;
};

export const isValidAddress = (address: Partial<AddressDetails> | null | undefined): boolean =>
  Object.keys(getAddressValidationErrors(address)).length === 0;
