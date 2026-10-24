/**
 * درجهٔ خود متخصص (D-67، D-71). فقط از GET /api/workers/me/tier خوانده می‌شود.
 * هر پاسخ نامعتبر یا خطا null است تا هیچ درجهٔ ساختگی نمایش داده نشود.
 */
export type WorkerTierKey = 'gray' | 'silver' | 'gold' | 'gold_plus';

export const WORKER_TIER_ENDPOINT = '/workers/me/tier';

const WORKER_TIER_KEYS: readonly string[] = ['gray', 'silver', 'gold', 'gold_plus'];

export function workerTierFromResponse(response: unknown): WorkerTierKey | null {
  if (!response || typeof response !== 'object') return null;
  const data = response as { success?: unknown; tierKey?: unknown };
  if (data.success !== true || typeof data.tierKey !== 'string') return null;
  return WORKER_TIER_KEYS.includes(data.tierKey) ? (data.tierKey as WorkerTierKey) : null;
}

export type WorkerTierBadge = {
  label: string;
  background: string;
  color: string;
  border: string;
  borderWidth: number;
};

/** رنگ‌ها: خاکستری، نقره‌ای و خانوادهٔ طلایی؛ طلایی پلاس با حاشیهٔ پررنگ‌تر از طلایی جدا می‌شود. فیروزه‌ای برند استفاده نمی‌شود (D-40). */
const WORKER_TIER_BADGES: Record<WorkerTierKey, WorkerTierBadge> = {
  gray: { label: 'درجه خاکستری', background: '#E5E7EB', color: '#374151', border: '#9CA3AF', borderWidth: 1 },
  silver: { label: 'درجه نقره‌ای', background: '#F1F5F9', color: '#334155', border: '#94A3B8', borderWidth: 1 },
  gold: { label: 'درجه طلایی', background: '#FEF3C7', color: '#78350F', border: '#D97706', borderWidth: 1 },
  gold_plus: { label: 'درجه طلایی پلاس', background: '#FDE68A', color: '#78350F', border: '#B45309', borderWidth: 2 },
};

export function workerTierBadge(tierKey: WorkerTierKey | null | undefined): WorkerTierBadge | null {
  return tierKey ? WORKER_TIER_BADGES[tierKey] ?? null : null;
}
