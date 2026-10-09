import { describe, expect, it } from 'vitest';

import { CUSTOMER_ORDER_STATUS_LABELS } from './orderStatusLabels';

describe('customer order status labels (E6)', () => {
  it('calls an accepted order «پذیرفته‌شده», not «در حال انجام» (no real start step yet)', () => {
    expect(CUSTOMER_ORDER_STATUS_LABELS.ACCEPTED).toBe('پذیرفته‌شده');
    expect(CUSTOMER_ORDER_STATUS_LABELS.IN_PROGRESS).toBe('در حال انجام');
  });

  it('has a Persian label for every status', () => {
    expect(CUSTOMER_ORDER_STATUS_LABELS).toEqual({
      PENDING: 'در انتظار تأیید',
      ACCEPTED: 'پذیرفته‌شده',
      CONFIRMED: 'تأیید شده',
      ASSIGNED: 'تخصیص متخصص',
      IN_PROGRESS: 'در حال انجام',
      COMPLETED: 'انجام شده',
      CANCELLED: 'لغو شده',
      UNKNOWN: 'وضعیت نامشخص',
    });
  });
});
