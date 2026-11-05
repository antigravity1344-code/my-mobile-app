/** پیشنهادی که مشتری در حال رزرو آن است؛ فقط برای نمایش و محدود کردن انتخاب‌ها. قیمت و پنجره را سرور دوباره بررسی می‌کند. */
export type OfferBookingDraft = { offerId: string; startAt: string; endAt: string; workerName: string; minHours: number };

let draft: OfferBookingDraft | null = null;

export function setOfferBookingDraft(value: OfferBookingDraft | null): void {
  draft = value;
}

export function getOfferBookingDraft(): OfferBookingDraft | null {
  return draft;
}

/** مدت‌های قابل انتخاب (ساعت) که کاملاً داخل بازهٔ پیشنهاد جا می‌شوند. */
export function offerDurationChoices(startAt: string, endAt: string, minHours = 1): number[] {
  const windowHours = Math.floor((Date.parse(endAt) - Date.parse(startAt)) / 3600000);
  if (!Number.isFinite(windowHours) || windowHours < minHours) return [];
  const out: number[] = [];
  for (let hours = minHours; hours <= Math.min(windowHours, 8); hours += 1) out.push(hours);
  return out;
}
