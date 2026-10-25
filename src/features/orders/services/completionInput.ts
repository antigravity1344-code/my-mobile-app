import type { ApiCompletion } from '../../../api/types';

function digits(value: string): string {
  return value.trim().replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.');
}

/** The worker supplies actual values; an empty draft never becomes a booked estimate. */
export function completionInput(hourly: boolean, hoursText: string, amountText: string):
  { actualHours: number | null; finalAmount: number } | null {
  const amount = digits(amountText), hours = digits(hoursText);
  if (!/^\d+$/.test(amount) || !Number.isSafeInteger(Number(amount))) return null;
  if (hourly && (!/^\d+(?:\.\d{1,2})?$/.test(hours) || Number(hours) <= 0 ||
      !Number.isFinite(Number(hours)) || !Number.isSafeInteger(Math.round(Number(hours) * 100)))) return null;
  return { actualHours: hourly ? Number(hours) : null, finalAmount: Number(amount) };
}

/** Reject malformed server summaries rather than enabling an approval with missing facts. */
export function readCompletion(value: unknown): ApiCompletion | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as ApiCompletion;
  if (typeof c.requestId !== 'string' || !c.requestId.trim() ||
      !['pending', 'disputed', 'completed', 'rejected'].includes(c.status) ||
      !['customer_confirmation', 'worker_only'].includes(c.mode) ||
      !Number.isSafeInteger(c.policyVersion) || c.policyVersion < 0 ||
      !Number.isSafeInteger(c.finalAmount) || c.finalAmount < 0 ||
      (c.actualHours !== null && (typeof c.actualHours !== 'number' || !Number.isFinite(c.actualHours) || c.actualHours <= 0))) return null;
  return c;
}

export function completionStatusText(status: ApiCompletion['status']): string {
  if (status === 'pending') return 'پایان کار ثبت شده و منتظر تأیید مشتری است.';
  if (status === 'disputed') return 'مشتری پایان کار یا مبلغ را تأیید نکرده؛ موضوع در حال بررسی مدیر است.';
  if (status === 'rejected') return 'درخواست پایان کار توسط مدیر رد شده است. اطلاعات را اصلاح و دوباره ثبت کنید.';
  return 'پایان کار تأیید شده است.';
}
