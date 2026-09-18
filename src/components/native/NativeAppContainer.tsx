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
import { NativeAuthScreen, UserRole } from './NativeAuthScreen';
import { NativeWorkerPortal } from './NativeWorkerPortal';
import { NativeBookingWizard } from '../booking/NativeBookingWizard';
import { useProfile } from '../../features/profile';
import { appStorage } from '../../utils/storage';

const STORAGE_ROLE_KEY = 'PAKSHO_ACTIVE_ROLE';
const STORAGE_LOGGED_IN_KEY = 'PAKSHO_IS_LOGGED_IN';

export interface NativeAppContainerProps {
  initialFlavor?: 'CUSTOMER' | 'WORKER';
}

export const NativeAppContainer: React.FC<NativeAppContainerProps> = ({ initialFlavor }) => {
  const { login, logout: profileLogout } = useProfile();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [currentRole, setCurrentRole] = useState<UserRole>(initialFlavor || 'CUSTOMER');
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  const handleLogin = (phoneNumber: string, role: UserRole) => {
    login(phoneNumber);
    setCurrentRole(role);
    setIsLoggedIn(true);
    appStorage.setItem(STORAGE_LOGGED_IN_KEY, 'true');
    appStorage.setItem(STORAGE_ROLE_KEY, role);
  };

  const handleLogout = () => {
    profileLogout();
    setIsLoggedIn(false);
    appStorage.setItem(STORAGE_LOGGED_IN_KEY, 'false');
  };

  const handleToggleRole = () => {
    const nextRole: UserRole = currentRole === 'CUSTOMER' ? 'WORKER' : 'CUSTOMER';
    setCurrentRole(nextRole);
    appStorage.setItem(STORAGE_ROLE_KEY, nextRole);
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
          <Pressable onPress={handleToggleRole} style={styles.toggleRoleButton}>
            <ArrowRightLeft size={13} color="#ffffff" />
            <Text style={styles.toggleRoleText}>
              {currentRole === 'WORKER' ? 'سوییچ به مشتری' : 'سوییچ به کارگر'}
            </Text>
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
        ) : (
          <NativeWorkerPortal
            onSwitchToCustomer={() => setCurrentRole('CUSTOMER')}
            onLogout={handleLogout}
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
