/**
 * منطق قیمت‌گذاری و کمیسیون نظافتچی‌ها (قانون ۱)
 * هزینه خدمات سطح متوسط و VIP بین ۳۰ تا ۴۰٪ بیشتر از سطح معمولی؛
 * کمیسیون نیز به همان نسبت کمتر است.
 */
import type { CleanerTier } from '../types/cleaner';
import {
  CLEANER_TIER_PRICE_MULTIPLIER,
  CLEANER_TIER_COMMISSION_DISCOUNT,
  BASE_PLATFORM_COMMISSION_RATE,
} from '../types/cleaner';

export interface TieredPriceResult {
  /** مبلغ پایه (سطح معمولی) */
  basePrice: number;
  tier: CleanerTier;
  /** مبلغ نهایی پس از ضریب سطح */
  finalPrice: number;
  /** درصد افزایش نسبت به سطح معمولی */
  upliftRate: number;
  /** درصد کمیسیون پلتفرم از نظافتچی */
  commissionRate: number;
  /** مبلغ کمیسیون پلتفرم */
  commissionAmount: number;
  /** سهم خالص نظافتچی */
  cleanerNetAmount: number;
}

export const getTierUpliftRate = (tier: CleanerTier): number =>
  CLEANER_TIER_PRICE_MULTIPLIER[tier] - 1;

export const getTierCommissionRate = (tier: CleanerTier): number =>
  BASE_PLATFORM_COMMISSION_RATE * (1 - CLEANER_TIER_COMMISSION_DISCOUNT[tier]);

export const calculateTieredPrice = (
  basePrice: number,
  tier: CleanerTier,
): TieredPriceResult => {
  const finalPrice = Math.round(basePrice * CLEANER_TIER_PRICE_MULTIPLIER[tier]);
  const commissionRate = getTierCommissionRate(tier);
  const commissionAmount = Math.round(finalPrice * commissionRate);

  return {
    basePrice,
    tier,
    finalPrice,
    upliftRate: getTierUpliftRate(tier),
    commissionRate,
    commissionAmount,
    cleanerNetAmount: finalPrice - commissionAmount,
  };
};

/**
 * بررسی سازگاری ضریب سطح با بازه تجاری مصوب (۳۰ تا ۴۰٪ برای سطوح بالاتر از معمولی).
 * برای تست و نگهداری؛ در اجرای فرآیند به‌صورت خودکار رعایت می‌شود.
 */
export const isTierUpliftWithinPolicy = (tier: CleanerTier): boolean => {
  if (tier === 'STANDARD') return CLEANER_TIER_PRICE_MULTIPLIER[tier] === 1;
  const rate = getTierUpliftRate(tier);
  return rate >= 0.3 && rate <= 0.4;
};
