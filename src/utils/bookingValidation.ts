import { AddressDetails } from '../types/booking';

export const normalizePersianDigits = (value: string): string =>
  value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export const isValidIranianMobile = (value: string): boolean =>
  /^09[0-9]{9}$/.test(normalizePersianDigits(value.trim()));

export interface AddressValidationErrors {
  fullAddress?: string;
  plaque?: string;
  recipientName?: string;
  contactPhone?: string;
}

export const getAddressValidationErrors = (address: AddressDetails): AddressValidationErrors => {
  const errors: AddressValidationErrors = {};
  const fullAddress = address.fullAddress.trim();
  const recipientName = address.recipientName.trim();
  const contactPhone = address.contactPhone.trim();

  if (!fullAddress) errors.fullAddress = 'نشانی دقیق را وارد کنید.';
  else if (fullAddress.length < 8) errors.fullAddress = 'نشانی دقیق باید حداقل ۸ کاراکتر باشد.';
  if (!address.plaque.trim()) errors.plaque = 'پلاک را وارد کنید.';
  if (!recipientName) errors.recipientName = 'نام و نام خانوادگی را وارد کنید.';
  else if (recipientName.length < 3) errors.recipientName = 'نام و نام خانوادگی باید حداقل ۳ کاراکتر باشد.';
  if (!contactPhone) errors.contactPhone = 'شماره موبایل را وارد کنید.';
  else if (!isValidIranianMobile(contactPhone)) errors.contactPhone = 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.';

  return errors;
};

export const isValidAddress = (address: AddressDetails): boolean =>
  Object.keys(getAddressValidationErrors(address)).length === 0;
