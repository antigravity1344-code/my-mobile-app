import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginPreview, endPreview } from './previewRuntime';
import { submitBooking } from '../../api/booking';
import { requestPayment, verifyPayment } from '../../api/payment';

beforeEach(() => {
  vi.stubGlobal('__DEV__', true);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
  beginPreview('customer');
});
afterEach(() => {
  endPreview();
  delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
  vi.unstubAllGlobals();
});

describe('direct endpoint preview guard', () => {
  it('blocks legacy booking and both payment endpoints before network', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const booking = await submitBooking({} as Parameters<typeof submitBooking>[0]);
    const payment = await requestPayment({ orderId: 'PREVIEW', amount: 100, description: 'sample', mobile: '09000000000' });
    const verification = await verifyPayment('PREVIEW', 100);
    expect(booking.success).toBe(false);
    expect(payment.success).toBe(false);
    expect(verification.success).toBe(false);
    expect(network).not.toHaveBeenCalled();
  });
});
