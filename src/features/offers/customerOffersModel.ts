import { gregorianToJalali } from '../../utils/pricing';
import { toPersianDigits } from '../../utils/jalaliDateOptions';
import { tehranWallParts } from '../../utils/jalaliDisplay';

export type CustomerOffer = {
  id: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  adjustmentBasisPoints: number;
  currencyUnit?: string;
  quantity?: number;
  tariffTotal?: number;
  total?: number;
  worker: { name: string; avatar: string; tierKey: string; ratingAverage: number | null; ratingCount: number };
};

function parseOffer(value: unknown): CustomerOffer | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const w = o.worker as Record<string, unknown> | undefined;
  if (typeof o.id !== 'string' || typeof o.serviceId !== 'string' || typeof o.startAt !== 'string' || typeof o.endAt !== 'string') return null;
  if (!Number.isSafeInteger(o.adjustmentBasisPoints) || !w || typeof w !== 'object') return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  return {
    id: o.id, serviceId: o.serviceId, startAt: o.startAt, endAt: o.endAt,
    adjustmentBasisPoints: o.adjustmentBasisPoints as number,
    currencyUnit: typeof o.currencyUnit === 'string' ? o.currencyUnit : undefined,
    quantity: num(o.quantity), tariffTotal: num(o.tariffTotal), total: num(o.total),
    worker: {
      name: typeof w.name === 'string' && w.name ? w.name : 'متخصص',
      avatar: typeof w.avatar === 'string' ? w.avatar : '',
      tierKey: typeof w.tierKey === 'string' ? w.tierKey : 'gray',
      ratingAverage: num(w.ratingAverage) ?? null,
      ratingCount: num(w.ratingCount) ?? 0,
    },
  };
}

export function parseCustomerOffers(result: unknown): CustomerOffer[] | null {
  if (!result || typeof result !== 'object') return null;
  const data = result as { success?: unknown; offers?: unknown };
  if (data.success !== true || !Array.isArray(data.offers)) return null;
  return data.offers.map(parseOffer).filter((x): x is CustomerOffer => x !== null);
}

const TIER_LABEL: Record<string, string> = { gold: 'طلایی', silver: 'نقره‌ای', gray: 'عادی' };
export const tierLabel = (tierKey: string): string => TIER_LABEL[tierKey] || 'عادی';

/** تاریخ شمسی و ساعت شروع به وقت تهران برای پر کردن فرم رزرو. */
export function offerStartSelection(startAt: string): { dateString: string; startTime: string; dayOfMonth: number; monthYear: [number, number] } | null {
  const ms = Date.parse(startAt);
  if (!Number.isFinite(ms)) return null;
  const wall = tehranWallParts(ms);
  const [jy, jm, jd] = gregorianToJalali(wall.year, wall.month, wall.day);
  return {
    dateString: `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`,
    startTime: `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`,
    dayOfMonth: jd,
    monthYear: [jy, jm],
  };
}

export function formatOfferPrice(total: number | undefined, unit: string | undefined): string {
  if (total == null) return '';
  const label = unit === 'toman' ? 'تومان' : unit === 'rial' ? 'ریال' : unit || '';
  return `${toPersianDigits(total.toLocaleString('en-US'))} ${label}`.trim();
}
