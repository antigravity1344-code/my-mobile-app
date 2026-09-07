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

const MOCK_CLEANERS: CleanerProfile[] = [
  {
    id: 'CLN-801',
    fullName: 'مریم مرادی',
    phone: '۰۹۳۵۱۱۱۴۴۵۵',
    tier: 'VIP',
    specialties: ['HOME_UNIT', 'OFFICE_COMPANY'],
    district: 'سعادت‌آباد',
    rating: 4.9,
    completedJobsCount: 142,
    bio: 'متخصص نظافت منازل و اداری با تجهیزات کامل و ۵ سال سابقه حرفه‌ای.',
    isVerified: true,
    avatarColor: '#0284c7',
  },
  {
    id: 'CLN-604',
    fullName: 'رضا کریمی',
    phone: '۰۹۱۹۳۳۳۷۷۸۸',
    tier: 'MID',
    specialties: ['SOFA_CARPET_WASHING', 'HOME_UNIT'],
    district: 'شهرک غرب',
    rating: 4.8,
    completedJobsCount: 98,
    bio: 'مبل‌شویی و فرش‌شویی در محل با دستگاه بخارشور صنعتی.',
    isVerified: true,
    avatarColor: '#059669',
  },
  {
    id: 'CLN-512',
    fullName: 'صادق حسینی',
    phone: '۰۹۱۲۹۹۹۳۳۲۲',
    tier: 'VIP',
    specialties: ['OFFICE_COMPANY', 'STAIRCASE_COMMON_AREAS'],
    district: 'ونک',
    rating: 4.95,
    completedJobsCount: 215,
    bio: 'مدیریت تیم‌های نظافت اداری و مشاعات با قراردادهای سازمانی.',
    isVerified: true,
    avatarColor: '#7c3aed',
  },
  {
    id: 'CLN-330',
    fullName: 'زهرا احمدی',
    phone: '۰۹۱۰۲۲۲۸۸۷۷',
    tier: 'STANDARD',
    specialties: ['HOME_UNIT', 'STAIRCASE_COMMON_AREAS'],
    district: 'پونک',
    rating: 4.6,
    completedJobsCount: 54,
    bio: 'نظافت منازل با قیمت اقتصادی و ظرفیت رزرو منعطف.',
    isVerified: true,
    avatarColor: '#d97706',
  },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const cleanerService = {
  /** بازارگاه آزاد: فهرست عمومی نظافتچی‌ها برای انتخاب آزاد مشتری */
  async listCleaners(filters?: {
    tier?: CleanerTier;
    specialty?: CleanerSpecialty;
    district?: string;
  }): Promise<CleanerProfile[]> {
    await wait(150);
    let result = [...MOCK_CLEANERS];
    if (filters?.tier) result = result.filter((c) => c.tier === filters.tier);
    if (filters?.specialty) {
      result = result.filter((c) => c.specialties.includes(filters.specialty!));
    }
    if (filters?.district) {
      result = result.filter((c) => c.district.includes(filters.district!));
    }
    return result;
  },

  async getCleanerById(cleanerId: string): Promise<CleanerProfile | undefined> {
    await wait(100);
    return MOCK_CLEANERS.find((c) => c.id === cleanerId);
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
