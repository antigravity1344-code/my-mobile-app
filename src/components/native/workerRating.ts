import { toPersianDigits } from '../../utils/jalaliDateOptions';
import { WORKER_STAT_PLACEHOLDER } from './workerHomeModel';

/**
 * میانگین ستارهٔ خود متخصص (D-73). فقط از GET /api/workers/me/rating خوانده می‌شود.
 * پاسخ نامعتبر یا خطا null است و کادر «امتیاز» «—» نشان می‌دهد؛ هیچ عدد ساختگی نمایش داده نمی‌شود.
 */
export const WORKER_RATING_ENDPOINT = '/workers/me/rating';

export type WorkerRating = { average: number | null; count: number };

export function workerRatingFromResponse(response: unknown): WorkerRating | null {
  if (!response || typeof response !== 'object') return null;
  const data = response as { success?: unknown; average?: unknown; count?: unknown };
  if (data.success !== true) return null;
  if (typeof data.count !== 'number' || !Number.isInteger(data.count) || data.count < 0) return null;
  if (data.count === 0) return { average: null, count: 0 };
  if (typeof data.average !== 'number' || !Number.isFinite(data.average) || data.average < 1 || data.average > 5) return null;
  return { average: data.average, count: data.count };
}

/** «۴٫۸ (۱۲ نظر)» از همان اولین ستاره؛ بدون ستاره یا خطا «—». */
export function workerRatingText(rating: WorkerRating | null | undefined): string {
  if (!rating || rating.count <= 0 || rating.average == null) return WORKER_STAT_PLACEHOLDER;
  const average = toPersianDigits(rating.average.toFixed(1)).replace('.', '٫');
  return `${average} (${toPersianDigits(rating.count)} نظر)`;
}
