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
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import {
  clearWorkerSession,
  loadWorkerSession,
  saveWorkerSession,
  WORKER_TOKEN_KEY,
  type WorkerSessionUser,
} from './workerLoginStorage';

type UserData = WorkerSessionUser;

export const NativeWorkerApp: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshWorkerFromServer = async (current: UserData) => {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    const res = await apiFetch('/users/me');
    if (res.success && res.user && res.user.role === 'WORKER') {
      const next: UserData = {
        ...current,
        id: res.user.id,
        phone: res.user.phone,
        name: res.user.name || '',
        avatar: res.user.avatar || '',
        role: res.user.role,
        status: res.user.status,
      };
      setUserData(next);
      await saveWorkerSession(appStorage, next);
      return next;
    }
    return current;
  };

  useEffect(() => {
    let isMounted = true;
    const restoreState = async () => {
      const user = await loadWorkerSession(appStorage);

      if (!isMounted) return;

      if (user) {
        setUserData(user);
        setIsLoggedIn(true);
        void refreshWorkerFromServer(user);
      }
      setIsLoading(false);
    };
    restoreState();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !userData) return;
    if (userData.status === 'APPROVED' || userData.status === 'ACTIVE') return;
    const current = userData;
    const timer = setInterval(() => {
      void refreshWorkerFromServer(current);
    }, 15000);
    return () => clearInterval(timer);
    // فقط شناسه و وضعیت مهم‌اند؛ خودِ شیء userData هر بار تغییر می‌کند.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, userData?.id, userData?.status]);

  const handleLogin = async (user: UserData, token: string) => {
    setUserData(user);
    setIsLoggedIn(true);
    await saveWorkerSession(appStorage, user, token);
    await refreshWorkerFromServer(user);
  };

  const handleUpdateUser = async (updatedUser: UserData) => {
    setUserData(updatedUser);
    await saveWorkerSession(appStorage, updatedUser);
  };

  const handleLogout = async () => {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    await apiFetch('/auth/logout', { method: 'POST' });
    setIsLoggedIn(false);
    setUserData(null);
    await clearWorkerSession(appStorage);
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
          <NativeWorkerPortal user={userData} />
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
