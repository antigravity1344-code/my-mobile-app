import { toPersianDigits } from '../../utils/jalaliDateOptions';

/** متن ثابت صفحه پشتیبانی؛ طبق تصمیم صاحب محصول هیچ نامی نوشته نمی‌شود. */
export const SUPPORT_GREETING = 'سوال‌های متداول را ببینید یا با پشتیبانی تماس بگیرید.';

/** «از طرف شماره» با ارقام فارسی؛ بدون نام. بدون شماره، خالی. */
export function supportSenderLine(phone: string | null | undefined): string {
  const p = toPersianDigits((phone || '').trim());
  return p ? `از طرف ${p}` : '';
}
