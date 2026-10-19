import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  attemptAfterSubmit,
  resolveBookingSubmission,
  type StoredBookingAttempt,
} from '../../features/orders/services/clientRequestId';
import type { ServerQuote } from '../../features/orders/services/serverQuote';
import { bookingReview, bookingSubmitEnabled, quoteForSubmittedAttempt, RECOVERY_REVIEW_TITLE } from './bookingRecoveryReview';

const fingerprint = 'same-selection';

function heldAttempt(): StoredBookingAttempt {
  return {
    id: 'id-v1',
    selectionFingerprint: fingerprint,
    quoteToken: 'token-v1',
    confirmedTotal: 945,
    currencyUnit: 'minor',
    quantity: 4,
    serviceId: 'home',
    options: { detergent: true },
  };
}

function quote(total: number, token: string): ServerQuote {
  return {
    quoteToken: token,
    subtotal: total,
    surcharges: [{ id: 'peak', amount: 255 }],
    discounts: [{ id: 'promo', amount: 10 }],
    total,
    currencyUnit: 'minor',
    tariffVersionId: 'tariff-new',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

const emptyFresh = {
  quoteToken: '',
  confirmedTotal: 0,
  currencyUnit: '',
  quantity: undefined,
  serviceId: 'home',
  options: { detergent: true },
};

describe('recovery review on web and Android', () => {
  it('resends the held attempt when no fresh quote exists, and a new request still needs one', () => {
    const held = heldAttempt();
    let created = 0;
    const sent = resolveBookingSubmission(held, fingerprint, emptyFresh, () => `id-${++created}`);
    const review = bookingReview({ recovering: true, held, confirmable: false, fresh: null });
    const priced = quoteForSubmittedAttempt(sent, null, true);

    expect(bookingSubmitEnabled({ recovering: true, confirmable: false, submitting: false })).toBe(true);
    expect(review).toEqual({
      kind: 'recovery',
      title: RECOVERY_REVIEW_TITLE,
      amount: 945,
      currencyUnit: 'minor',
    });
    expect(sent).toMatchObject({ id: 'id-v1', quoteToken: 'token-v1', confirmedTotal: 945, currencyUnit: 'minor' });
    expect(priced).toMatchObject({ quoteToken: 'token-v1', total: 945, currencyUnit: 'minor', surcharges: [], discounts: [] });
    expect(review.kind === 'recovery' && review.amount).toBe(priced.total);
    expect(created).toBe(0);
    expect(attemptAfterSubmit(sent, { success: false })?.id).toBe('id-v1');

    expect(bookingSubmitEnabled({ recovering: false, confirmable: false, submitting: false })).toBe(false);
    expect(bookingSubmitEnabled({ recovering: false, confirmable: true, submitting: false })).toBe(true);
    expect(bookingReview({ recovering: false, held: null, confirmable: false, fresh: null }).kind).toBe('none');
  });

  it('shows and posts 945 when a fresh quote is 1200, without a second order', () => {
    const held = heldAttempt();
    const fresh = quote(1200, 'token-v2');
    let created = 0;
    const sent = resolveBookingSubmission(held, fingerprint, {
      quoteToken: fresh.quoteToken,
      confirmedTotal: fresh.total,
      currencyUnit: fresh.currencyUnit,
      quantity: 4,
      serviceId: 'home',
      options: { detergent: true },
    }, () => `id-${++created}`);
    const review = bookingReview({ recovering: true, held, confirmable: true, fresh });
    const priced = quoteForSubmittedAttempt(sent, fresh, true);
    const shown = JSON.stringify(review);
    const posted = JSON.stringify({
      clientRequestId: sent.id,
      quoteToken: sent.quoteToken,
      confirmedTotal: sent.confirmedTotal,
      currencyUnit: sent.currencyUnit,
      total: priced.total,
      surcharges: priced.surcharges,
      discounts: priced.discounts,
    });

    expect(review).toEqual({
      kind: 'recovery',
      title: 'بررسی نتیجه ثبت قبلی',
      amount: 945,
      currencyUnit: 'minor',
    });
    expect(shown).not.toContain('1200');
    expect(shown).not.toContain('peak');
    expect(shown).not.toContain('token-v2');
    expect(posted).toContain('945');
    expect(posted).not.toContain('1200');
    expect(posted).not.toContain('peak');
    expect(sent.id).toBe('id-v1');
    expect(created).toBe(0);
  });

  it('wires the same gate into the Android button and the web button', () => {
    const android = readFileSync(join(__dirname, 'NativeBookingWizard.tsx'), 'utf8');
    const web = readFileSync(join(__dirname, 'BookingWizardContainer.tsx'), 'utf8');
    for (const src of [android, web]) {
      expect(src).toContain('bookingSubmitEnabled(');
      expect(src).toContain('bookingReview(');
      expect(src).toContain('quoteForSubmittedAttempt(');
      expect(src).toContain("review.kind === 'recovery'");
      expect(src).toContain('formatServerAmount(review.amount, review.currencyUnit)');
      expect(src).toContain('if (!recovering && !confirmableServerQuote(');
    }
    expect(android).not.toContain("disabled={submissionState === 'submitting' || !confirmable}");
    expect(web).not.toContain('(confirmable || recovering)');
  });
});
