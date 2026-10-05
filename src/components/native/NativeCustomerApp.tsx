import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { BottomTabBar, CUSTOMER_TAB_ITEMS, LoadingState, colors } from '../../design-system';
import { NativeNotificationsScreen } from '../../features/notifications/NativeNotificationsScreen';
import { OrdersScreen } from '../../features/orders';
import { useProfile, NativeProfileScreen } from '../../features/profile';
import { NativeSupportScreen } from '../../features/support';
import { appStorage } from '../../utils/storage';
import { NativeBookingWizard } from '../booking/NativeBookingWizard';
import { HomeScreen } from '../dashboard/HomeScreen';
import { CustomerAuthScreen } from './CustomerAuthScreen';
import { CustomerOnboardingModal } from './CustomerOnboardingModal';
import {
  clearCustomerSession,
  CUSTOMER_TOKEN_KEY,
  loadCustomerSession,
  saveCustomerSession,
  type CustomerSessionUser,
} from './customerLoginStorage';

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, StatusBar, Image } from 'react-native';

import { Bell, User, LogOut } from 'lucide-react-native';

type UserData = CustomerSessionUser;

export const NativeCustomerApp: React.FC = () => {
  const { login, logout: profileLogout, syncAuthenticatedUser } = useProfile();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [mainView, setMainView] = useState<
    'home' | 'wizard' | 'orders' | 'profile' | 'support' | 'alerts'
  >('home');
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
    return <LoadingState fill label="در حال آماده‌سازی پاکشو" />;
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
    <SafeAreaView style={[styles.safeArea, mainView === 'home' && styles.homeSafeArea]}>
      <StatusBar
        barStyle={mainView === 'home' ? 'dark-content' : 'light-content'}
        backgroundColor={mainView === 'home' ? colors.cream[50] : colors.legacy.slate950}
      />

      {/* مودال تکمیل پروفایل مشتری */}
      <CustomerOnboardingModal
        visible={showOnboarding}
        userId={userData.id}
        onComplete={handleOnboardingComplete}
      />

      {/* نوار بالای اپ مشتری؛ خانه هدر خودش را دارد */}
      {mainView !== 'home' ? (
        <View style={styles.roleBanner}>
          <View style={styles.userInfoRow}>
            <Image
              source={{
                uri:
                  userData.avatar ||
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
              }}
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
              onPress={() => setMainView(mainView === 'alerts' ? 'home' : 'alerts')}
              style={[styles.logoutIconButton, mainView === 'alerts' && styles.ordersActiveButton]}
            >
              <Bell size={16} color={mainView === 'alerts' ? '#fff' : '#94a3b8'} />
            </Pressable>
            <Pressable onPress={handleLogout} style={styles.logoutIconButton}>
              <LogOut size={16} color="#94a3b8" />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.content}>
        {mainView === 'orders' ? (
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
        ) : mainView === 'home' ? (
          <HomeScreen
            displayName={userData.name || undefined}
            onOpenNotifications={() => setMainView('alerts')}
            onStartBooking={() => setMainView('wizard')}
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
      <BottomTabBar
        activeId={mainView === 'wizard' ? 'book' : mainView === 'alerts' ? undefined : mainView}
        items={CUSTOMER_TAB_ITEMS}
        onChange={(id) => {
          if (id === 'book') setMainView('wizard');
          else if (id === 'home' || id === 'orders' || id === 'profile' || id === 'support') {
            setMainView(id);
          }
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  homeSafeArea: {
    backgroundColor: colors.cream[50],
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
