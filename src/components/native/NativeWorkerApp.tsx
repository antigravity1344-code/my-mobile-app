import React, { useState, useEffect } from 'react';
import { previewActive } from './previewRuntime';
import {
  View,
  StyleSheet,
  SafeAreaView as RNSafeAreaView,
  StatusBar,
} from 'react-native';
import { WorkerAuthScreen } from './WorkerAuthScreen';
import { WorkerOnboardingScreen } from './WorkerOnboardingScreen';
import { WorkerMainShell, type WorkerMainView } from './WorkerMainShell';
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
import { colors, useCustomerFonts } from '../../theme/customerHome';

type UserData = WorkerSessionUser;

export const NativeWorkerApp: React.FC<{ onPreviewExit?: () => void }> = ({ onPreviewExit }) => {
  const [fontsLoaded, fontError] = useCustomerFonts();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mainView, setMainView] = useState<WorkerMainView>('home');

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
    setMainView('home');
    await clearWorkerSession(appStorage);
  };

  useAccountBlockedLogout(isLoggedIn, handleLogout);

  if (isLoading) {
    return <View style={styles.loadingContainer} />;
  }

  if (!isLoggedIn || !userData) {
    return (
      <RNSafeAreaView style={styles.safeAreaDark}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <WorkerAuthScreen onLogin={handleLogin} />
      </RNSafeAreaView>
    );
  }

  if (!fontsLoaded && !fontError) {
    return <View style={styles.homeLoading} />;
  }

  const isApproved = userData.status === 'APPROVED' || userData.status === 'ACTIVE';

  if (!isApproved) {
    return (
      <RNSafeAreaView style={styles.safeAreaDark}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <WorkerOnboardingScreen user={userData} onUpdateUser={handleUpdateUser} />
      </RNSafeAreaView>
    );
  }

  return <WorkerMainShell user={userData} mainView={mainView} onChangeView={setMainView} onLogout={handleLogout} />;
};

const styles = StyleSheet.create({
  safeAreaDark: {
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
