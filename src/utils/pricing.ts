import type { CleaningService } from '../types/service';

export type PricingOptions = Record<string, string | number | boolean>;
export type RecurringFrequency = 'ONE_TIME' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type CustomerTier = 'NEW' | 'SILVER' | 'GOLD' | 'VIP';

export interface LoyaltyPricingOptions {
  recurringFrequency?: RecurringFrequency;
  isFirstRecurringInvoice?: boolean;
  customerTier?: CustomerTier;
  today?: Date;
}

export interface FinalPrice {
  subtotal: number;
  earlyBirdDiscountRate: number;
  earlyBirdDiscountAmount: number;
  tierDiscountRate: number;
  tierDiscountAmount: number;
  recurringDiscountRate: number;
  recurringDiscountAmount: number;
  discountRate: number;
  discountAmount: number;
  recurringDiscountDeferred: boolean;
  total: number;
}

const normalizeDigits = (value: string) =>
  value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

const jalaliToGregorian = (year: number, month: number, day: number): [number, number, number] => {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2294, 2342, 2382, 2394, 2403, 2407, 2409, 2411];
  const gy = year + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  for (const breakpoint of breaks.slice(1)) {
    jump = breakpoint - jp;
    if (year < breakpoint) break;
    leapJ += Math.floor(jump / 33) * 8 + Math.floor((jump % 33) / 4);
    jp = breakpoint;
  }
  const n = year - jp;
  leapJ += Math.floor(n / 33) * 8 + Math.floor(((n % 33) + 3) / 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = Math.floor(gy / 4) - Math.floor((Math.floor(gy / 100) + 1) * 3 / 4) - 150;
  const march = 20 + leapJ - leapG;
  const ordinal = month <= 6 ? (month - 1) * 31 + day : (month - 1) * 30 + day + 6;
  const date = new Date(Date.UTC(gy, 2, march));
  date.setUTCDate(date.getUTCDate() + ordinal - 80);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
};

const parseDateOnly = (value: string): Date => {
  const parts = normalizeDigits(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return new Date(Number.NaN);
  }
  const [year, month, day] = parts;
  const [gregorianYear, gregorianMonth, gregorianDay] =
    year >= 1200 && year < 1600 ? jalaliToGregorian(year, month, day) : [year, month, day];
  return new Date(Date.UTC(gregorianYear, gregorianMonth - 1, gregorianDay));
};

export const getEarlyBirdDiscountRate = (serviceDate: string, today = new Date()): number => {
  const target = parseDateOnly(serviceDate);
  const todayDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const daysUntilService = Math.round((target.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000));
  if (daysUntilService >= 30) return 0.1;
  if (daysUntilService >= 7) return 0.05;
  return 0;
};

export const getRecurringDiscountRate = (frequency: RecurringFrequency = 'ONE_TIME'): number => {
  if (frequency === 'MONTHLY') return 0.15;
  if (frequency === 'BIWEEKLY') return 0.1;
  if (frequency === 'WEEKLY') return 0.05;
  return 0;
};

export const getCustomerTierDiscountRate = (tier: CustomerTier = 'NEW'): number => {
  if (tier === 'VIP') return 0.08;
  if (tier === 'GOLD') return 0.05;
  if (tier === 'SILVER') return 0.03;
  return 0;
};

export const resolveCustomerTier = (orderCount: number, cleanerRatingAverage: number): CustomerTier => {
  if (orderCount >= 20 && cleanerRatingAverage >= 4.7) return 'VIP';
  if (orderCount >= 10 && cleanerRatingAverage >= 4.5) return 'GOLD';
  if (orderCount >= 3 && cleanerRatingAverage >= 4) return 'SILVER';
  return 'NEW';
};

export const calculatePrice = (
  service: CleaningService,
  durationHours: number,
  options: PricingOptions = {},
): number => {
  if (service.id === 'hourly_labor') {
    const hours = Math.max(3, Number(options.hours) || service.estimatedDurationHours || 3);
    const workerCount = options.workerCount === '۳ نفر' ? 3 : options.workerCount === '۲ نفر' ? 2 : 1;
    const toolsFee = options.tools ? 80000 : 0;
    return service.basePrice * hours * workerCount + toolsFee;
  }
  if (service.id === 'building_painting') {
    const area = Math.max(1, Number(options.area) || 50);
    const paintMultiplier = options.paintType === 'رنگ اپوکسی' ? 1.4 : options.paintType === 'رنگ وینیل ضدآب' ? 1.2 : 1;
    const locationMultiplier = options.location === 'خارجی / نما' ? 1.25 : 1;
    const paintSupplyFee = options.providePaint ? 200000 : 0;
    const puttyFee = options.fullPutty ? 150000 : 0;
    return Math.round(service.basePrice * area * paintMultiplier * locationMultiplier + paintSupplyFee + puttyFee);
  }
  const hourlyMinimum = Math.max(4, durationHours);
  const hourlyTotal = service.basePrice * hourlyMinimum;
  return hourlyTotal + (options.detergent ? 50000 : 0);
};

export const calculateFinalPrice = (
  service: CleaningService,
  durationHours: number,
  options: PricingOptions = {},
  serviceDate?: string,
  extraFee = 0,
  loyalty: LoyaltyPricingOptions = {},
): FinalPrice => {
  const subtotal = calculatePrice(service, durationHours, options) + extraFee;
  const earlyBirdDiscountRate = serviceDate
    ? getEarlyBirdDiscountRate(serviceDate, loyalty.today)
    : 0;
  const tierDiscountRate = getCustomerTierDiscountRate(loyalty.customerTier);
  const recurringDiscountRate = getRecurringDiscountRate(loyalty.recurringFrequency);
  const recurringDiscountDeferred =
    recurringDiscountRate > 0 && loyalty.isFirstRecurringInvoice !== false;
  const appliedRecurringDiscountRate = recurringDiscountDeferred ? 0 : recurringDiscountRate;
  const earlyBirdDiscountAmount = Math.round(subtotal * earlyBirdDiscountRate);
  const tierDiscountAmount = Math.round(subtotal * tierDiscountRate);
  const recurringDiscountAmount = Math.round(subtotal * appliedRecurringDiscountRate);
  const discountAmount = Math.min(
    subtotal,
    earlyBirdDiscountAmount + tierDiscountAmount + recurringDiscountAmount,
  );

  return {
    subtotal,
    earlyBirdDiscountRate,
    earlyBirdDiscountAmount,
    tierDiscountRate,
    tierDiscountAmount,
    recurringDiscountRate: appliedRecurringDiscountRate,
    recurringDiscountAmount,
    discountRate: earlyBirdDiscountRate + tierDiscountRate + appliedRecurringDiscountRate,
    discountAmount,
    recurringDiscountDeferred,
    total: subtotal - discountAmount,
  };
};
