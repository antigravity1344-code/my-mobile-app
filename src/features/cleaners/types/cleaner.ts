/**
 * تایپ‌های ماژول مدیریت نظافتچی‌ها
 * مبتنی بر قوانین تجاری مصوب — بدون هیچ پیش‌فرض اضافی.
 */

// ── قانون ۱: دسته‌بندی سه‌سطحی نظافتچی‌ها ─────────────────────────────
export type CleanerTier = 'STANDARD' | 'MID' | 'VIP';

export const CLEANER_TIER_LABELS: Record<CleanerTier, string> = {
  STANDARD: 'معمولی',
  MID: 'متوسط',
  VIP: 'VIP',
};

/**
 * ضرایب قیمت‌گذاری نسبت به سطح معمولی (قانون ۱):
 * - متوسط: بین ۳۰ تا ۴۰٪ بیشتر → ۱.۳۰
 * - VIP: بین ۳۰ تا ۴۰٪ بیشتر → ۱.۴۰
 */
export const CLEANER_TIER_PRICE_MULTIPLIER: Record<CleanerTier, number> = {
  STANDARD: 1.0,
  MID: 1.3,
  VIP: 1.4,
};

/**
 * ضرایب کمیسیون نسبت به کمیسیون سطح معمولی (قانون ۱):
 * «کمیسیون آنها به همین نسبت کمتر باشد»
 * - متوسط: ۳۰٪ کمتر از کمیسیون معمولی
 * - VIP: ۴۰٪ کمتر از کمیسیون معمولی
 */
export const CLEANER_TIER_COMMISSION_DISCOUNT: Record<CleanerTier, number> = {
  STANDARD: 0,
  MID: 0.3,
  VIP: 0.4,
};

/** کمیسیون پایه پلتفرم از سطح معمولی (پایه محاسبه نسبت‌های فوق) */
export const BASE_PLATFORM_COMMISSION_RATE = 0.2;

// ── قانون ۲: بازارگاه آزاد و بدون بیعانه ──────────────────────────────
export type CleanerSpecialty =
  | 'HOME_UNIT'
  | 'STAIRCASE_COMMON_AREAS'
  | 'OFFICE_COMPANY'
  | 'SOFA_CARPET_WASHING';

export interface CleanerProfile {
  id: string;
  fullName: string;
  phone: string;
  tier: CleanerTier;
  specialties: CleanerSpecialty[];
  district: string;
  rating: number;
  completedJobsCount: number;
  bio: string;
  /** وضعیت احراز هویت — تنها پس از تایید قوانین لغو ممکن است فعال شود */
  isVerified: boolean;
  avatarColor: string;
}

// ── قانون ۳: قوانین لغو و تیک تایید هنگام ثبت‌نام ─────────────────────
export type CancellationRuleKey =
  | 'CUSTOMER_CAN_CANCEL_ANYTIME_UNTIL_SETTLEMENT'
  | 'CLEANER_CANNOT_CANCEL_ORDER'
  | 'LATE_CANCEL_TRAVEL_FEE_CONSENT'
  | 'LATE_CANCEL_REFUSAL_NEGATIVE_POINT';

export interface CancellationRule {
  key: CancellationRuleKey;
  title: string;
  description: string;
}

/** متن رسمی قوانین لغو — باید در ثبت‌نام نظافتچی به نمایش درآید */
export const CANCELLATION_RULES: CancellationRule[] = [
  {
    key: 'CUSTOMER_CAN_CANCEL_ANYTIME_UNTIL_SETTLEMENT',
    title: 'حق لغو نامحدود مشتری',
    description:
      'لغو سفارش توسط مشتری در هر زمان امکان دارد و گزینه لغو تا اتمام کار و تسویه‌حساب فعال است.',
  },
  {
    key: 'CLEANER_CANNOT_CANCEL_ORDER',
    title: 'ممنوعیت لغو توسط نظافتچی',
    description:
      'لغو سفارش توسط نظافتچی و متخصصین دیگر (از قبیل مبل‌شو) امکان‌پذیر نیست و دکمه لغو برای ایشان در نظر گرفته نمی‌شود. در صورت ضرورت، با هماهنگی، خودِ مشتری اقدام به لغو سفارش می‌کند.',
  },
  {
    key: 'LATE_CANCEL_TRAVEL_FEE_CONSENT',
    title: 'هزینه ایاب و ذهاب در لغو دیرهنگام',
    description:
      'اگر مشتری سفارش را دیرهنگام یا لحظه‌آخری لغو کند، پیش از پذیرش لغو از او پرسیده می‌شود: «آیا حاضرید مبلغی بابت هزینه ایاب و ذهاب به متخصص بدهید؟» پاسخ مثبت به درگاه پرداخت هدایت می‌شود.',
  },
  {
    key: 'LATE_CANCEL_REFUSAL_NEGATIVE_POINT',
    title: 'امتیاز منفی بابت رد هزینه رفت‌وآمد',
    description:
      'در صورت پاسخ منفی مشتری به پرداخت هزینه ایاب و ذهاب در لغو دیرهنگام، به او امتیاز منفی داده می‌شود.',
  },
];

// ── قانون ۳ (بخش مشتریان): سطح‌بندی مشتریان ───────────────────────────
export type CustomerLoyaltyLevel = 'GRAY' | 'SILVER' | 'GOLD';

export const CUSTOMER_LEVEL_LABELS: Record<CustomerLoyaltyLevel, string> = {
  GRAY: 'خاکستری',
  SILVER: 'نقره‌ای',
  GOLD: 'طلایی',
};

export interface CustomerLoyaltyMetrics {
  /** میانگین امتیاز دریافت‌شده از نظافتچی‌ها (۰ تا ۵) */
  averageCleanerRating: number;
  /** خوش‌حسابی: سابقه پرداخت‌های انجام‌شده بدون بازگشت */
  onTimePaymentCount: number;
  /** خوش‌قولی: تعداد سفارش‌های انجام‌شده بدون لغو */
  fulfilledOrdersCount: number;
  /** نظم و کیفیت کار (بازخورد کیفیت) */
  tidyFeedbackCount: number;
  /** تعداد مشتریانی که توسط این مشتری معرفی شده‌اند */
  referredCustomersCount: number;
  /** امتیاز منفی انباشته (لغوهای بدون پرداخت ایاب و ذهاب) */
  negativePoints: number;
}

// ── قانون ۴: جبران خسارت از صندوق مدیریت ──────────────────────────────
export interface CompensationRecord {
  id: string;
  orderId: string;
  cleanerId: string;
  amount: number;
  reason: string;
  source: 'MANAGEMENT_FUND';
  createdAt: string;
}

// ── نتیجه فرآیند لغو دیرهنگام (پرسش پیش از پذیرش لغو) ─────────────────
export type LateCancelDecision = 'ACCEPT_TRAVEL_FEE' | 'REFUSE_TRAVEL_FEE';

export type LateCancelFlowStep =
  | 'ASK_TRAVEL_FEE_CONSENT'
  | 'REDIRECT_TO_PAYMENT_GATEWAY'
  | 'APPLY_NEGATIVE_POINT'
  | 'CANCEL_CONFIRMED';

export interface LateCancelFlowState {
  orderId: string;
  step: LateCancelFlowStep;
  travelFeeAmount: number;
  compensation?: CompensationRecord;
  negativePointsApplied?: number;
}
