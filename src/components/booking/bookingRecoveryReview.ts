import type { StoredBookingAttempt } from '../../features/orders/services/clientRequestId';
import type { ServerQuote } from '../../features/orders/services/serverQuote';

export const RECOVERY_REVIEW_TITLE = 'بررسی نتیجه ثبت قبلی';

export type BookingReview =
  | { kind: 'recovery'; title: typeof RECOVERY_REVIEW_TITLE; amount: number; currencyUnit: string }
  | {
    kind: 'fresh';
    subtotal: number;
    surcharges: ServerQuote['surcharges'];
    discounts: ServerQuote['discounts'];
    total: number;
    currencyUnit: string;
  }
  | { kind: 'none' };

/**
 * Recovery shows only the attempt that was already sent.
 * A fresh quote is visible only for a new confirmation.
 */
export function bookingReview(input: {
  recovering: boolean;
  held: Pick<StoredBookingAttempt, 'confirmedTotal' | 'currencyUnit'> | null;
  confirmable: boolean;
  fresh: ServerQuote | null;
}): BookingReview {
  if (input.recovering && input.held) {
    return {
      kind: 'recovery',
      title: RECOVERY_REVIEW_TITLE,
      amount: input.held.confirmedTotal,
      currencyUnit: input.held.currencyUnit,
    };
  }
  if (input.confirmable && input.fresh) {
    return {
      kind: 'fresh',
      subtotal: input.fresh.subtotal,
      surcharges: input.fresh.surcharges,
      discounts: input.fresh.discounts,
      total: input.fresh.total,
      currencyUnit: input.fresh.currencyUnit,
    };
  }
  return { kind: 'none' };
}

/** An unknown retry can be sent without a new quote. A first request still needs one. */
export function bookingSubmitEnabled(input: {
  recovering: boolean;
  confirmable: boolean;
  submitting: boolean;
}): boolean {
  if (input.submitting) return false;
  if (input.recovering) return true;
  return input.confirmable;
}

/** Local price lines follow the attempt that will be posted. Recovery never copies a newer quote. */
export function quoteForSubmittedAttempt(
  sent: StoredBookingAttempt,
  fresh: ServerQuote | null,
  recovering: boolean,
): ServerQuote {
  if (
    !recovering
    && fresh
    && fresh.quoteToken === sent.quoteToken
    && fresh.total === sent.confirmedTotal
    && fresh.currencyUnit === sent.currencyUnit
  ) {
    return fresh;
  }
  return {
    quoteToken: sent.quoteToken,
    subtotal: sent.confirmedTotal,
    surcharges: [],
    discounts: [],
    total: sent.confirmedTotal,
    currencyUnit: sent.currencyUnit,
    tariffVersionId: 'held',
    expiresAt: '',
  };
}
