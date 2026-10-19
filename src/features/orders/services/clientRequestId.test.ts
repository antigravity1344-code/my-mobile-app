import { describe, expect, it } from 'vitest';
import {
  attemptAfterSubmit,
  bookingRequestFingerprint,
  bookingSelectionFingerprint,
  clientRequestIdForAttempt,
  resolveBookingSubmission,
  type StoredBookingAttempt,
} from './clientRequestId';

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

const selection = {
  serviceId: 'home',
  options: { detergent: true },
  quantity: 4,
  durationHours: 4,
  date: '2026-10-20',
  time: 'morning-1',
  address: { district: 'سعادت‌آباد', fullAddress: 'خیابان سرو', plaque: '۱۲', unit: '', floor: '', recipientName: 'علی', contactPhone: '09120000000', addressNotes: '' },
  genderPreference: 'NO_PREFERENCE',
  recurringFrequency: 'ONE_TIME',
  notes: '',
};

describe('unknown network recovery', () => {
  it('keeps the original token after expiry or a same-selection tariff quote', () => {
    const fingerprint = bookingSelectionFingerprint(selection);
    const held: StoredBookingAttempt = {
      id: 'id-v1',
      selectionFingerprint: fingerprint,
      quoteToken: 'token-v1',
      confirmedTotal: 945,
      currencyUnit: 'minor',
      quantity: 4,
      serviceId: 'home',
      options: { detergent: true },
    };
    let created = 0;
    const retry = resolveBookingSubmission(held, fingerprint, {
      quoteToken: 'token-v2',
      confirmedTotal: 945,
      currencyUnit: 'minor',
      quantity: 4,
      serviceId: 'home',
      options: { detergent: true },
    }, () => `id-${++created}`);
    const afterTariff = resolveBookingSubmission(held, fingerprint, {
      quoteToken: 'token-v3',
      confirmedTotal: 1200,
      currencyUnit: 'minor',
      quantity: 4,
      serviceId: 'home',
      options: { detergent: true },
    }, () => `id-${++created}`);
    expect(retry.quoteToken).toBe('token-v1');
    expect(retry.confirmedTotal).toBe(945);
    expect(retry.id).toBe('id-v1');
    expect(afterTariff.quoteToken).toBe('token-v1');
    expect(afterTariff.id).toBe('id-v1');
    expect(created).toBe(0);
  });

  it('does not open a second order while the network result is still unknown', () => {
    const sent: StoredBookingAttempt = {
      id: 'id-v1',
      selectionFingerprint: 'same',
      quoteToken: 'token-v1',
      confirmedTotal: 945,
      currencyUnit: 'minor',
      quantity: 4,
      serviceId: 'home',
      options: {},
    };
    expect(attemptAfterSubmit(sent, { success: false })).toEqual(sent);
    expect(attemptAfterSubmit(sent, { success: false, code: 'ORDER_REQUEST_CONFLICT' })?.id).toBe('id-v1');
    expect(attemptAfterSubmit(sent, { success: true })).toBeNull();
  });

  it('releases the held token only after the server proves no order was saved', () => {
    const sent: StoredBookingAttempt = {
      id: 'id-v1',
      selectionFingerprint: bookingSelectionFingerprint(selection),
      quoteToken: 'token-v1',
      confirmedTotal: 945,
      currencyUnit: 'minor',
      quantity: 4,
      serviceId: 'home',
      options: { detergent: true },
    };
    expect(attemptAfterSubmit(sent, { success: false, code: 'QUOTE_EXPIRED' })).toBeNull();
    const next = resolveBookingSubmission(null, sent.selectionFingerprint, {
      quoteToken: 'token-v2',
      confirmedTotal: 1300,
      currencyUnit: 'minor',
      quantity: 4,
      serviceId: 'home',
      options: { detergent: true },
    }, () => 'id-v2');
    expect(next.id).toBe('id-v2');
    expect(next.quoteToken).toBe('token-v2');
  });
});
