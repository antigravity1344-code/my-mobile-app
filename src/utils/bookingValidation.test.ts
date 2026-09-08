import { describe, expect, it } from 'vitest';

import { getAddressValidationErrors, isValidAddress } from './bookingValidation';

describe('booking address validation', () => {
  it('requires a selected district before the booking can continue', () => {
    const errors = getAddressValidationErrors({
      district: '',
      fullAddress: 'خیابان نمونه، کوچه ۱۲، پلاک ۲۵',
      plaque: '25',
      unit: '3',
      floor: '2',
      hasElevator: true,
      contactPhone: '09123456789',
      recipientName: 'علی رضایی',
      addressNotes: 'زنگ را فشار دهید',
      coordinates: { latitude: 35.7, longitude: 51.4 },
      isSaved: true,
    });

    expect(errors.district).toBe('محله را انتخاب کنید.');
    expect(isValidAddress({
      district: '',
      fullAddress: 'خیابان نمونه، کوچه ۱۲، پلاک ۲۵',
      plaque: '25',
      unit: '3',
      floor: '2',
      hasElevator: true,
      contactPhone: '09123456789',
      recipientName: 'علی رضایی',
      addressNotes: 'زنگ را فشار دهید',
      coordinates: { latitude: 35.7, longitude: 51.4 },
      isSaved: true,
    })).toBe(false);
  });
});
