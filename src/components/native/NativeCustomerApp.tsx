import React, { useState, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { SafeAreaView as EdgeSafeAreaView } from 'react-native-safe-area-context';
import { CustomerAuthScreen } from './CustomerAuthScreen';
import { CustomerOnboardingModal } from './CustomerOnboardingModal';
import { NativeBookingWizard } from '../booking/NativeBookingWizard';
import { OrdersScreen } from '../../features/orders';
import { useProfile, NativeProfileScreen } from '../../features/profile';
import { NativeSupportScreen } from '../../features/support';
import { NativeNotificationsScreen } from '../../features/notifications/NativeNotificationsScreen';
import { appStorage } from '../../utils/storage';
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { useBooking } from '../../context/BookingContext';
import { colors, useCustomerFonts } from '../../theme/customerHome';
import { CustomerHomeScreen } from './CustomerHomeScreen';
import { CustomerTabBar, type CustomerTab } from './CustomerTabBar';
import {
  clearCustomerSession,
  CUSTOMER_TOKEN_KEY,
  loadCustomerSession,
  saveCustomerSession,
  type CustomerSessionUser,
} from './customerLoginStorage';

type UserData = CustomerSessionUser;

export const NativeCustomerApp: React.FC = () => {
  const { login, logout: profileLogout, syncAuthenticatedUser } = useProfile();
  const booking = useBooking();
  const [fontsLoaded, fontError] = useCustomerFonts();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [mainView, setMainView] = useState<CustomerTab | 'alerts'>('home');
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const restoreState = async () => {
      const user = await loadCustomerSession(appStorage);

      if (!isMounted) return;

      if (user) {
        setUserData(user);
        setIsLoggedIn(true);
        syncAuthenticatedUser({
          id: user.id,
          name: user.name || '',
          phone: user.phone,
          avatar: user.avatar,
        });
        if (!user.name || !user.isProfileComplete) {
          setShowOnboarding(true);
        }
      }
      setIsLoading(false);
    };
    restoreState();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (user: UserData, token: string) => {
    await saveCustomerSession(appStorage, user, token);
    login(user.phone);
    syncAuthenticatedUser({
      id: user.id,
      name: user.name || '',
      phone: user.phone,
      avatar: user.avatar,
    });
    setUserData(user);
    setIsLoggedIn(true);

    if (!user.name || !user.isProfileComplete) {
      setShowOnboarding(true);
    }
  };

  const handleOnboardingComplete = async (updatedUser: UserData) => {
    setUserData(updatedUser);
    setShowOnboarding(false);
    await saveCustomerSession(appStorage, updatedUser);
    syncAuthenticatedUser({
      id: updatedUser.id,
      name: updatedUser.name || '',
      phone: updatedUser.phone,
      avatar: updatedUser.avatar,
    });
  };

  const handleLogout = async () => {
    await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
    await apiFetch('/auth/logout', { method: 'POST' });
    profileLogout();
    setIsLoggedIn(false);
    setUserData(null);
    setShowOnboarding(false);
    setMainView('home');
    setFocusOrderId(null);
    await clearCustomerSession(appStorage);
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

  if (!fontsLoaded && !fontError) {
    return <View style={styles.homeLoading} />;
  }

  const openBooking = (serviceId?: string) => {
    booking.resetBooking();
    if (serviceId) {
      const service = SERVICES_CATALOG.find((item) => item.id === serviceId && item.isVisible);
      if (service) {
        booking.setSelectedService(service);
        booking.setStep(2);
      }
    }
    setFocusOrderId(null);
    setMainView('wizard');
  };

  const activeTab: CustomerTab = mainView === 'alerts' ? 'home' : mainView;

  return (
    <EdgeSafeAreaView style={styles.homeShell} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <CustomerOnboardingModal
        visible={showOnboarding}
        userId={userData.id}
        onComplete={handleOnboardingComplete}
      />

      <View style={styles.content}>
        {mainView === 'home' ? (
          <CustomerHomeScreen
            userName={userData.name}
            onStartBooking={openBooking}
            onOpenOrders={(orderId) => {
              setFocusOrderId(orderId ?? null);
              setMainView('orders');
            }}
            onOpenNotifications={() => setMainView('alerts')}
            onOpenSupport={() => setMainView('support')}
          />
        ) : mainView === 'orders' ? (
          <OrdersScreen
            initialOrderId={focusOrderId}
            onNavigateToBooking={() => {
              setFocusOrderId(null);
              setMainView('wizard');
            }}
          />
        ) : mainView === 'profile' ? (
          <NativeProfileScreen onLogout={handleLogout} />
        ) : mainView === 'alerts' ? (
          <NativeNotificationsScreen />
        ) : mainView === 'support' ? (
          <NativeSupportScreen
            user={{
              id: userData.id,
              name: userData.name || '',
              phone: userData.phone,
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

      <CustomerTabBar
        active={activeTab}
        onChange={(tab) => {
          if (tab !== 'orders') setFocusOrderId(null);
          setMainView(tab);
        }}
      />
    </EdgeSafeAreaView>
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
  homeLoading: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  homeShell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
});
