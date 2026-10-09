import type { OrderRatingData } from '../types/order';

export type RatingDraft = { rating: number; comment: string; tags: string[] };

/**
 * مقدار اولیه فرم امتیازدهی. سفارشِ امتیازنگرفته خالی شروع می‌شود (بدون ۵ ستاره یا برچسب پیش‌فرض)؛
 * سفارشی که قبلاً امتیاز گرفته همان مقدار ثبت‌شده را نشان می‌دهد.
 */
export function initialRatingDraft(order: { ratings?: Partial<OrderRatingData> } | undefined): RatingDraft {
  const ratings = order?.ratings;
  const rating = typeof ratings?.customerRating === 'number' && ratings.customerRating > 0 ? ratings.customerRating : 0;
  return {
    rating,
    comment: typeof ratings?.customerComment === 'string' ? ratings.customerComment : '',
    tags: Array.isArray(ratings?.customerTags) ? [...ratings.customerTags] : [],
  };
}
