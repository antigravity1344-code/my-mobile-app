import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Image,
} from 'react-native';
import { User, LogOut, ClipboardList } from 'lucide-react-native';
import { CustomerAuthScreen } from './CustomerAuthScreen';
import { CustomerOnboardingModal } from './CustomerOnboardingModal';
import { NativeBookingWizard } from '../booking/NativeBookingWizard';
import { OrdersScreen } from '../../features/orders';
import { useProfile } from '../../features/profile';
import { appStorage } from '../../utils/storage';

const STORAGE_ROLE_KEY = 'PAKSHO_ACTIVE_ROLE';
const STORAGE_LOGGED_IN_KEY = 'PAKSHO_IS_LOGGED_IN';
const STORAGE_USER_DATA_KEY = 'PAKSHO_USER_CUSTOMER';

interface UserData {
  id: string;
  phone: string;
  name: string;
  avatar: string;
  role: string;
  isProfileComplete?: boolean;
}

export const NativeCustomerApp: React.FC = () => {
  const { login, logout: profileLogout } = useProfile();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [mainView, setMainView] = useState<'wizard' | 'orders'>('wizard');
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const restoreState = async () => {
      const savedLogin = await appStorage.getItem(STORAGE_LOGGED_IN_KEY, 'false');
      const savedUserStr = await appStorage.getItem(STORAGE_USER_DATA_KEY, '');

      if (!isMounted) return;

      if (savedLogin === 'true' && savedUserStr) {
        try {
          const user = JSON.parse(savedUserStr);
          setUserData(user);
          setIsLoggedIn(true);
          if (!user.name || !user.isProfileComplete) {
            setShowOnboarding(true);
          }
        } catch (e) {
          console.error(e);
        }
      }
      setIsLoading(false);
    };
    restoreState();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = (user: UserData) => {
    login(user.phone);
    setUserData(user);
    setIsLoggedIn(true);
    appStorage.setItem(STORAGE_LOGGED_IN_KEY, 'true');
    appStorage.setItem(STORAGE_ROLE_KEY, 'CUSTOMER');
    appStorage.setItem(STORAGE_USER_DATA_KEY, JSON.stringify(user));

    if (!user.name || !user.isProfileComplete) {
      setShowOnboarding(true);
    }
  };

  const handleOnboardingComplete = (updatedUser: UserData) => {
    setUserData(updatedUser);
    setShowOnboarding(false);
    appStorage.setItem(STORAGE_USER_DATA_KEY, JSON.stringify(updatedUser));
  };

  const handleLogout = () => {
    profileLogout();
    setIsLoggedIn(false);
    setUserData(null);
    setShowOnboarding(false);
    appStorage.setItem(STORAGE_LOGGED_IN_KEY, 'false');
    appStorage.removeItem(STORAGE_USER_DATA_KEY);
  };

  if (isLoading) {
    return <View style={styles.loadingContainer} />;
  }

  if (!isLoggedIn || !userData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <CustomerAuthScreen onLogin={handleLogin} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* مودال تکمیل پروفایل مشتری */}
      <CustomerOnboardingModal
        visible={showOnboarding}
        userId={userData.id}
        onComplete={handleOnboardingComplete}
      />

      {/* نوار بالای اپ مشتری */}
      <View style={styles.roleBanner}>
        <View style={styles.userInfoRow}>
          <Image
            source={{ uri: userData.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150' }}
            style={styles.avatarImage}
          />
          <View style={styles.userDetails}>
            <Text style={styles.userNameText}>{userData.name || 'کاربر مشتری'}</Text>
            <View style={styles.roleBadgeCustomer}>
              <User size={10} color="#fff" />
              <Text style={styles.roleBadgeText}>پنل مشتریان پاکشو</Text>
            </View>
          </View>
        </View>

        <View style={styles.bannerActions}>
          <Pressable
            onPress={() => setMainView(mainView === 'orders' ? 'wizard' : 'orders')}
            style={[styles.logoutIconButton, mainView === 'orders' && styles.ordersActiveButton]}
          >
            <ClipboardList size={16} color={mainView === 'orders' ? '#fff' : '#94a3b8'} />
          </Pressable>
          <Pressable onPress={handleLogout} style={styles.logoutIconButton}>
            <LogOut size={16} color="#94a3b8" />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {mainView === 'orders' ? (
          <OrdersScreen
            initialOrderId={focusOrderId}
            onNavigateToBooking={() => {
              setFocusOrderId(null);
              setMainView('wizard');
            }}
          />
        ) : (
          <NativeBookingWizard
            onOrderCreated={(orderId) => {
              setFocusOrderId(orderId);
              setMainView('orders');
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  roleBanner: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  userInfoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#0284c7',
  },
  userDetails: {
    alignItems: 'flex-start',
  },
  userNameText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  roleBadgeCustomer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  roleBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  bannerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  logoutIconButton: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#0f172a',
  },
  ordersActiveButton: {
    backgroundColor: '#0284c7',
  },
  content: {
    flex: 1,
  },
});
