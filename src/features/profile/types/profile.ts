/**
 * انواع داده مربوط به پروفایل کاربر، باشگاه مشتریان و آدرس‌های ذخیره‌شده
 */

// سطح‌های مختلف باشگاه مشتریان
export type LoyaltyTier = 'NEW' | 'SILVER' | 'GOLD' | 'VIP';

// ساختار اطلاعات سطح وفاداری کاربر
export interface LoyaltyInfo {
  tier: LoyaltyTier; // سطح فعلی کاربر
  title: string; // عنوان فارسی سطح (مثلا: طلایی)
  discountPercentage: number; // درصد تخفیف اختصاصی این سطح
  completedOrdersCount: number; // تعداد سفارش‌های تکمیل‌شده
  nextTierOrderTarget: number; // هدف تعداد سفارش برای رسیدن به سطح بعدی
}

// ساختار آدرس ذخیره‌شده کاربر
export interface SavedAddress {
  id: string; // شناسه یکتای آدرس
  title: string; // عنوان آدرس (مثلا: خانه، محل کار)
  district: string; // نام محله
  fullAddress: string; // نشانی دقیق متنی
  plaque: string; // شماره پلاک
  unit?: string; // شماره واحد (اختیاری)
  recipientName: string; // نام و نام خانوادگی تحویل‌گیرنده
  contactPhone: string; // شماره تماس
  isDefault: boolean; // آیا آدرس پیش‌فرض است؟
}

// تراکنش کیف پول
export interface WalletTransaction {
  id: string; // شناسه تراکنش
  amount: number; // مبلغ تراکنش به تومان
  type: 'DEPOSIT' | 'WITHDRAW' | 'CASHBACK'; // نوع تراکنش (واریز، برداشت، بازگشت وجه)
  description: string; // توضیحات فارسی تراکنش
  date: string; // تاریخ شمسی تراکنش
  status: 'SUCCESS' | 'FAILED' | 'PENDING'; // وضعیت تراکنش
}

// پروفایل کلی کاربر
export interface UserProfile {
  id: string; // شناسه کاربر
  fullName: string; // نام و نام خانوادگی
  phoneNumber: string; // شماره همراه
  email?: string; // ایمیل (اختیاری)
  avatarUrl?: string; // تصویر پروفایل (اختیاری)
  walletBalance: number; // موجودی کیف پول به تومان
  loyalty: LoyaltyInfo; // اطلاعات باشگاه مشتریان
  savedAddresses: SavedAddress[]; // لیست آدرس‌های ذخیره‌شده
  isLoggedIn: boolean; // آیا کاربر وارد شده است؟
}
