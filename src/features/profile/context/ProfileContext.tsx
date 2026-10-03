import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { UserProfile, SavedAddress, WalletTransaction } from '../types/profile';
import { appStorage } from '../../../utils/storage';
import { apiFetch } from '../../../api/apiClient';
import { attachStoredAuthToken } from '../../../api/authToken';
import { CUSTOMER_TOKEN_KEY } from '../../../components/native/customerLoginStorage';

const EMPTY_LOYALTY = {
  tier: 'NEW' as const,
  title: 'عضو جدید',
  discountPercentage: 0,
  completedOrdersCount: 0,
  nextTierOrderTarget: 3,
};

const EMPTY_PROFILE: UserProfile = {
  id: '',
  fullName: '',
  phoneNumber: '',
  walletBalance: 0,
  isLoggedIn: false,
  loyalty: EMPTY_LOYALTY,
  savedAddresses: [],
};

/**
 * پروفایل نمایشی قدیمی که نسخه‌های قبلی به‌صورت ثابت در حافظهٔ محلی می‌نوشتند.
 * فقط شناسهٔ قدیمی `usr_101` بررسی می‌شود؛ شناسه‌ها/شماره‌های سرور (مثل USER-101) کاربر واقعی هستند.
 */
const isDemoProfile = (profile: UserProfile | null | undefined): boolean => {
  if (!profile) return false;
  return profile.id === 'usr_101';
};

interface AuthUserSync {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
}

interface ProfileContextType {
  profile: UserProfile;
  transactions: WalletTransaction[];
  addSavedAddress: (address: Omit<SavedAddress, 'id'>) => void;
  removeSavedAddress: (addressId: string) => void;
  setDefaultAddress: (addressId: string) => void;
  chargeWallet: (amount: number) => void;
  deductWallet: (amount: number, description: string) => boolean;
  logout: () => void;
  login: (phoneNumber: string) => void;
  syncAuthenticatedUser: (user: AuthUserSync) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const addressSyncUser = useRef('');

  useEffect(() => {
    void (async () => {
      const savedProfile = await appStorage.getItem<UserProfile>('paksho_user_profile', EMPTY_PROFILE);

      setProfile((prev) => {
        // Prefer an already-synced authenticated user from NativeCustomerApp restore/login.
        if (prev.id && !isDemoProfile(prev)) {
          return { ...prev, walletBalance: 0, loyalty: EMPTY_LOYALTY };
        }
        if (savedProfile && !isDemoProfile(savedProfile)) {
          return {
            ...EMPTY_PROFILE,
            ...savedProfile,
            walletBalance: 0,
            loyalty: EMPTY_LOYALTY,
            isLoggedIn: Boolean(savedProfile.isLoggedIn && savedProfile.id),
          };
        }
        return EMPTY_PROFILE;
      });
      setTransactions([]);

      if (!(savedProfile && !isDemoProfile(savedProfile))) {
        await appStorage.setItem('paksho_user_profile', EMPTY_PROFILE);
      }

      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void appStorage.setItem('paksho_user_profile', profile);
  }, [profile, hydrated]);

  useEffect(() => {
    if (!hydrated || !profile.isLoggedIn || !profile.id) return;
    let cancelled = false;
    const userId = profile.id;
    void (async () => {
      await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
      const [wallet, loyalty] = await Promise.all([apiFetch('/wallet'), apiFetch('/loyalty')]);
      if (cancelled) return;
      setProfile((prev) => {
        if (prev.id !== userId) return prev;
        return {
          ...prev,
          walletBalance: wallet.success && typeof wallet.balance === 'number' ? wallet.balance : prev.walletBalance,
          loyalty: loyalty.success && loyalty.loyalty ? loyalty.loyalty : prev.loyalty,
        };
      });
      if (wallet.success && Array.isArray(wallet.transactions)) {
        setTransactions(wallet.transactions);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, profile.id, profile.isLoggedIn]);

  useEffect(() => {
    if (!hydrated || !profile.isLoggedIn || !profile.id) {
      addressSyncUser.current = '';
      return;
    }
    let cancelled = false;
    const userId = profile.id;
    void (async () => {
      await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
      const res = await apiFetch('/users/addresses');
      if (cancelled || !res.success || !Array.isArray(res.addresses)) return;
      if (res.addresses.length > 0) {
        setProfile((prev) => (prev.id === userId ? { ...prev, savedAddresses: res.addresses } : prev));
      }
      addressSyncUser.current = userId;
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, profile.id, profile.isLoggedIn]);

  useEffect(() => {
    if (!hydrated || !profile.id || addressSyncUser.current !== profile.id) return;
    const addresses = profile.savedAddresses;
    const timer = setTimeout(() => {
      void (async () => {
        await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
        await apiFetch('/users/addresses', {
          method: 'PUT',
          body: JSON.stringify({ addresses }),
        });
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [hydrated, profile.id, profile.savedAddresses]);

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

  const removeSavedAddress = (addressId: string) => {
    setProfile((prev) => ({
      ...prev,
      savedAddresses: prev.savedAddresses.filter((addr) => addr.id !== addressId),
    }));
  };

  const setDefaultAddress = (addressId: string) => {
    setProfile((prev) => ({
      ...prev,
      savedAddresses: prev.savedAddresses.map((addr) => ({
        ...addr,
        isDefault: addr.id === addressId,
      })),
    }));
  };

  const chargeWallet = (amount: number) => {
    void amount;
  };

  const deductWallet = (amount: number, description: string): boolean => {
    void amount;
    void description;
    return false;
  };

  const logout = () => {
    setProfile(EMPTY_PROFILE);
    setTransactions([]);
  };

  const login = (phoneNumber: string) => {
    setProfile((prev) => ({
      ...prev,
      phoneNumber,
      isLoggedIn: true,
    }));
  };

  const syncAuthenticatedUser = (user: AuthUserSync) => {
    setProfile((prev) => {
      const wasDemo = isDemoProfile(prev);
      const switchingUser = Boolean(prev.id) && prev.id !== user.id;
      const keepAddresses = !wasDemo && !switchingUser;
      return {
        ...prev,
        id: user.id,
        fullName: user.name || prev.fullName || '',
        phoneNumber: user.phone,
        avatarUrl: user.avatar || prev.avatarUrl,
        isLoggedIn: true,
        savedAddresses: keepAddresses ? prev.savedAddresses : [],
        walletBalance: wasDemo ? 0 : prev.walletBalance,
        loyalty: wasDemo ? EMPTY_LOYALTY : prev.loyalty || EMPTY_LOYALTY,
      };
    });
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
        deductWallet,
        logout,
        login,
        syncAuthenticatedUser,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile باید داخل ProfileProvider استفاده شود.');
  }
  return context;
};
