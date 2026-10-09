import type { AddressDetails, JalaliDateOption, TimeSlot } from '../../../types/booking';
import { normalizePersianDigits } from '../../../utils/bookingValidation';
import { JALALI_MONTH_NAMES, toPersianDigits } from '../../../utils/jalaliDateOptions';
import type { OrderItem, OrderFilterTab, OrderSortOption, OrderStatus } from '../types/order';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'CONFIRMED',
  'ASSIGNED',
  'IN_PROGRESS',
];

export function formatSubmittedAddress(address?: Partial<AddressDetails> | null): string {
  if (!address) return '';
  const parts: string[] = [];
  const district = typeof address.district === 'string' ? address.district.trim() : '';
  const fullAddress = typeof address.fullAddress === 'string' ? address.fullAddress.trim() : '';
  if (district) parts.push(district);
  if (fullAddress && fullAddress !== district) parts.push(fullAddress);
  const plaque = typeof address.plaque === 'string' ? address.plaque.trim() : '';
  const unit = typeof address.unit === 'string' ? address.unit.trim() : '';
  const floor = typeof address.floor === 'string' ? address.floor.trim() : '';
  if (plaque) parts.push(`پلاک ${plaque}`);
  if (unit) parts.push(`واحد ${unit}`);
  if (floor) parts.push(`طبقه ${floor}`);
  return parts.join('، ').slice(0, 500);
}

/** متن ساعت ذخیره‌شده در سفارش: «صبح زود (۰۸:۰۰ تا ۱۰:۰۰)». */
export function submittedTimeText(slot?: Partial<TimeSlot> | null): string {
  if (!slot) return '';
  const label = typeof slot.label === 'string' ? slot.label.trim() : '';
  const start = typeof slot.startTime === 'string' ? slot.startTime.trim() : '';
  const end = typeof slot.endTime === 'string' ? slot.endTime.trim() : '';
  const hours = start && end ? `${toPersianDigits(start)} تا ${toPersianDigits(end)}` : toPersianDigits(start || end);
  // برچسب‌هایی که خودشان ساعت دارند (فرم وب) دوباره ساعت نمی‌گیرند.
  if (label && /[(（]/.test(label)) return label;
  if (label && hours) return `${label} (${hours})`;
  return label || hours;
}

/** متن تاریخ ذخیره‌شده در سفارش: «۲۱ آبان ۱۴۰۵» (روز با رقم فارسی). */
export function submittedDateText(date?: Partial<JalaliDateOption> | null): string {
  if (!date) return '';
  const monthName = typeof date.monthName === 'string' ? date.monthName.trim() : '';
  const day = typeof date.dayOfMonth === 'number' && date.dayOfMonth > 0 ? toPersianDigits(date.dayOfMonth) : '';
  return [day, monthName].filter(Boolean).join(' ');
}

/**
 * خواندن تاریخ ذخیره‌شده؛ هم قالب جدید «۲۱ آبان ۱۴۰۵» و هم قالب قدیمی «آبان ۱۴۰۵ 21» / «آبان 21».
 */
export function parseSubmittedDate(raw: unknown): { dayOfMonth: number; monthName: string } {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const parts = text.split(/\s+/).filter(Boolean);
  const monthToken = parts.find((part) => (JALALI_MONTH_NAMES as readonly string[]).includes(part));
  if (monthToken) {
    const dayToken = parts.find((part) => /^\d{1,2}$/.test(normalizePersianDigits(part)));
    const day = dayToken ? Number(normalizePersianDigits(dayToken)) : 0;
    return { dayOfMonth: day >= 1 && day <= 31 ? day : 0, monthName: monthToken };
  }
  // قالب ناشناخته: همان رفتار قبلی (کلمه اول = ماه، کلمه آخر = روز)
  const monthName = parts.length > 1 ? parts[0]! : text;
  const day = parts.length > 1 ? Number(normalizePersianDigits(parts[parts.length - 1])) : 0;
  return { dayOfMonth: Number.isFinite(day) && day > 0 ? day : 0, monthName };
}

export function submittedOrderPrice(total: unknown): number | null {
  return typeof total === 'number' && Number.isInteger(total) ? total : null;
}

export function submittedDurationHours(order: {
  pricingType?: string;
  durationHours?: unknown;
}): number | null {
  if (order.pricingType !== 'hourly') return null;
  return typeof order.durationHours === 'number' && Number.isInteger(order.durationHours)
    ? order.durationHours
    : null;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function selectCustomerOrders(
  orders: OrderItem[],
  filterTab: OrderFilterTab = 'ALL',
  searchQuery = '',
  sortOption: OrderSortOption = 'NEWEST',
): OrderItem[] {
  let result = orders;
  if (filterTab === 'ACTIVE') {
    result = result.filter((item) => ACTIVE_ORDER_STATUSES.includes(item.status));
  } else if (filterTab === 'COMPLETED') {
    result = result.filter((item) => item.status === 'COMPLETED');
  } else if (filterTab === 'CANCELLED') {
    result = result.filter((item) => item.status === 'CANCELLED');
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    result = result.filter(
      (item) =>
        item.orderNumber.toLowerCase().includes(q) ||
        item.serviceTitle.toLowerCase().includes(q) ||
        item.address.district.toLowerCase().includes(q) ||
        item.address.fullAddress.toLowerCase().includes(q) ||
        (item.cleaner?.name || '').toLowerCase().includes(q) ||
        (item.cleaner?.phone || '').toLowerCase().includes(q),
    );
  }

  return [...result].sort((a, b) => {
    if (sortOption === 'NEWEST') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortOption === 'OLDEST') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortOption === 'PRICE_HIGH') return toFiniteNumber(b.pricing?.total) - toFiniteNumber(a.pricing?.total);
    if (sortOption === 'PRICE_LOW') return toFiniteNumber(a.pricing?.total) - toFiniteNumber(b.pricing?.total);
    return 0;
  });
}
