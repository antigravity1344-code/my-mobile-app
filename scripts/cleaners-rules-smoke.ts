/**
 * تست دود قوانین تجاری ماژول نظافتچی‌ها — اجرا: npx tsx scripts/cleaners-rules-smoke.ts
 */
import {
  calculateTieredPrice,
  isTierUpliftWithinPolicy,
  authorizeCancellation,
  validateCleanerSignup,
  startLateCancelFlow,
  resolveLateCancelDecision,
  allocateCleanerCompensation,
  resolveCustomerLoyaltyLevel,
  isLateCancellation,
} from '../src/features/cleaners';

const results: string[] = [];
const check = (name: string, ok: boolean, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} — ${name} ${extra}`);
};

// قانون ۱: قیمت‌گذاری ۳۰-۴۰٪ و کمیسیون به همان نسبت کمتر
const mid = calculateTieredPrice(1_000_000, 'MID');
const vip = calculateTieredPrice(1_000_000, 'VIP');
const std = calculateTieredPrice(1_000_000, 'STANDARD');
check('قیمت متوسط ۳۰٪ بالاتر', mid.finalPrice === 1_300_000, `(دریافت: ${mid.finalPrice})`);
check('قیمت VIP ۴۰٪ بالاتر', vip.finalPrice === 1_400_000, `(دریافت: ${vip.finalPrice})`);
check('کمیسیون متوسط ۳۰٪ کمتر', Math.abs(mid.commissionRate - 0.14) < 1e-9, `(نرخ: ${mid.commissionRate})`);
check('کمیسیون VIP ۴۰٪ کمتر', vip.commissionRate === 0.12, `(نرخ: ${vip.commissionRate})`);
check('کمیسیون معمولی پایه ۲۰٪', std.commissionRate === 0.2);
check('سیاست بازه ۳۰-۴۰٪ رعایت شده', isTierUpliftWithinPolicy('MID') && isTierUpliftWithinPolicy('VIP'));

// قانون ۳ و ۵: لغو
check(
  'نظافتچی حق لغو ندارد',
  !authorizeCancellation({ actor: 'CLEANER', orderId: 'o', startsAtISO: new Date().toISOString() }).allowed,
);
const lateIso = new Date(Date.now() + 2 * 3_600_000).toISOString();
const lateAuth = authorizeCancellation({ actor: 'CUSTOMER', orderId: 'o', startsAtISO: lateIso });
check('لغو دیرهنگام مشتری نیازمند پرسش ایاب و ذهاب است', lateAuth.requiresTravelFeeConsent);
check('لغو دیرهنگام تشخیص داده شد', isLateCancellation(lateIso));

const consentEmpty = validateCleanerSignup({ acceptedRuleKeys: [], acceptedIdentityCheck: false });
check('ثبت‌نام بدون تایید قوانین مسدود است', !consentEmpty.valid, `(${consentEmpty.errors.length} خطا)`);
const consentFull = validateCleanerSignup({
  acceptedRuleKeys: [
    'CUSTOMER_CAN_CANCEL_ANYTIME_UNTIL_SETTLEMENT',
    'CLEANER_CANNOT_CANCEL_ORDER',
    'LATE_CANCEL_TRAVEL_FEE_CONSENT',
    'LATE_CANCEL_REFUSAL_NEGATIVE_POINT',
  ],
  acceptedIdentityCheck: true,
});
check('ثبت‌نام با تایید کامل قوانین مجاز است', consentFull.valid);

// فرآیند لغو دیرهنگام
check(
  'پاسخ بله → درگاه پرداخت',
  resolveLateCancelDecision(startLateCancelFlow('o1'), 'ACCEPT_TRAVEL_FEE').step === 'REDIRECT_TO_PAYMENT_GATEWAY',
);
check(
  'پاسخ خیر → امتیاز منفی',
  resolveLateCancelDecision(startLateCancelFlow('o1'), 'REFUSE_TRAVEL_FEE').step === 'APPLY_NEGATIVE_POINT',
);

// قانون ۴: جبران خسارت از صندوق مدیریت
const comp = allocateCleanerCompensation({ orderId: 'o1', cleanerId: 'c1', lostHours: 4, hourlyRate: 150_000 });
check('جبران خسارت از صندوق مدیریت', comp.amount === 600_000 && comp.source === 'MANAGEMENT_FUND');

// سطح‌بندی مشتریان
check(
  'سطح طلایی مشتری ممتاز',
  resolveCustomerLoyaltyLevel({ averageCleanerRating: 5, onTimePaymentCount: 20, fulfilledOrdersCount: 20, tidyFeedbackCount: 10, referredCustomersCount: 10, negativePoints: 0 }) === 'GOLD',
);
check(
  'امتیاز منفی → سطح خاکستری',
  resolveCustomerLoyaltyLevel({ averageCleanerRating: 5, onTimePaymentCount: 20, fulfilledOrdersCount: 20, tidyFeedbackCount: 10, referredCustomersCount: 10, negativePoints: 3 }) === 'GRAY',
);

// eslint-disable-next-line no-console
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
