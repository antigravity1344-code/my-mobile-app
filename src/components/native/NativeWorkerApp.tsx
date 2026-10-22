import React, { useState, useEffect } from 'react';
import { previewActive } from './previewRuntime';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Briefcase, HelpCircle, LogOut } from 'lucide-react-native';
import { WorkerAuthScreen } from './WorkerAuthScreen';
import { WorkerOnboardingScreen } from './WorkerOnboardingScreen';
import { NativeWorkerPortal } from './NativeWorkerPortal';
import { NativeSupportScreen } from '../../features/support';
import { NativeNotificationsScreen } from '../../features/notifications/NativeNotificationsScreen';
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
import { useAccountBlockedLogout } from './useAccountBlockedLogout';
import { type, useAppFonts } from '../../theme';

type UserData = WorkerSessionUser;

export const NativeWorkerApp: React.FC<{ onPreviewExit?: () => void }> = ({ onPreviewExit }) => {
  const [fontsLoaded, fontError] = useAppFonts();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mainView, setMainView] = useState<'work' | 'support' | 'alerts'>('work');

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
    // نشست منقضی/نامعتبر: فرم آنبوردینگ را با session مرده نگه ندار
    if (res && res.success === false && typeof res.message === 'string' && res.message.includes('ورود لازم')) {
      setIsLoggedIn(false);
      setUserData(null);
      await clearWorkerSession(appStorage);
      return current;
    }
    return current;
  };

  useEffect(() => {
    let isMounted = true;
    const restoreState = async () => {
      if (previewActive()) {
        const demo: UserData = { id: 'PREVIEW-WORKER', name: 'متخصص نمونه', phone: '09000000000', avatar: '', role: 'WORKER', status: 'ACTIVE' };
        setUserData(demo);
        setIsLoggedIn(true);
        setIsLoading(false);
        return;
      }
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
    await saveWorkerSession(appStorage, user, token);
    setUserData(user);
    setIsLoggedIn(true);
    await refreshWorkerFromServer(user);
  };

  const handleUpdateUser = async (updatedUser: UserData) => {
    setUserData(updatedUser);
    await saveWorkerSession(appStorage, updatedUser);
  };

  const handleLogout = async () => {
    if (previewActive()) { onPreviewExit?.(); return; }
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    await apiFetch('/auth/logout', { method: 'POST' });
    setIsLoggedIn(false);
    setUserData(null);
    await clearWorkerSession(appStorage);
  };

  // حساب مسدودشده توسط مدیر: پیام سرور، سپس خروج با همین handleLogout.
  useAccountBlockedLogout(isLoggedIn, handleLogout);

  if (isLoading || (!fontsLoaded && !fontError)) {
    return <View style={styles.loadingContainer} />;
  }

  if (!isLoggedIn || !userData) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <WorkerAuthScreen onLogin={handleLogin} />
      </SafeAreaView>
    );
  }

  const isApproved = userData.status === 'APPROVED' || userData.status === 'ACTIVE';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* نوار بالای اپ متخصصین */}
      <View style={styles.roleBanner}>
        <View style={styles.userInfoRow}>
          <Image
            source={previewActive() ? undefined : { uri: userData.avatar || 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150' }}
            style={styles.avatarImage}
          />
          <View style={styles.userDetails}>
            <Text style={styles.userNameText}>{userData.name || ''}</Text>
            <View style={styles.roleBadgeWorker}>
              <Briefcase size={10} color="#fff" />
              <Text style={styles.roleBadgeText}>
                {isApproved
                  ? 'پنل متخصص'
                  : userData.status === 'PENDING_VERIFICATION'
                    ? 'در انتظار تایید مدارک'
                    : 'تکمیل مدارک هویتی'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bannerActions}>
          <Pressable
            onPress={() => setMainView(mainView === 'alerts' ? 'work' : 'alerts')}
            accessibilityRole="button"
            accessibilityLabel="اعلان‌ها"
            style={[styles.logoutIconButton, mainView === 'alerts' && styles.ordersActiveButton]}
          >
            <Bell size={16} color={mainView === 'alerts' ? '#fff' : '#94a3b8'} />
          </Pressable>
          <Pressable
            onPress={() => setMainView(mainView === 'support' ? 'work' : 'support')}
            accessibilityRole="button"
            accessibilityLabel="پشتیبانی"
            style={[styles.logoutIconButton, mainView === 'support' && styles.ordersActiveButton]}
          >
            <HelpCircle size={16} color={mainView === 'support' ? '#fff' : '#94a3b8'} />
          </Pressable>
          <Pressable onPress={handleLogout} style={styles.logoutIconButton} accessibilityRole="button" accessibilityLabel="خروج از حساب">
            <LogOut size={16} color="#94a3b8" />
          </Pressable>
        </View>
      </View>

      {/* اگر هنوز تایید نشده: فرم دریافت مدارک یا وضعیت انتظار */}
      {/* اگر تایید شده: کارتابل سفارش‌ها */}
      <View style={styles.content}>
        {mainView === 'alerts' ? (
          <NativeNotificationsScreen appearance="worker" />
        ) : mainView === 'support' ? (
          <NativeSupportScreen appearance="worker" user={{ id: userData.id, name: userData.name || '', phone: userData.phone }} />
        ) : isApproved ? (
          <NativeWorkerPortal user={userData} onSessionExpired={handleLogout} />
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
    gap: 12,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  userInfoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  avatarImage: {
    flexShrink: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#0284c7',
  },
  userDetails: {
    alignItems: 'stretch',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  userNameText: {
    ...type.bold,
    writingDirection: 'rtl',
    includeFontPadding: false,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'right',
  },
  roleBadgeWorker: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
    flexShrink: 1,
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
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
    ...type.regular,
    writingDirection: 'rtl',
    includeFontPadding: false,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '400',
  },
  bannerActions: {
    flexShrink: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  logoutIconButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  ordersActiveButton: { backgroundColor: '#0284c7' },
  content: {
    flex: 1,
  },
});
