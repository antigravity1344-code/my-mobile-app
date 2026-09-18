/**
 * قوانین لغو سفارش (قوانین ۳، ۴ و ۵)
 * - لغو توسط مشتری تا اتمام کار و تسویه‌حساب همیشه مجاز است.
 * - لغو توسط نظافتچی به هیچ عنوان مجاز نیست (بدون دکمه لغو).
 * - لغو دیرهنگام: پرسش هزینه ایاب و ذهاب → پرداخت (درگاه) یا امتیاز منفی.
 * - جبران خسارت نظافتچی از «صندوق مدیریت».
 */
import type {
  CancellationRule,
  CancellationRuleKey,
  CompensationRecord,
  LateCancelDecision,
  LateCancelFlowState,
} from '../types/cleaner';
import { CANCELLATION_RULES } from '../types/cleaner';

// ── آستانه لغو دیرهنگام (تنها ثابت فرآیندی قوانین) ────────────────────
/** سفارشی که کمتر از این مقدار ساعت تا شروع باقی داشته باشد، «دیرهنگام/لحظه‌آخری» است */
export const LATE_CANCEL_THRESHOLD_HOURS = 12;

/** هزینه ایاب و ذهاب پیش‌فرض قابل پیشنهاد به مشتری در لغو دیرهنگام */
export const TRAVEL_FEE_AMOUNT = 80_000;

export const getCancellationRules = (): readonly CancellationRule[] => CANCELLATION_RULES;

export const getCancellationRuleByKey = (
  key: CancellationRuleKey,
): CancellationRule | undefined =>
  CANCELLATION_RULES.find((rule) => rule.key === key);

/** آیا مشتری مجاز به لغو است؟ (تا اتمام کار و تسویه‌حساب) */
export const isCustomerCancellationAllowed = (
  orderStatus: 'PENDING' | 'CONFIRMED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
  isSettled: boolean,
): boolean => orderStatus !== 'CANCELLED' && !isSettled && orderStatus !== 'COMPLETED' || (orderStatus === 'COMPLETED' && !isSettled);

/** قانون ۵: نظافتچی به هیچ عنوان حق لغو ندارد */
export const isCleanerCancellationAllowed = (): boolean => false;

/** آیا لغو، دیرهنگام/لحظه‌آخری محسوب می‌شود؟ */
export const isLateCancellation = (startsAtISO: string, now: Date = new Date()): boolean => {
  const startsAt = new Date(startsAtISO).getTime();
  const diffHours = (startsAt - now.getTime()) / (60 * 60 * 1000);
  return diffHours < LATE_CANCEL_THRESHOLD_HOURS;
};

// ── فرآیند لغو دیرهنگام مشتری ─────────────────────────────────────────
/**
 * مرحله ۱: پیش از پذیرش لغو دیرهنگام، از مشتری پرسیده می‌شود:
 * «آیا حاضرید مبلغی بابت هزینه ایاب و ذهاب به متخصص بدهید؟»
 */
export const startLateCancelFlow = (orderId: string): LateCancelFlowState => ({
  orderId,
  step: 'ASK_TRAVEL_FEE_CONSENT',
  travelFeeAmount: TRAVEL_FEE_AMOUNT,
});

/** مرحله ۲: بر اساس پاسخ مشتری مسیر پرداخت یا امتیاز منفی تعیین می‌شود */
export const resolveLateCancelDecision = (
  state: LateCancelFlowState,
  decision: LateCancelDecision,
): LateCancelFlowState => {
  if (decision === 'ACCEPT_TRAVEL_FEE') {
    // پاسخ «بله» → هدایت به درگاه پرداخت
    return { ...state, step: 'REDIRECT_TO_PAYMENT_GATEWAY' };
  }
  // پاسخ «خیر» → امتیاز منفی به مشتری
  return { ...state, step: 'APPLY_NEGATIVE_POINT', negativePointsApplied: 1 };
};

/** مرحله ۳: پس از پرداخت موفق یا اعمال امتیاز منفی، لغو قطعی می‌شود */
export const confirmLateCancellation = (
  state: LateCancelFlowState,
  compensation?: CompensationRecord,
): LateCancelFlowState => ({
  ...state,
  step: 'CANCEL_CONFIRMED',
  compensation,
});

// ── قانون ۴: جبران خسارت نظافتچی از صندوق مدیریت ──────────────────────
/**
 * تخصیص خسارت به نظافتچی از «صندوق مدیریت» برای جبران زمان از دست‌رفته.
 */
export const allocateCleanerCompensation = (
  params: {
    orderId: string;
    cleanerId: string;
    /** ساعتی که متخصص از دست داده است */
    lostHours: number;
    /** نرخ ساعتی پایه سطح نظافتچی */
    hourlyRate: number;
  },
  now: Date = new Date(),
): CompensationRecord => ({
  id: `CMP-${now.getTime()}-${params.orderId}`,
  orderId: params.orderId,
  cleanerId: params.cleanerId,
  amount: Math.round(params.lostHours * params.hourlyRate),
  reason: 'جبران زمان از دست‌رفته متخصص در اثر لغو دیرهنگام سفارش — از صندوق مدیریت',
  source: 'MANAGEMENT_FUND',
  createdAt: now.toISOString(),
});
