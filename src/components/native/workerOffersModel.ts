import { expectedStartAtFromSelection } from '../../utils/expectedStartAt';
import { toPersianDigits } from '../../utils/jalaliDateOptions';

export type WorkerOffer = {
  id: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  adjustmentBasisPoints: number;
  status: 'OPEN' | 'BOOKED' | 'CANCELLED';
  currencyUnit?: string;
  tariffTotal?: number;
  total?: number;
};
export type OffersData = { offers: WorkerOffer[]; minBasisPoints: number; maxBasisPoints: number };
export type OffersResult = { ok: true; data: OffersData } | { ok: false; message: string };
export type OfferActionResult = { ok: true } | { ok: false; message: string };

export const OFFER_STEP_BASIS_POINTS = 500;
export const OFFER_DURATIONS = [2, 3, 4, 5, 6, 8] as const;
export const OFFER_START_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

/** بازهٔ ISO از تاریخ شمسی، ساعت شروع (به وقت تهران) و مدت؛ نامعتبر → null. */
export function offerRangeFromSelection(dateString: string, startHour: number, durationHours: number): { startAt: string; endAt: string } | null {
  if (!Number.isInteger(startHour) || !Number.isInteger(durationHours) || durationHours < 1) return null;
  const startAt = expectedStartAtFromSelection(dateString, `${String(startHour).padStart(2, '0')}:00`);
  if (!startAt) return null;
  return { startAt, endAt: new Date(Date.parse(startAt) + durationHours * 3600000).toISOString() };
}

export function clampBasisPoints(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return Math.min(max, 10000);
  return Math.max(min, Math.min(max, Math.round(value / 100) * 100));
}

export function stepBasisPoints(current: number, direction: 1 | -1, min: number, max: number): number {
  return clampBasisPoints(current + direction * OFFER_STEP_BASIS_POINTS, min, max);
}

/** توضیح درصد نسبت به تعرفه: «۳۰٪ ارزان‌تر از تعرفه»، «برابر تعرفه»، «۱۰٪ بالاتر از تعرفه». */
export function priceDeltaLabel(basisPoints: number): string {
  const delta = Math.round((basisPoints - 10000) / 100);
  if (delta === 0) return 'برابر تعرفهٔ شرکت';
  const percent = toPersianDigits(Math.abs(delta));
  return delta < 0 ? `${percent}٪ ارزان‌تر از تعرفه` : `${percent}٪ بالاتر از تعرفه`;
}

function validOffer(value: unknown): value is WorkerOffer {
  if (!value || typeof value !== 'object') return false;
  const o = value as WorkerOffer;
  return typeof o.id === 'string' && typeof o.serviceId === 'string' && typeof o.startAt === 'string' &&
    typeof o.endAt === 'string' && Number.isSafeInteger(o.adjustmentBasisPoints) &&
    (o.status === 'OPEN' || o.status === 'BOOKED' || o.status === 'CANCELLED');
}

export function parseOffersResponse(result: unknown): OffersData | null {
  if (!result || typeof result !== 'object') return null;
  const data = result as Record<string, unknown>;
  if (data.success !== true || !Array.isArray(data.offers)) return null;
  const min = Number(data.minBasisPoints);
  const max = Number(data.maxBasisPoints);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min <= 0 || max < min) return null;
  return { offers: data.offers.filter(validOffer), minBasisPoints: min, maxBasisPoints: max };
}

export function errorMessage(result: unknown, fallback: string): string {
  if (result && typeof result === 'object') {
    const message = (result as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

