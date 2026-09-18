import React, { createContext, useContext, useState } from 'react';
import { UserProfile, SavedAddress, WalletTransaction } from '../types/profile';

// مقادیر اولیه فرضی برای پروفایل کاربر
const INITIAL_PROFILE: UserProfile = {
  id: 'usr_101',
  fullName: 'محمد محمدی',
  phoneNumber: '09123456789',
  email: 'mohammad@example.com',
  walletBalance: 150000, // موجودی به تومان
  isLoggedIn: true,
  loyalty: {
    tier: 'GOLD',
    title: 'مشتری طلایی',
    discountPercentage: 5,
    completedOrdersCount: 7,
    nextTierOrderTarget: 10,
  },
  savedAddresses: [
    {
      id: 'addr_1',
      title: 'خانه',
      district: 'سعادت‌آباد',
      fullAddress: 'بلوار دریا، خیابان صرافها، کوچه ۳',
      plaque: '۱۲',
      unit: '۴',
      recipientName: 'محمد محمدی',
      contactPhone: '09123456789',
      isDefault: true,
    },
    {
      id: 'addr_2',
      title: 'محل کار',
      district: 'میرداماد',
      fullAddress: 'بلوار میرداماد، جنب ایستگاه مترو، ساختمان آفتاب',
      plaque: '۸۵',
      unit: '۱۰',
      recipientName: 'محمد محمدی',
      contactPhone: '09123456789',
      isDefault: false,
    },
  ],
};

// لیست اولیه تراکنش‌های فرضی کیف پول
const INITIAL_TRANSACTIONS: WalletTransaction[] = [
  {
    id: 'tx_1',
    amount: 50000,
    type: 'CASHBACK',
    description: 'پاداش بازگشت وجه سفارش #ORD-9821',
    date: '۱۴۰۳/۰۶/۲۰',
    status: 'SUCCESS',
  },
  {
    id: 'tx_2',
    amount: 100000,
    type: 'DEPOSIT',
    description: 'شارژ آنلاین کیف پول',
    date: '۱۴۰۳/۰۶/۱۵',
    status: 'SUCCESS',
  },
];

// رابط کاربری کانتکست پروفایل
interface ProfileContextType {
  profile: UserProfile; // اطلاعات پروفایل کاربر
  transactions: WalletTransaction[]; // تاریخچه تراکنش‌ها
  addSavedAddress: (address: Omit<SavedAddress, 'id'>) => void; // افزودن آدرس جدید
  removeSavedAddress: (addressId: string) => void; // حذف آدرس
  setDefaultAddress: (addressId: string) => void; // تنظیم آدرس به عنوان پیش‌فرض
  chargeWallet: (amount: number) => void; // شارژ کیف پول
  logout: () => void; // خروج از حساب
  login: (phoneNumber: string) => void; // ورود کاربر
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile>(INITIAL_PROFILE);
  const [transactions, setTransactions] = useState<WalletTransaction[]>(INITIAL_TRANSACTIONS);

  // افزودن آدرس جدید به لیست آدرس‌های کاربر
  const addSavedAddress = (newAddr: Omit<SavedAddress, 'id'>) => {
    const createdAddress: SavedAddress = {
      ...newAddr,
      id: `addr_${Date.now()}`,
    };

    setProfile((prev) => ({
      ...prev,
      savedAddresses: [...prev.savedAddresses, createdAddress],
    }));
  };

  // حذف آدرس از لیست آدرس‌های ذخیره‌شده
  const removeSavedAddress = (addressId: string) => {
    setProfile((prev) => ({
      ...prev,
      savedAddresses: prev.savedAddresses.filter((addr) => addr.id !== addressId),
    }));
  };

  // تنظیم یک آدرس مشخص به عنوان آدرس پیش‌فرض
  const setDefaultAddress = (addressId: string) => {
    setProfile((prev) => ({
      ...prev,
      savedAddresses: prev.savedAddresses.map((addr) => ({
        ...addr,
        isDefault: addr.id === addressId,
      })),
    }));
  };

  // افزایش موجودی کیف پول و ثبت تراکنش جدید
  const chargeWallet = (amount: number) => {
    if (amount <= 0) return;

    const newTx: WalletTransaction = {
      id: `tx_${Date.now()}`,
      amount,
      type: 'DEPOSIT',
      description: 'شارژ آنلاین کیف پول',
      date: new Date().toLocaleDateString('fa-IR'),
      status: 'SUCCESS',
    };

    setTransactions((prev) => [newTx, ...prev]);
    setProfile((prev) => ({
      ...prev,
      walletBalance: prev.walletBalance + amount,
    }));
  };

  // خروج از حساب کاربری
  const logout = () => {
    setProfile((prev) => ({
      ...prev,
      isLoggedIn: false,
    }));
  };

  // ورود مجدد با شماره تلفن
  const login = (phoneNumber: string) => {
    setProfile((prev) => ({
      ...prev,
      phoneNumber,
      isLoggedIn: true,
    }));
  };

  return (
    <ProfileContext.Provider
      value={{
        profile,
        transactions,
        addSavedAddress,
        removeSavedAddress,
        setDefaultAddress,
        chargeWallet,
        logout,
        login,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

// هوک اختصاصی برای دسترسی راحت‌تر به کانتکست پروفایل
export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile باید داخل ProfileProvider استفاده شود.');
  }
  return context;
};
