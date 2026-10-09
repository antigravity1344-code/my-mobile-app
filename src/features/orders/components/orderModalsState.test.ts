import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { initialRatingDraft } from './ratingDraft';
import { orderAmountLabel, paymentStatusDisplay } from '../orderStatusLabels';

const screen = readFileSync(join(__dirname, 'OrdersScreen.tsx'), 'utf8');
const detail = readFileSync(join(__dirname, 'OrderDetailModal.tsx'), 'utf8');
const card = readFileSync(join(__dirname, 'OrderCard.tsx'), 'utf8');

describe('rating modal (F3)', () => {
  it('starts empty for an order that has not been rated (no 5★ / tag prefill)', () => {
    expect(initialRatingDraft(undefined)).toEqual({ rating: 0, comment: '', tags: [] });
    expect(initialRatingDraft({ ratings: undefined })).toEqual({ rating: 0, comment: '', tags: [] });
  });

  it('shows what the customer already submitted for a rated order', () => {
    expect(initialRatingDraft({ ratings: { customerRating: 4, customerComment: 'خوب', customerTags: ['وقت‌شناس'] } }))
      .toEqual({ rating: 4, comment: 'خوب', tags: ['وقت‌شناس'] });
  });

  it('is remounted per order so a draft never carries to another order', () => {
    expect(screen).toMatch(/<OrderRatingModal\s+key=\{activeRatingOrder\?\.id/);
  });
});

describe('cancel reason (F4)', () => {
  it('order detail modal is remounted per order so the cancel reason resets', () => {
    expect(screen).toMatch(/<OrderDetailModal\s+key=\{selectedOrder\?\.id/);
  });
});

describe('amount wording (U-new5)', () => {
  it('only says «پرداخت‌شده» when the order is paid', () => {
    expect(orderAmountLabel('PENDING', 'PENDING')).toBe('مبلغ برآوردی');
    expect(orderAmountLabel('IN_PROGRESS', 'PENDING')).toBe('مبلغ برآوردی');
    expect(orderAmountLabel('CANCELLED', 'PENDING')).toBe('مبلغ برآوردی');
    expect(orderAmountLabel('COMPLETED', 'PENDING')).toBe('مبلغ نهایی');
    expect(orderAmountLabel('COMPLETED', 'PAID')).toBe('مبلغ نهایی پرداخت‌شده');
  });

  it('detail and card use the status-aware wording', () => {
    expect(detail).not.toContain('>مبلغ نهایی پرداخت‌شده<');
    expect(detail).toContain('orderAmountLabel(');
    expect(card).toContain('orderAmountLabel(');
  });
});

describe('payment status badge (decision 3)', () => {
  it('green check only for paid; pending is neutral/amber; failed is red', () => {
    expect(paymentStatusDisplay('PAID')).toEqual({ tone: 'paid', label: 'موفق و تایید شده' });
    expect(paymentStatusDisplay('PENDING')).toEqual({ tone: 'pending', label: 'در انتظار پرداخت' });
    expect(paymentStatusDisplay('FAILED')).toEqual({ tone: 'failed', label: 'ناموفق' });
    expect(paymentStatusDisplay(undefined)).toEqual({ tone: 'pending', label: 'در انتظار پرداخت' });
  });

  it('the detail modal no longer hard-codes a green check next to the payment status', () => {
    expect(detail).not.toMatch(/<CheckCircle2 size=\{13\} color="#059669" \/>\s*<Text style=\{styles\.paymentStatusText\}>/);
    expect(detail).toContain('paymentStatusDisplay(');
  });
});
