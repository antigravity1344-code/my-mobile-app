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
import { Briefcase, LogOut } from 'lucide-react-native';
import { WorkerAuthScreen } from './WorkerAuthScreen';
import { WorkerOnboardingScreen } from './WorkerOnboardingScreen';
import { NativeWorkerPortal } from './NativeWorkerPortal';
import { appStorage } from '../../utils/storage';

const STORAGE_ROLE_KEY = 'PAKSHO_ACTIVE_ROLE';
const STORAGE_LOGGED_IN_KEY = 'PAKSHO_IS_LOGGED_IN_WORKER';
const STORAGE_USER_DATA_KEY = 'PAKSHO_USER_WORKER';

interface UserData {
  id: string;
  phone: string;
  name: string;
  avatar: string;
  role: string;
  status: string; // REGISTERED, DOCS_SUBMITTED, PENDING_VERIFICATION, APPROVED, ACTIVE
}

export const NativeWorkerApp: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
    setUserData(user);
    setIsLoggedIn(true);
    appStorage.setItem(STORAGE_LOGGED_IN_KEY, 'true');
    appStorage.setItem(STORAGE_ROLE_KEY, 'WORKER');
    appStorage.setItem(STORAGE_USER_DATA_KEY, JSON.stringify(user));
  };

  const handleUpdateUser = (updatedUser: UserData) => {
    setUserData(updatedUser);
    appStorage.setItem(STORAGE_USER_DATA_KEY, JSON.stringify(updatedUser));
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserData(null);
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
        <WorkerAuthScreen onLogin={handleLogin} />
      </SafeAreaView>
    );
  }

  const isApproved = userData.status === 'APPROVED' || userData.status === 'ACTIVE';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* نوار بالای اپ متخصصین */}
      <View style={styles.roleBanner}>
        <View style={styles.userInfoRow}>
          <Image
            source={{ uri: userData.avatar || 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150' }}
            style={styles.avatarImage}
          />
          <View style={styles.userDetails}>
            <Text style={styles.userNameText}>{userData.name || 'متخصص پاکشو'}</Text>
            <View style={styles.roleBadgeWorker}>
              <Briefcase size={10} color="#fff" />
              <Text style={styles.roleBadgeText}>
                {isApproved ? 'پنل کارتابل متخصصین' : 'در انتظار تایید مدارک'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bannerActions}>
          <Pressable onPress={handleLogout} style={styles.logoutIconButton}>
            <LogOut size={16} color="#94a3b8" />
          </Pressable>
        </View>
      </View>

      {/* اگر هنوز تایید نشده: فرم دریافت مدارک یا وضعیت انتظار */}
      {/* اگر تایید شده: کارتابل سفارش‌ها */}
      <View style={styles.content}>
        {isApproved ? (
          <NativeWorkerPortal />
        ) : (
          <WorkerOnboardingScreen user={userData} onUpdateUser={handleUpdateUser} />
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
    borderColor: '#16a34a',
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
  roleBadgeWorker: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a',
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
  content: {
    flex: 1,
  },
});
