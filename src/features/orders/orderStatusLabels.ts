import type { OrderStatus } from './types/order';

/**
 * برچسب فارسی وضعیت سفارش برای اپ مشتری (D-06).
 * ACCEPTED یعنی متخصص سفارش را پذیرفته، نه این‌که کار شروع شده؛ شروع واقعی کار هنوز ساخته نشده (D-51).
 */
export const CUSTOMER_ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'در انتظار تأیید',
  ACCEPTED: 'پذیرفته‌شده',
  CONFIRMED: 'تأیید شده',
  ASSIGNED: 'تخصیص متخصص',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'انجام شده',
  CANCELLED: 'لغو شده',
  UNKNOWN: 'وضعیت نامشخص',
};

/**
 * عنوان مبلغ سفارش بر اساس وضعیت: تا پیش از انجام کار «مبلغ برآوردی»، پس از انجام «مبلغ نهایی»،
 * و فقط وقتی پرداخت ثبت شده «مبلغ نهایی پرداخت‌شده».
 */
export function orderAmountLabel(status: OrderStatus, paymentStatus?: string): string {
  if (paymentStatus === 'PAID') return 'مبلغ نهایی پرداخت‌شده';
  if (status === 'COMPLETED') return 'مبلغ نهایی';
  return 'مبلغ برآوردی';
}

export type PaymentStatusTone = 'paid' | 'pending' | 'failed';

/** وضعیت پرداخت برای نمایش: تیک سبز فقط برای پرداخت‌شده؛ در انتظار خنثی/کهربایی، ناموفق قرمز. */
export function paymentStatusDisplay(paymentStatus?: string): { tone: PaymentStatusTone; label: string } {
  if (paymentStatus === 'PAID') return { tone: 'paid', label: 'موفق و تایید شده' };
  if (paymentStatus === 'FAILED') return { tone: 'failed', label: 'ناموفق' };
  return { tone: 'pending', label: 'در انتظار پرداخت' };
}
