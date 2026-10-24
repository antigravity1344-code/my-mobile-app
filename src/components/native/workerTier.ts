/**
 * درجهٔ خود متخصص (D-67، D-71، D-75). داده از GET /api/workers/me/tier می‌آید.
 * خاکستری هرگز به‌صورت برچسب نشان داده نمی‌شود؛ به‌جایش پیشرفت تا درجهٔ بعد می‌آید (D-75).
 * هر پاسخ نامعتبر یا خطا null است تا هیچ چیز نمایش داده نشود.
 */
import { toPersianDigits } from '../../utils/jalaliDateOptions';
// همان رنگ‌های theme/customerHome؛ این فایل بدون وابستگی به react-native می‌ماند تا تست ساده بماند.
const colors = { bg: '#F6F2E6', tealDark: '#0E635D', amberBg: '#FEF3E2', amberText: '#B45309', amberIcon: '#D97706' } as const;

export type WorkerTierKey = 'gray' | 'silver' | 'gold' | 'gold_plus';

export const WORKER_TIER_ENDPOINT = '/workers/me/tier';

const WORKER_TIER_KEYS: readonly string[] = ['gray', 'silver', 'gold', 'gold_plus'];

export function workerTierFromResponse(response: unknown): WorkerTierKey | null {
  if (!response || typeof response !== 'object') return null;
  const data = response as { success?: unknown; tierKey?: unknown };
  if (data.success !== true || typeof data.tierKey !== 'string') return null;
  return WORKER_TIER_KEYS.includes(data.tierKey) ? (data.tierKey as WorkerTierKey) : null;
}

export type WorkerTierNext = {
  tierKey: Exclude<WorkerTierKey, 'gray'>;
  remainingOrders: number;
  remainingPoints: number;
  minRating: number | null;
  ratingMet: boolean;
  progress: number;
};

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function workerTierNextFromResponse(response: unknown): WorkerTierNext | null {
  if (workerTierFromResponse(response) == null) return null;
  const next = (response as { next?: unknown }).next;
  if (!next || typeof next !== 'object') return null;
  const n = next as Record<string, unknown>;
  if (typeof n.tierKey !== 'string' || n.tierKey === 'gray' || !WORKER_TIER_KEYS.includes(n.tierKey)) return null;
  if (!isCount(n.remainingOrders) || !isCount(n.remainingPoints) || typeof n.ratingMet !== 'boolean') return null;
  if (typeof n.progress !== 'number' || !Number.isFinite(n.progress)) return null;
  const minRating = typeof n.minRating === 'number' && n.minRating > 0 && n.minRating <= 5 ? n.minRating : null;
  return {
    tierKey: n.tierKey as WorkerTierNext['tierKey'],
    remainingOrders: n.remainingOrders,
    remainingPoints: n.remainingPoints,
    minRating,
    ratingMet: n.ratingMet,
    progress: Math.min(1, Math.max(0, n.progress)),
  };
}

const TIER_NAMES: Record<WorkerTierKey, string> = {
  gray: 'خاکستری',
  silver: 'نقره‌ای',
  gold: 'طلایی',
  gold_plus: 'طلایی پلاس',
};

const faNumber = (value: number) => toPersianDigits(String(value).replace('.', '٫'));

/** جملهٔ تشویقی پیشرفت؛ اگر چیزی برای گفتن نباشد null. */
export function workerTierProgressText(next: WorkerTierNext | null | undefined): string | null {
  if (!next) return null;
  const name = `سطح ${TIER_NAMES[next.tierKey]}`;
  const parts: string[] = [];
  if (next.remainingOrders > 0) parts.push(`${faNumber(next.remainingOrders)} سفارش`);
  if (next.remainingPoints > 0) parts.push(`${faNumber(next.remainingPoints)} امتیاز`);
  const rating = !next.ratingMet && next.minRating ? `میانگین ستاره ${faNumber(next.minRating)} لازم است` : null;
  if (parts.length > 0) {
    const main = `${parts.join(' و ')} دیگر تا ${name}`;
    return rating ? `${main} · ${rating}` : main;
  }
  if (rating) return `برای ${name} ${rating}`;
  return null;
}

export type WorkerTierBadge = {
  label: string;
  icon: 'medal' | 'star';
  background: string;
  color: string;
  iconColor: string;
  border: string;
  borderWidth: number;
};

/** برچسب کوچک کنار نام؛ خاکستری برچسب ندارد (D-75). رنگ‌ها از تم خانه (کرم و کهربایی). */
const WORKER_TIER_BADGES: Record<Exclude<WorkerTierKey, 'gray'>, WorkerTierBadge> = {
  silver: { label: 'نقره‌ای', icon: 'medal', background: colors.bg, color: colors.tealDark, iconColor: '#94A3B8', border: 'rgba(31, 42, 40, 0.10)', borderWidth: 1 },
  gold: { label: 'طلایی', icon: 'medal', background: colors.amberBg, color: colors.amberText, iconColor: colors.amberIcon, border: 'rgba(217, 119, 6, 0.25)', borderWidth: 1 },
  gold_plus: { label: 'طلایی پلاس', icon: 'star', background: colors.amberBg, color: colors.amberText, iconColor: colors.amberIcon, border: colors.amberIcon, borderWidth: 1.5 },
};

export function workerTierBadge(tierKey: WorkerTierKey | null | undefined): WorkerTierBadge | null {
  if (!tierKey || tierKey === 'gray') return null;
  return WORKER_TIER_BADGES[tierKey] ?? null;
}