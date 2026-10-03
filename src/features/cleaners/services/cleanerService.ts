/**
 * بازارگاه آزاد نظافتچی‌ها (قانون ۲) و سطح‌بندی مشتریان (قانون ۳)
 * - مشتری بر اساس پروفایل نظافتچی‌ها انتخاب آزاد دارد؛ بدون پیش‌پرداخت یا بیعانه.
 * - سطح‌بندی خاکستری/نقره‌ای/طلایی بر اساس امتیاز نظافتچی‌ها و معیارهای
 *   خوش‌حسابی، خوش‌قولی، کار مرتب و معرفی مشتری جدید.
 */
import type {
  CleanerProfile,
  CleanerSpecialty,
  CleanerTier,
  CustomerLoyaltyLevel,
  CustomerLoyaltyMetrics,
} from '../types/cleaner';
import { CLEANER_TIER_LABELS, CUSTOMER_LEVEL_LABELS } from '../types/cleaner';

export const cleanerService = {
  /**
   * بازارگاه آزاد: فهرست عمومی نظافتچی‌ها برای انتخاب آزاد مشتری.
   * سرور هنوز مسیر عمومی فهرست متخصصین ندارد؛ تا اضافه‌شدن آن، فهرست خالی برمی‌گردد
   * و رابط کاربری حالت «در حال حاضر متخصصی ثبت نشده» را نشان می‌دهد.
   */
  async listCleaners(_filters?: {
    tier?: CleanerTier;
    specialty?: CleanerSpecialty;
    district?: string;
  }): Promise<CleanerProfile[]> {
    return [];
  },

  async getCleanerById(_cleanerId: string): Promise<CleanerProfile | undefined> {
    return undefined;
  },

  tierLabel(tier: CleanerTier): string {
    return CLEANER_TIER_LABELS[tier];
  },
};

// ── سطح‌بندی مشتریان: خاکستری / نقره‌ای / طلایی ────────────────────────
export const resolveCustomerLoyaltyLevel = (
  metrics: CustomerLoyaltyMetrics,
): CustomerLoyaltyLevel => {
  // امتیاز منفی انباشته، مشتری را ابتدا به سطح پایه برمی‌گرداند
  if (metrics.negativePoints >= 2) return 'GRAY';

  const loyaltyScore =
    metrics.averageCleanerRating * 10 +
    Math.min(metrics.onTimePaymentCount, 20) * 2 +
    Math.min(metrics.fulfilledOrdersCount, 20) * 2 +
    Math.min(metrics.tidyFeedbackCount, 10) * 2 +
    Math.min(metrics.referredCustomersCount, 10) * 5;

  if (loyaltyScore >= 160) return 'GOLD';
  if (loyaltyScore >= 100) return 'SILVER';
  return 'GRAY';
};

export const customerLevelLabel = (level: CustomerLoyaltyLevel): string =>
  CUSTOMER_LEVEL_LABELS[level];
