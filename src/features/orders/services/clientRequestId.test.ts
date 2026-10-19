import { describe, expect, it } from 'vitest';
import { bookingRequestFingerprint, clientRequestIdForAttempt } from './clientRequestId';

const order = {
  serviceId: 'home',
  options: { detergent: true },
  quantity: 4,
  durationHours: 4,
  confirmedTotal: 945,
  currencyUnit: 'minor',
  date: '2026-10-20',
  time: 'morning-1',
  address: { district: 'سعادت‌آباد', fullAddress: 'خیابان سرو', plaque: '۱۲', unit: '', recipientName: 'علی', contactPhone: '09120000000', addressNotes: '' },
  genderPreference: 'NO_PREFERENCE',
  recurringFrequency: 'ONE_TIME',
  notes: '',
};

describe('client request identity', () => {
  it('reuses the id when an unknown retry has the same order and price', () => {
    let next = 0;
    const createId = () => `id-${++next}`;
    const fingerprint = bookingRequestFingerprint(order);
    const first = clientRequestIdForAttempt(null, fingerprint, createId);
    const retry = clientRequestIdForAttempt(first, bookingRequestFingerprint({ ...order }), createId);
    expect(retry.id).toBe(first.id);
    expect(next).toBe(1);
  });

  it('mints a new id when the price or the selected service changes', () => {
    let next = 0;
    const createId = () => `id-${++next}`;
    const held = clientRequestIdForAttempt(null, bookingRequestFingerprint(order), createId);
    const changedPrice = clientRequestIdForAttempt(held, bookingRequestFingerprint({ ...order, confirmedTotal: 1000 }), createId);
    const changedService = clientRequestIdForAttempt(changedPrice, bookingRequestFingerprint({ ...order, serviceId: 'sofa' }), createId);
    expect(changedPrice.id).not.toBe(held.id);
    expect(changedService.id).not.toBe(changedPrice.id);
  });
});
