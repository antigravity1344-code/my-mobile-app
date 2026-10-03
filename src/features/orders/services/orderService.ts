import type {
  OrderItem,
  OrderFilterTab,
  OrderSortOption,
  OrderStats,
  OrderStatus,
} from '../types/order';
import { appStorage } from '../../../utils/storage';
import { apiFetch } from '../../../api/apiClient';
import { attachStoredAuthToken } from '../../../api/authToken';
import type { ApiOrder } from '../../../api/types';
import { CUSTOMER_TOKEN_KEY } from '../../../components/native/customerLoginStorage';

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

/** نگاشت سفارش سرور به شکل نمایش مشتری. بعضی فیلدهای OrderItem (تاریخ/بازه) از سرور نمی‌آیند و خالی می‌مانند. */
export function mapApiOrderForCustomer(o: ApiOrder): OrderItem {
  return {
    id: o.id,
    orderNumber: o.id,
    serviceTitle: o.serviceTitle,
    status: o.status,
    paymentStatus: o.paymentStatus || 'PENDING',
    paymentMethod: o.paymentMethod || 'CASH',
    date: { dayOfWeek: 'روز', dayOfMonth: o.date ? o.date.split(' ')[1] : '1', monthName: o.date ? o.date.split(' ')[0] : 'ماه' },
    timeSlot: { label: o.time, startTime: o.time || '', endTime: '' },
    address: { district: o.address ? o.address.split(' ')[0] : 'نامشخص', fullAddress: o.address || '' },
    pricing: { total: o.price || 0 },
    createdAt: o.createdAt || new Date().toISOString(),
    cleaner: o.cleanerId
      ? {
          id: o.cleanerId,
          name: o.cleanerName || 'متخصص',
          avatar: o.cleanerAvatar || undefined,
          phone: o.cleanerPhone || '',
          rating: o.ratings?.customerRating || 0,
          completedJobsCount: 0,
        }
      : undefined,
    ratings: o.ratings || undefined,
    timeline: [],
  } as unknown as OrderItem;
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
  ): Promise<OrderItem[]> {
    try {
      const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';
      if (!trimmedUserId) {
        lastOrdersLoadError = null;
        return [];
      }

      await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
      const res = await apiFetch('/orders');
      const resolved = resolveCustomerOrdersResponse(res);
      lastOrdersLoadError = resolved.error;
      let result: OrderItem[] = [];
      if (!resolved.error) {
        const mapped: OrderItem[] = resolved.orders.map((o) => mapApiOrderForCustomer(o));
        ordersMemoryStore = mapped;
        persistOrders();
        result = mapped;
      }

      if (filterTab === 'ACTIVE') {
        const activeStatuses: OrderStatus[] = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];
        result = result.filter((item) => activeStatuses.includes(item.status));
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
            item.address.fullAddress.toLowerCase().includes(q)
        );
      }

      result.sort((a, b) => {
        if (sortOption === 'NEWEST') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortOption === 'OLDEST') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortOption === 'PRICE_HIGH') return b.pricing.total - a.pricing.total;
        if (sortOption === 'PRICE_LOW') return a.pricing.total - b.pricing.total;
        return 0;
      });

      return result;
    } catch {
      lastOrdersLoadError = 'اتصال به سرور سفارش‌ها برقرار نشد.';
      return [];
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
        totalSpent += order.pricing.total;
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

      const payload = {
        userId: trimmedUserId,
        customerName: newOrder.address?.recipientName || 'کاربر مشتری',
        customerPhone: newOrder.address?.contactPhone || '',
        serviceTitle: newOrder.serviceTitle,
        address: newOrder.address?.fullAddress || `${newOrder.address?.district || ''} پلاک ${newOrder.address?.plaque || ''}`,
        date: `${newOrder.date?.monthName || ''} ${newOrder.date?.dayOfMonth || ''}`,
        time: newOrder.timeSlot?.label || `${newOrder.timeSlot?.startTime || ''} - ${newOrder.timeSlot?.endTime || ''}`,
        price: newOrder.pricing?.total || 350000,
        notes: newOrder.address?.addressNotes || '',
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

