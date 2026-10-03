import { describe, expect, it } from 'vitest';

import type { OrderItem } from '../types/order';
import {
  formatSubmittedAddress,
  selectCustomerOrders,
  submittedDurationHours,
  submittedOrderPrice,
} from './orderPayload';

function order(partial: Partial<OrderItem> & Pick<OrderItem, 'id' | 'serviceTitle' | 'createdAt'>): OrderItem {
  return {
    orderNumber: partial.id,
    serviceId: 'home_unit_cleaning',
    pricingType: 'hourly',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'CASH',
    date: { dateString: '', dayOfWeek: '', dayOfMonth: 1, monthName: 'فروردین' },
    timeSlot: {
      id: 't',
      label: '10',
      startTime: '10',
      endTime: '12',
      period: 'MORNING',
      isAvailable: true,
    },
    durationHours: 4,
    genderPreference: 'NO_PREFERENCE',
    serviceOptions: {},
    recurringFrequency: 'ONE_TIME',
    customerTier: 'NEW',
    address: {
      district: '',
      fullAddress: 'تهران',
      plaque: '',
      unit: '',
      hasElevator: false,
      contactPhone: '',
      recipientName: '',
      coordinates: { latitude: 0, longitude: 0 },
    },
    pricing: {
      subtotal: 100000,
      earlyBirdDiscountRate: 0,
      earlyBirdDiscountAmount: 0,
      tierDiscountRate: 0,
      tierDiscountAmount: 0,
      recurringDiscountRate: 0,
      recurringDiscountAmount: 0,
      discountRate: 0,
      discountAmount: 0,
      recurringDiscountDeferred: false,
      total: 100000,
    },
    updatedAt: partial.createdAt,
    timeline: [],
    ...partial,
  };
}

describe('order submit payload', () => {
  it('keeps plaque and unit beside the written address', () => {
    expect(formatSubmittedAddress({
      district: 'سعادت‌آباد',
      fullAddress: 'خیابان سرو',
      plaque: '۱۲',
      unit: '۴',
      floor: '۲',
      hasElevator: false,
      contactPhone: '',
      recipientName: '',
      coordinates: { latitude: 0, longitude: 0 },
    })).toBe('سعادت‌آباد، خیابان سرو، پلاک ۱۲، واحد ۴، طبقه ۲');
  });

  it('does not replace a missing price with a fixed amount', () => {
    expect(submittedOrderPrice(180000)).toBe(180000);
    expect(submittedOrderPrice(undefined)).toBeNull();
    expect(submittedOrderPrice(0)).toBe(0);
  });

  it('stores duration only for hourly services', () => {
    expect(submittedDurationHours({ pricingType: 'hourly', durationHours: 6 })).toBe(6);
    expect(submittedDurationHours({ pricingType: 'per_sqm', durationHours: 4 })).toBeNull();
  });

  it('finds an order by the assigned cleaner name', () => {
    const rows = [
      order({
        id: 'A',
        serviceTitle: 'نظافت',
        createdAt: '2026-01-02T00:00:00.000Z',
        cleaner: { id: 'W', name: 'رضا محمدی', phone: '09120000000' },
      }),
    ];
    expect(selectCustomerOrders(rows, 'ALL', 'رضا', 'NEWEST').map((item) => item.id)).toEqual(['A']);
  });
});
