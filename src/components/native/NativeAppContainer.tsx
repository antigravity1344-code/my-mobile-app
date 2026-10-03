import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { User, Briefcase, LogOut, ArrowRightLeft } from 'lucide-react-native';
import { NativeAuthScreen, UserRole, NativeAuthUser } from './NativeAuthScreen';
import { NativeWorkerPortal } from './NativeWorkerPortal';
import { NativeBookingWizard } from '../booking/NativeBookingWizard';
import { useProfile } from '../../features/profile';
import { appStorage } from '../../utils/storage';
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { clearCustomerSession, CUSTOMER_TOKEN_KEY, saveCustomerSession } from './customerLoginStorage';
import { clearWorkerSession, saveWorkerSession, WORKER_TOKEN_KEY } from './workerLoginStorage';

const STORAGE_ROLE_KEY = 'PAKSHO_ACTIVE_ROLE';
const STORAGE_LOGGED_IN_KEY = 'PAKSHO_IS_LOGGED_IN';

export interface NativeAppContainerProps {
  initialFlavor?: 'CUSTOMER' | 'WORKER';
}

export const NativeAppContainer: React.FC<NativeAppContainerProps> = ({ initialFlavor }) => {
  const { login, logout: profileLogout, syncAuthenticatedUser } = useProfile();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [currentRole, setCurrentRole] = useState<UserRole>(initialFlavor || 'CUSTOMER');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionUser, setSessionUser] = useState<NativeAuthUser | null>(null);

  useEffect(() => {
    let isMounted = true;
    const restoreState = async () => {
      const savedLogin = await appStorage.getItem(STORAGE_LOGGED_IN_KEY, 'false');
      const savedRole = await appStorage.getItem<UserRole | null>(STORAGE_ROLE_KEY, null);

      if (!isMounted) return;
      if (savedLogin === 'true') {
        setIsLoggedIn(true);
      }
      if (initialFlavor) {
        setCurrentRole(initialFlavor);
      } else if (savedRole === 'CUSTOMER' || savedRole === 'WORKER') {
        setCurrentRole(savedRole);
      }
      setIsLoading(false);
    };
    restoreState();
    return () => {
      isMounted = false;
    };
  }, [initialFlavor]);

  const handleLogin = async (user: NativeAuthUser, token: string, role: UserRole) => {
    login(user.phone);
    syncAuthenticatedUser({
      id: user.id,
      name: user.name || '',
      phone: user.phone,
      avatar: user.avatar,
    });
    setSessionUser(user);
    setCurrentRole(role);
    setIsLoggedIn(true);
    await appStorage.setItem(STORAGE_LOGGED_IN_KEY, 'true');
    await appStorage.setItem(STORAGE_ROLE_KEY, role);
    if (role === 'WORKER') {
      await saveWorkerSession(appStorage, {
        id: user.id,
        phone: user.phone,
        name: user.name || '',
        avatar: user.avatar || '',
        role: 'WORKER',
        status: user.status || 'REGISTERED',
      }, token);
    } else {
      await saveCustomerSession(appStorage, {
        id: user.id,
        phone: user.phone,
        name: user.name || '',
        avatar: user.avatar || '',
        role: 'CUSTOMER',
        isProfileComplete: user.isProfileComplete,
      }, token);
    }
  };

  const handleLogout = async () => {
    if (currentRole === 'WORKER') {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      await apiFetch('/auth/logout', { method: 'POST' });
      await clearWorkerSession(appStorage);
    } else {
      await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
      await apiFetch('/auth/logout', { method: 'POST' });
      await clearCustomerSession(appStorage);
    }
    profileLogout();
    setIsLoggedIn(false);
    await appStorage.setItem(STORAGE_LOGGED_IN_KEY, 'false');
  };

  const handleToggleRole = async () => {
    // سوییچ نقش بدون ورود مجدد امن نیست؛ کاربر باید خارج شود و با نقش درست وارد شود.
    await handleLogout();
  };

  if (isLoading) {
    return <View style={styles.loadingContainer} />;
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <NativeAuthScreen onLogin={handleLogin} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* نوار کنترل بالای برنامه برای سوییچ نقش و خروج */}
      <View style={styles.roleBanner}>
        <View style={styles.roleInfo}>
          <View
            style={[
              styles.roleBadge,
              currentRole === 'WORKER' ? styles.roleBadgeWorker : styles.roleBadgeCustomer,
            ]}
          >
            {currentRole === 'WORKER' ? (
              <Briefcase size={13} color="#fff" />
            ) : (
              <User size={13} color="#fff" />
            )}
            <Text style={styles.roleBadgeText}>
              {currentRole === 'WORKER' ? 'پنل کارگر / متخصص' : 'پنل مشتری (رزرو)'}
            </Text>
          </View>
        </View>

        <View style={styles.bannerActions}>
          <Pressable onPress={() => void handleToggleRole()} style={styles.toggleRoleButton}>
            <ArrowRightLeft size={13} color="#ffffff" />
            <Text style={styles.toggleRoleText}>خروج و ورود با نقش دیگر</Text>
          </Pressable>

          <Pressable onPress={handleLogout} style={styles.logoutIconButton}>
            <LogOut size={14} color="#94a3b8" />
          </Pressable>
        </View>
      </View>

      {/* رندر نمای متناسب با نقش کاربر */}
      <View style={styles.content}>
        {currentRole === 'CUSTOMER' ? (
          <NativeBookingWizard />
        ) : sessionUser ? (
          <NativeWorkerPortal
            user={{
              id: sessionUser.id,
              phone: sessionUser.phone,
              name: sessionUser.name || '',
              avatar: sessionUser.avatar || '',
              role: 'WORKER',
              status: sessionUser.status || 'REGISTERED',
            }}
          />
        ) : (
          <Text style={{ color: '#fff', textAlign: 'center', marginTop: 24 }}>
            برای پنل متخصص دوباره وارد شوید.
          </Text>
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
  roleInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  roleBadgeCustomer: {
    backgroundColor: '#0284c7',
  },
  roleBadgeWorker: {
    backgroundColor: '#059669',
  },
  roleBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  bannerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  toggleRoleButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  toggleRoleText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
  logoutIconButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  content: {
    flex: 1,
  },
});
