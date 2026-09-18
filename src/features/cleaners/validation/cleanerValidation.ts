/**
 * توابع اعتبارسنجی ماژول نظافتچی‌ها
 * - تیک تایید قوانین لغو پیش از ادامه ثبت‌نام/احراز هویت (قانون ۳)
 * - ممنوعیت لغو توسط نظافتچی (قانون ۵)
 * - اعتبارسنجی فرآیند لغو دیرهنگام مشتری (قانون ۳)
 */
import type { CleanerProfile, CleanerTier, CustomerLoyaltyMetrics } from '../types/cleaner';
import { CANCELLATION_RULES } from '../types/cleaner';
import { isLateCancellation } from '../services/cancellationRules';

export interface SignupConsentState {
  /** تیک‌های تایید قوانین لغو — هر قانون باید جداگانه تایید شود */
  acceptedRuleKeys: string[];
  acceptedIdentityCheck: boolean;
}

/** کلیدهای الزامی تایید قوانین لغو در ثبت‌نام نظافتچی */
export const REQUIRED_CONSENT_RULE_KEYS = CANCELLATION_RULES.map((rule) => rule.key);

export interface SignupValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * نظافتچی بدون تایید همه قوانین لغو، اجازه ادامه مراحل ثبت‌نام و
 * احراز هویت ندارد (قانون ۳: تیک مورد نظر).
 */
export const validateCleanerSignup = (
  consent: SignupConsentState,
): SignupValidationResult => {
  const errors: string[] = [];

  for (const key of REQUIRED_CONSENT_RULE_KEYS) {
    if (!consent.acceptedRuleKeys.includes(key)) {
      const rule = CANCELLATION_RULES.find((r) => r.key === key);
      errors.push(`تایید قوانین «${rule?.title ?? key}» الزامی است.`);
    }
  }

  if (!consent.acceptedIdentityCheck) {
    errors.push('تایید فرآیند احراز هویت الزامی است.');
  }

  return { valid: errors.length === 0, errors };
};

/** پروفایل نظافتچی فقط با تایید کامل قوانین قابل احراز هویت است */
export const canCompleteIdentityVerification = (consent: SignupConsentState): boolean =>
  validateCleanerSignup(consent).valid;

// ── قانون ۵: ممنوعیت لغو توسط نظافتچی ─────────────────────────────────
export interface CancellationAttempt {
  actor: 'CUSTOMER' | 'CLEANER' | 'MANAGEMENT';
  orderId: string;
  startsAtISO: string;
  now?: Date;
}

export interface CancellationAuthorization {
  allowed: boolean;
  requiresTravelFeeConsent: boolean;
  message: string;
}

/**
 * تنها مرجع تصمیم برای لغو سفارش.
 * - نظافتچی: هرگز مجاز نیست (بدون دکمه لغو).
 * - مشتری: مجاز؛ در لغو دیرهنگام ابتدا پرسش هزینه ایاب و ذهاب مطرح می‌شود.
 * - مدیر: برای فورس‌ماژور مجاز است.
 */
export const authorizeCancellation = (attempt: CancellationAttempt): CancellationAuthorization => {
  if (attempt.actor === 'CLEANER') {
    return {
      allowed: false,
      requiresTravelFeeConsent: false,
      message:
        'لغو سفارش توسط نظافتچی امکان‌پذیر نیست. در صورت ضرورت، با هماهنگی، خود مشتری سفارش را لغو می‌کند یا فرآیند لغو توسط مدیر انجام می‌شود.',
    };
  }

  const late = isLateCancellation(attempt.startsAtISO, attempt.now);
  return {
    allowed: true,
    requiresTravelFeeConsent: attempt.actor === 'CUSTOMER' && late,
    message: late
      ? 'لغو دیرهنگام: پیش از پذیرش لغو، پرسش هزینه ایاب و ذهاب به مشتری نمایش داده شود.'
      : 'لغو توسط مشتری در هر زمان مجاز است.',
  };
};

// ── اعتبارسنجی داده‌های نظافتچی در ثبت‌نام ─────────────────────────────
export const validateCleanerProfile = (profile: {
  fullName: string;
  phone: string;
  tier: CleanerTier;
  specialties: CleanerProfile['specialties'];
  district: string;
}): SignupValidationResult => {
  const errors: string[] = [];
  if (profile.fullName.trim().length < 3) errors.push('نام و نام خانوادگی کامل وارد شود.');
  if (!/^09[0-9]{9}$/.test(profile.phone.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))) {
    errors.push('شماره موبایل معتبر نیست.');
  }
  if (profile.specialties.length === 0) errors.push('حداقل یک حوزه تخصص انتخاب شود.');
  if (!profile.district.trim()) errors.push('محله فعالیت انتخاب نشده است.');
  return { valid: errors.length === 0, errors };
};

/** اعتبارسنجی حداقلی معیارهای سطح‌بندی مشتریان */
export const validateCustomerLoyaltyMetrics = (
  metrics: CustomerLoyaltyMetrics,
): SignupValidationResult => {
  const errors: string[] = [];
  if (metrics.averageCleanerRating < 0 || metrics.averageCleanerRating > 5) {
    errors.push('میانگین امتیاز نظافتچی‌ها باید بین ۰ تا ۵ باشد.');
  }
  const counts = [
    metrics.onTimePaymentCount,
    metrics.fulfilledOrdersCount,
    metrics.tidyFeedbackCount,
    metrics.referredCustomersCount,
    metrics.negativePoints,
  ];
  if (counts.some((n) => !Number.isInteger(n) || n < 0)) {
    errors.push('شمارنده‌های معیارها باید اعداد صحیح نامنفی باشند.');
  }
  return { valid: errors.length === 0, errors };
};
