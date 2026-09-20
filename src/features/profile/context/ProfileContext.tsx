import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, SavedAddress, WalletTransaction } from '../types/profile';
import { appStorage } from '../../../utils/storage';

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

const isDemoProfile = (profile: UserProfile | null | undefined): boolean => {
  if (!profile) return false;
  return (
    profile.id === 'usr_101' ||
    profile.id === 'USER-101' ||
    profile.phoneNumber === '09123456789'
  );
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

  useEffect(() => {
    void (async () => {
      const savedProfile = await appStorage.getItem<UserProfile>('paksho_user_profile', EMPTY_PROFILE);
      const savedTxs = await appStorage.getItem<WalletTransaction[]>('paksho_wallet_txs', []);

      setProfile((prev) => {
        // Prefer an already-synced authenticated user from NativeCustomerApp restore/login.
        if (prev.id && !isDemoProfile(prev)) {
          return prev;
        }
        if (savedProfile && !isDemoProfile(savedProfile)) {
          return {
            ...EMPTY_PROFILE,
            ...savedProfile,
            isLoggedIn: Boolean(savedProfile.isLoggedIn && savedProfile.id),
          };
        }
        return EMPTY_PROFILE;
      });

      if (!(savedProfile && !isDemoProfile(savedProfile))) {
        await appStorage.setItem('paksho_user_profile', EMPTY_PROFILE);
      }

      if (Array.isArray(savedTxs) && savedProfile && !isDemoProfile(savedProfile)) {
        setTransactions(savedTxs);
      } else {
        setTransactions([]);
        await appStorage.setItem('paksho_wallet_txs', []);
      }

      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void appStorage.setItem('paksho_user_profile', profile);
  }, [profile, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void appStorage.setItem('paksho_wallet_txs', transactions);
  }, [transactions, hydrated]);

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
    if (amount <= 0) return;
    const newTx: WalletTransaction = {
      id: `tx_${Date.now()}`,
      amount,
      type: 'DEPOSIT',
      description: 'شارژ کیف پول',
      date: new Date().toLocaleDateString('fa-IR'),
      status: 'SUCCESS',
    };
    setTransactions((prev) => [newTx, ...prev]);
    setProfile((prev) => ({
      ...prev,
      walletBalance: prev.walletBalance + amount,
    }));
  };

  const deductWallet = (amount: number, description: string): boolean => {
    if (amount <= 0 || profile.walletBalance < amount) return false;
    const newTx: WalletTransaction = {
      id: `tx_${Date.now()}`,
      amount,
      type: 'WITHDRAW',
      description: description || 'برداشت از کیف پول',
      date: new Date().toLocaleDateString('fa-IR'),
      status: 'SUCCESS',
    };
    setTransactions((prev) => [newTx, ...prev]);
    setProfile((prev) => ({
      ...prev,
      walletBalance: prev.walletBalance - amount,
    }));
    return true;
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
