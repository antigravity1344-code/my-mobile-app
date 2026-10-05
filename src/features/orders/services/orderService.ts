import type {
  OrderItem,
  OrderFilterTab,
  OrderSortOption,
  OrderStats,
  OrderStatus,
  OrderTimelineEvent,
} from '../types/order';
import type { FinalPrice } from '../../../utils/pricing';
import { appStorage } from '../../../utils/storage';
import { apiFetch } from '../../../api/apiClient';
import { attachStoredAuthToken } from '../../../api/authToken';
import type { ApiOrder } from '../../../api/types';
import { CUSTOMER_TOKEN_KEY } from '../../../components/native/customerLoginStorage';
import {
  formatSubmittedAddress,
  selectCustomerOrders,
  submittedDurationHours,
  submittedOrderPrice,
} from './orderPayload';

const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'CONFIRMED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** مبلغ امن برای نمایش در UI (جلوگیری از crash روی undefined) */
export function formatOrderAmount(value: unknown): string {
  return toFiniteNumber(value, 0).toLocaleString('fa-IR');
}

function buildPricingFromApiPrice(price: unknown): FinalPrice {
  const total = toFiniteNumber(price, 0);
  return {
    subtotal: total,
    earlyBirdDiscountRate: 0,
    earlyBirdDiscountAmount: 0,
    tierDiscountRate: 0,
    tierDiscountAmount: 0,
    recurringDiscountRate: 0,
    recurringDiscountAmount: 0,
    discountRate: 0,
    discountAmount: 0,
    recurringDiscountDeferred: false,
    total,
  };
}

function normalizeOrderStatus(status: unknown): OrderStatus {
  return ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : 'PENDING';
}

// Memory store for runtime mutations — start empty (no demo seed on boot).
let ordersMemoryStore: OrderItem[] = [];
let lastOrdersLoadError: string | null = null;

export function getLastOrdersLoadError(): string | null {
  return lastOrdersLoadError;
}

export function resolveCustomerOrdersResponse(apiResult: {
  success?: boolean;
  orders?: unknown;
  message?: string;
} | null): { orders: ApiOrder[]; error: string | null } {
  if (apiResult && apiResult.success === true && Array.isArray(apiResult.orders)) {
    return { orders: apiResult.orders as ApiOrder[], error: null };
  }
  return {
    orders: [],
    error: apiResult?.message || 'اتصال به سرور سفارش‌ها برقرار نشد.',
  };
}

const persistOrders = () => {
  void appStorage.setItem('paksho_orders_list', ordersMemoryStore);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** بازه استاندارد امتیازدهی (۱ تا ۵ ستاره) */
const MIN_RATING = 1;
const MAX_RATING = 5;

export const CANCELLABLE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'CONFIRMED',
  'ASSIGNED',
  'IN_PROGRESS',
];

/** نگاشت سفارش سرور به شکل نمایش مشتری. فیلدهایی که سرور ندارد با مقدار امن پر می‌شوند. */
export function mapApiOrderForCustomer(o: ApiOrder): OrderItem {
  const createdAt = o.createdAt || new Date().toISOString();
  const rawDate = typeof o.date === 'string' ? o.date.trim() : '';
  const dateParts = rawDate.split(/\s+/).filter(Boolean);
  const monthName = dateParts.length > 1 ? dateParts[0] : rawDate;
  const dayRaw = dateParts.length > 1 ? dateParts[dateParts.length - 1] : '';
  const parsedDay = toFiniteNumber(dayRaw, 0);
  const dayOfMonth = parsedDay > 0 ? parsedDay : 0;
  const timeLabel = typeof o.time === 'string' && o.time.trim() ? o.time.trim() : '—';
  const fullAddress = typeof o.address === 'string' ? o.address.trim() : '';
  const storedGender = o.genderPreference;
  const genderPreference =
    storedGender === 'FEMALE' || storedGender === 'MALE' || storedGender === 'NO_PREFERENCE'
      ? storedGender
      : 'NO_PREFERENCE';
  const frequencies = ['ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
  const tiers = ['NEW', 'SILVER', 'GOLD', 'VIP'] as const;
  const recurringFrequency = frequencies.includes(o.recurringFrequency as (typeof frequencies)[number])
    ? (o.recurringFrequency as (typeof frequencies)[number])
    : 'ONE_TIME';
  const customerTier = tiers.includes(o.customerTier as (typeof tiers)[number])
    ? (o.customerTier as (typeof tiers)[number])
    : 'NEW';
  const storedPricing = o.pricing && typeof o.pricing === 'object' ? o.pricing : null;

  return {
    id: o.id,
    orderNumber: o.id,
    serviceId: typeof o.serviceId === 'string' ? o.serviceId : '',
    serviceTitle: o.serviceTitle || 'سرویس نظافت',
    pricingType: 'hourly',
    status: normalizeOrderStatus(o.status),
    paymentStatus: o.paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
    paymentMethod: o.paymentMethod === 'ONLINE' ? 'ONLINE' : 'CASH',
    date: {
      dateString: o.date || '',
      dayOfWeek: '',
      dayOfMonth,
      monthName,
    },
    timeSlot: {
      id: `api-time-${o.id}`,
      label: timeLabel,
      startTime: timeLabel,
      endTime: '',
      period: 'MORNING',
      isAvailable: true,
    },
    durationHours: typeof o.durationHours === 'number' && o.durationHours > 0 ? o.durationHours : 0,
    genderPreference,
    serviceOptions: o.serviceOptions && typeof o.serviceOptions === 'object' ? o.serviceOptions : {},
    recurringFrequency,
    customerTier,
    address: {
      district: '',
      fullAddress: fullAddress || '—',
      plaque: '',
      unit: '',
      hasElevator: false,
      addressNotes: typeof o.addressNotes === 'string' ? o.addressNotes : undefined,
      contactPhone: o.customerPhone || '',
      recipientName: o.customerName || '—',
      coordinates: { latitude: 0, longitude: 0 },
    },
    pricing: storedPricing && typeof storedPricing.total === 'number'
      ? { ...buildPricingFromApiPrice(o.price), ...storedPricing, total: storedPricing.total }
      : buildPricingFromApiPrice(o.price),
    createdAt,
    updatedAt: o.completedAt || o.cancelledAt || createdAt,
    cleaner: o.cleanerId
      ? {
          id: o.cleanerId,
          name: typeof o.cleanerName === 'string' ? o.cleanerName.trim() : '',
          avatar: o.cleanerAvatar || undefined,
          phone: typeof o.cleanerPhone === 'string' ? o.cleanerPhone.trim() : '',
        }
      : undefined,
    ratings: o.ratings
      ? {
          customerRating: o.ratings.customerRating ?? null,
          customerComment: o.ratings.customerComment,
          customerTags: o.ratings.customerTags,
          cleanerId: typeof o.ratings.cleanerId === 'string' ? o.ratings.cleanerId : o.cleanerId || undefined,
          cleanerRating: null,
          ratedAt: o.ratings.ratedAt,
        }
      : undefined,
    notes: o.notes,
    timeline: buildTimelineFromApiOrder(o, normalizeOrderStatus(o.status)),
  };
}

function buildTimelineFromApiOrder(o: ApiOrder, status: OrderStatus): OrderTimelineEvent[] {
  const submitted: OrderTimelineEvent = {
    step: 'SUBMITTED',
    title: 'سفارش ثبت شد',
    timestamp: o.createdAt || '',
    isCompleted: true,
    isCurrent: status === 'PENDING',
  };
  if (status === 'CANCELLED') {
    return [
      { ...submitted, isCurrent: false },
      {
        step: 'CANCELLED',
        title: 'سفارش لغو شد',
        timestamp: o.cancelledAt || '',
        isCompleted: true,
        isCurrent: true,
      },
    ];
  }
  if (status === 'PENDING') return [submitted];

  const cleanerName = typeof o.cleanerName === 'string' ? o.cleanerName.trim() : '';
  const assigned: OrderTimelineEvent = {
    step: 'ASSIGNED',
    title: cleanerName ? `متخصص پذیرفت: ${cleanerName}` : 'متخصص سفارش را پذیرفت',
    timestamp: '',
    isCompleted: true,
    isCurrent: status !== 'COMPLETED',
  };
  if (status !== 'COMPLETED') {
    return [{ ...submitted, isCurrent: false }, assigned];
  }
  return [
    { ...submitted, isCurrent: false },
    { ...assigned, isCurrent: false },
    {
      step: 'FINISHED',
      title: 'خدمت تکمیل شد',
      timestamp: o.completedAt || '',
      isCompleted: true,
      isCurrent: true,
    },
  ];
}

export const isOrderCancellable = (status: OrderStatus): boolean =>
  CANCELLABLE_ORDER_STATUSES.includes(status);

export const orderService = {
  getLastOrdersLoadError,

  async getOrders(
    filterTab: OrderFilterTab = 'ALL',
    searchQuery: string = '',
    sortOption: OrderSortOption = 'NEWEST',
    userId: string,
  ): Promise<{ orders: OrderItem[]; error: string | null }> {
    try {
      const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';
      if (!trimmedUserId) {
        lastOrdersLoadError = null;
        return { orders: [], error: null };
      }

      await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
      const res = await apiFetch('/orders');
      const resolved = resolveCustomerOrdersResponse(res);
      const error = resolved.error;
      lastOrdersLoadError = error;
      let result: OrderItem[] = [];
      if (!error) {
        const mapped: OrderItem[] = resolved.orders.map((o) => mapApiOrderForCustomer(o));
        ordersMemoryStore = mapped;
        persistOrders();
        result = mapped;
      }

      return {
        orders: selectCustomerOrders(result, filterTab, searchQuery, sortOption),
        error,
      };
    } catch {
      const error = 'اتصال به سرور سفارش‌ها برقرار نشد.';
      lastOrdersLoadError = error;
      return { orders: [], error };
    }
  },

  async getOrderById(orderId: string): Promise<OrderItem | undefined> {
    await wait(100);
    return ordersMemoryStore.find((item) => item.id === orderId);
  },

  async cancelOrder(
    orderId: string,
    reason: string = 'لغو توسط کاربر',
    userId: string,
  ): Promise<{ success: boolean; error?: string; order?: OrderItem; refundAmount?: number }> {
    const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!trimmedUserId) {
      return { success: false, error: 'شناسه مشتری برای لغو سفارش موجود نیست.' };
    }

    await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
    const res = await apiFetch('/orders/' + encodeURIComponent(orderId) + '/cancel', {
      method: 'PUT',
      body: JSON.stringify({ userId: trimmedUserId, reason }),
    });

    if (!res.success || !res.order) {
      return { success: false, error: res.message || 'لغو سفارش روی سرور انجام نشد.' };
    }

    const updatedOrder = mapApiOrderForCustomer(res.order) as OrderItem;
    const index = ordersMemoryStore.findIndex((item) => item.id === orderId);
    if (index >= 0) {
      ordersMemoryStore[index] = { ...ordersMemoryStore[index], ...updatedOrder, status: 'CANCELLED' };
      persistOrders();
    }
    return { success: true, order: updatedOrder, refundAmount: 0 };
  },

  async rateOrder(
    orderId: string,
    customerRating: number,
    comment?: string,
    tags?: string[],
  ): Promise<{ success: boolean; error?: string; order?: OrderItem }> {
    if (
      !Number.isInteger(customerRating) ||
      customerRating < MIN_RATING ||
      customerRating > MAX_RATING
    ) {
      return {
        success: false,
        error: `امتیاز باید عدد صحیحی بین ${MIN_RATING} تا ${MAX_RATING} باشد.`,
      };
    }

    await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
    const res = await apiFetch('/orders/' + encodeURIComponent(orderId) + '/rate', {
      method: 'PUT',
      body: JSON.stringify({ rating: customerRating, comment, tags }),
    });

    if (!res.success || !res.order) {
      return { success: false, error: res.message || 'ثبت امتیاز روی سرور انجام نشد.' };
    }

    const updatedOrder = mapApiOrderForCustomer(res.order) as OrderItem;
    const index = ordersMemoryStore.findIndex((item) => item.id === orderId);
    if (index >= 0) {
      ordersMemoryStore[index] = updatedOrder;
      persistOrders();
    }
    return { success: true, order: updatedOrder };
  },

  calculateStats(orders: OrderItem[]): OrderStats {
    const activeStatuses: OrderStatus[] = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];
    let activeCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let totalSpent = 0;
    for (const order of orders) {
      if (activeStatuses.includes(order.status)) {
        activeCount++;
      } else if (order.status === 'COMPLETED') {
        completedCount++;
        totalSpent += toFiniteNumber(order.pricing?.total, 0);
      } else if (order.status === 'CANCELLED') {
        cancelledCount++;
      }
    }

    return {
      totalCount: orders.length,
      activeCount,
      completedCount,
      cancelledCount,
      totalSpent,
    };
  },

  async addOrder(newOrder: OrderItem, userId: string): Promise<{ success: boolean; error?: string; order?: OrderItem }> {
    try {
      const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';
      if (!trimmedUserId) {
        return {
          success: false,
          error: 'شناسه کاربر احراز هویت‌شده برای ثبت سفارش موجود نیست.',
        };
      }

      const price = submittedOrderPrice(newOrder.pricing?.total);
      if (price == null) {
        return { success: false, error: 'مبلغ سفارش معتبر نیست.' };
      }
      const address = formatSubmittedAddress(newOrder.address);
      if (!address) {
        return { success: false, error: 'آدرس سفارش الزامی است.' };
      }

      const payload = {
        userId: trimmedUserId,
        customerName: newOrder.address?.recipientName || 'کاربر مشتری',
        customerPhone: newOrder.address?.contactPhone || '',
        serviceId: typeof newOrder.serviceId === 'string' ? newOrder.serviceId : '',
        serviceTitle: newOrder.serviceTitle,
        durationHours: submittedDurationHours(newOrder),
        genderPreference: newOrder.genderPreference,
        serviceOptions: newOrder.serviceOptions || {},
        addressNotes: typeof newOrder.address?.addressNotes === 'string' ? newOrder.address.addressNotes : '',
        recurringFrequency: newOrder.recurringFrequency,
        customerTier: newOrder.customerTier,
        pricing: newOrder.pricing,
        address,
        date: `${newOrder.date?.monthName || ''} ${newOrder.date?.dayOfMonth || ''}`,
        time: newOrder.timeSlot?.label || `${newOrder.timeSlot?.startTime || ''} - ${newOrder.timeSlot?.endTime || ''}`,
        price,
        notes: typeof newOrder.notes === 'string' ? newOrder.notes : '',
      };

      await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
      const res = await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!res.success) {
        return {
          success: false,
          error: res.message || 'خطا در ثبت سفارش در سرور مرکزی. سفارش ثبت نشد.'
        };
      }

      if (res.order && res.order.id) {
        newOrder.id = res.order.id;
        newOrder.orderNumber = res.order.id;
      }

      ordersMemoryStore = [newOrder, ...ordersMemoryStore];
      persistOrders();

      return { success: true, order: newOrder };
    } catch {
      return {
        success: false,
        error: 'برقرار نشدن ارتباط با سرور. لطفاً اتصال شبکه را بررسی فرمایید.'
      };
    }
  },
};

