/** شکل کاربر عمومی که سرور (publicUser) برمی‌گرداند. */
export interface ApiUser {
  id: string;
  phone: string;
  role: 'CUSTOMER' | 'WORKER' | string;
  status: string;
  isProfileComplete: boolean;
  name: string;
  birthDate: string;
  avatar: string;
  address: string;
  city: string;
  skills: string[];
  addresses: string[];
  savedAddresses: unknown[];
  createdAt?: string;
}

/** نمای مدیر از کاربر (فیلدهای حساس masked). */
export interface ApiAdminUser extends ApiUser {
  nationalIdMasked: string;
  bankShebaMasked: string;
  hasNationalId: boolean;
  hasBankSheba: boolean;
  hasIdDoc: boolean;
}

export interface ApiOrderRatings {
  customerRating?: number;
  customerComment?: string;
  customerTags?: string[];
  ratedAt?: string;
}

/** سفارش همان‌طور که در server/db.json ذخیره و برگردانده می‌شود. */
export interface ApiOrder {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAvatar: string;
  serviceTitle: string;
  address: string;
  date: string;
  time: string;
  price: number;
  notes?: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  cleanerId: string | null;
  cleanerName: string | null;
  cleanerAvatar: string | null;
  cleanerPhone?: string | null;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  ratings?: ApiOrderRatings;
}

export interface ApiAdminStats {
  totalCustomers: number;
  totalWorkers: number;
  pendingWorkersCount: number;
  totalOrders: number;
  pendingOrdersCount: number;
  acceptedOrdersCount: number;
  completedOrdersCount: number;
  totalRevenue: number;
}
