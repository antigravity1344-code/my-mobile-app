import type {
  OrderItem,
  OrderFilterTab,
  OrderSortOption,
  OrderStats,
  OrderStatus,
} from '../types/order';
import { INITIAL_MOCK_ORDERS } from './mockOrdersData';
import { appStorage } from '../../../utils/storage';
import { apiFetch } from '../../../api/apiClient';

// Memory store for runtime mutations — start empty (no demo seed on boot).
let ordersMemoryStore: OrderItem[] = [];

const isDemoMockOrder = (item: OrderItem): boolean =>
  INITIAL_MOCK_ORDERS.some((mock) => mock.id === item.id);

/** Offline / API-failure fallback: prefer real cached orders; demos only if cache empty. */
const offlineFallbackOrders = (): OrderItem[] => {
  if (ordersMemoryStore.length > 0) {
    return [...ordersMemoryStore];
  }
  return [...INITIAL_MOCK_ORDERS];
};

// بازیابی از حافظه محلی؛ دموهای INITIAL_MOCK_ORDERS را از storage پاک می‌کنیم
void appStorage.getItem<OrderItem[]>('paksho_orders_list', []).then((stored) => {
  if (!stored || stored.length === 0) {
    return;
  }
  const cleaned = stored.filter((item) => !isDemoMockOrder(item));
  ordersMemoryStore = cleaned;
  if (cleaned.length !== stored.length) {
    persistOrders();
  }
});

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

export const isOrderCancellable = (status: OrderStatus): boolean =>
  CANCELLABLE_ORDER_STATUSES.includes(status);

export const orderService = {
  async getOrders(
    filterTab: OrderFilterTab = 'ALL',
    searchQuery: string = '',
    sortOption: OrderSortOption = 'NEWEST',
    userId: string,
  ): Promise<OrderItem[]> {
    try {
      const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';
      if (!trimmedUserId) {
        // بدون userId نمی‌توان API زد؛ لیست خالی بهتر از دموهای جعلی است
        return [];
      }

      const res = await apiFetch('/orders?userId=' + encodeURIComponent(trimmedUserId) + '&role=CUSTOMER');
      let result: OrderItem[] = [];
      if (res.success && Array.isArray(res.orders)) {
        // API موفق: لیست واقعی (حتی خالی) جایگزین ماک/کش می‌شود — UI با دمو آلوده نشود
        const mapped: OrderItem[] = res.orders.map((o: any) => ({
          id: o.id,
          orderNumber: o.id,
          serviceTitle: o.serviceTitle,
          status: o.status,
          date: { dayOfWeek: 'روز', dayOfMonth: o.date ? o.date.split(' ')[1] : '1', monthName: o.date ? o.date.split(' ')[0] : 'ماه' },
          timeSlot: { label: o.time },
          address: { district: o.address ? o.address.split(' ')[0] : 'نامشخص', fullAddress: o.address || '' },
          pricing: { total: o.price || 0 },
          createdAt: o.createdAt || new Date().toISOString(),
          cleaner: o.cleanerId ? { id: o.cleanerId, name: 'متخصص پاکشو', phone: '09120000000', rating: 4.8, completedJobsCount: 10 } : undefined,
          timeline: []
        }));
        ordersMemoryStore = mapped;
        persistOrders();
        result = mapped;
      } else {
        result = offlineFallbackOrders();
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
    } catch (e) {
      return offlineFallbackOrders();
    }
  },

  async getOrderById(orderId: string): Promise<OrderItem | undefined> {
    await wait(100);
    return ordersMemoryStore.find((item) => item.id === orderId);
  },

  async cancelOrder(
    orderId: string,
    reason: string = 'لغو توسط کاربر',
  ): Promise<{ success: boolean; error?: string; order?: OrderItem; refundAmount?: number }> {
    await wait(300);
    const index = ordersMemoryStore.findIndex((item) => item.id === orderId);
    if (index === -1) {
      return { success: false, error: 'سفارش مورد نظر یافت نشد.' };
    }

    const currentOrder = ordersMemoryStore[index];
    if (!isOrderCancellable(currentOrder.status)) {
      return { success: false, error: 'این سفارش در وضعیتی نیست که قابل لغو باشد.' };
    }

    // اصلاح وضعیت مالی: سفارش لغوشده نباید PAID بماند.
    // با سیاست عدم دریافت پیش‌پرداخت، اگر مبلغی پرداخت شده باشد باید استرداد شود؛
    // در نبود درگاه واقعی، وضعیت به FAILED تغییر می‌کند و مبلغ استرداد گزارش می‌شود.
    const wasPaid = currentOrder.paymentStatus === 'PAID';
    const refundAmount = wasPaid ? currentOrder.pricing.total : 0;

    const updatedOrder: OrderItem = {
      ...currentOrder,
      status: 'CANCELLED',
      paymentStatus: wasPaid ? 'FAILED' : currentOrder.paymentStatus,
      updatedAt: new Date().toISOString(),
      timeline: [
        ...currentOrder.timeline.map((event) => ({ ...event, isCurrent: false })),
        {
          step: 'CANCELLED',
          title: 'لغو سفارش',
          timestamp: 'هم‌اکنون',
          description: refundAmount > 0
            ? `${reason} — استرداد مبلغ ${refundAmount.toLocaleString('fa-IR')} تومان آغاز شد.`
            : reason,
          isCompleted: true,
          isCurrent: true,
        },
      ],
    };

    ordersMemoryStore[index] = updatedOrder;
    persistOrders();
    return { success: true, order: updatedOrder, refundAmount };
  },

  async rateOrder(
    orderId: string,
    customerRating: number,
    comment?: string,
    tags?: string[],
  ): Promise<{ success: boolean; error?: string; order?: OrderItem }> {
    await wait(300);
    const index = ordersMemoryStore.findIndex((item) => item.id === orderId);
    if (index === -1) {
      return { success: false, error: 'سفارش یافت نشد.' };
    }

    const currentOrder = ordersMemoryStore[index];

    // اعتبارسنجی ۱: سفارش باید در وضعیت مجاز برای امتیازدهی باشد (تکمیل‌شده)
    if (currentOrder.status !== 'COMPLETED') {
      return { success: false, error: 'امتیازدهی تنها برای سفارش‌های تکمیل‌شده مجاز است.' };
    }

    // اعتبارسنجی ۲: مقدار امتیاز باید در بازه استاندارد ۱ تا ۵ باشد
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

    // اعتبارسنجی ۳: جلوگیری از ثبت امتیاز تکراری برای یک سفارش
    if (currentOrder.ratings?.customerRating) {
      return { success: false, error: 'برای این سفارش قبلاً امتیاز ثبت شده است.' };
    }

    const updatedOrder: OrderItem = {
      ...currentOrder,
      ratings: {
        customerRating,
        customerComment: comment,
        customerTags: tags,
        cleanerRating: currentOrder.ratings?.cleanerRating ?? 5,
        ratedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    ordersMemoryStore[index] = updatedOrder;
    persistOrders();
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
        customerPhone: newOrder.address?.contactPhone || '09121111111',
        serviceTitle: newOrder.serviceTitle,
        address: newOrder.address?.fullAddress || `${newOrder.address?.district || ''} پلاک ${newOrder.address?.plaque || ''}`,
        date: `${newOrder.date?.monthName || ''} ${newOrder.date?.dayOfMonth || ''}`,
        time: newOrder.timeSlot?.label || `${newOrder.timeSlot?.startTime || ''} - ${newOrder.timeSlot?.endTime || ''}`,
        price: newOrder.pricing?.total || 350000,
        notes: newOrder.address?.addressNotes || '',
      };

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
    } catch (err) {
      return {
        success: false,
        error: 'برقرار نشدن ارتباط با سرور. لطفاً اتصال شبکه را بررسی فرمایید.'
      };
    }
  },

  updateOrderStatus(orderId: string, status: OrderStatus, cleanerName?: string): boolean {
    const index = ordersMemoryStore.findIndex((item) => item.id === orderId || item.orderNumber === orderId);
    if (index === -1) return false;

    const currentOrder = ordersMemoryStore[index];
    const updatedOrder: OrderItem = {
      ...currentOrder,
      status,
      cleaner: cleanerName
        ? {
            id: 'cln_assigned',
            name: cleanerName,
            phone: '09123456789',
            rating: 4.9,
            completedJobsCount: 154,
          }
        : currentOrder.cleaner,
      updatedAt: new Date().toISOString(),
      timeline: [
        ...currentOrder.timeline.map((event) => ({ ...event, isCurrent: false })),
        {
          step: status === 'IN_PROGRESS' ? 'STARTED' : status === 'COMPLETED' ? 'FINISHED' : status === 'ASSIGNED' || status === 'ACCEPTED' ? 'ASSIGNED' : status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED',
          title: status === 'IN_PROGRESS' ? 'شروع فرآیند خدمت توسط متخصص' : 'به‌روزرسانی سفارش',
          timestamp: 'هم‌اکنون',
          description: cleanerName ? `سفارش توسط ${cleanerName} پذیرفته شد.` : undefined,
          isCompleted: true,
          isCurrent: true,
        },
      ],
    };

    ordersMemoryStore[index] = updatedOrder;
    persistOrders();
    return true;
  },
};

