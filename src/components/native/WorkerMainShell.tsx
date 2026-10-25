import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView as EdgeSafeAreaView } from 'react-native-safe-area-context';
import { WorkerHomeScreen } from './WorkerHomeScreen';
import { WorkerHomeCardScreen } from './WorkerHomeCardScreens';
import { WORKER_HOME_CARD_KEYS, type WorkerHomeCardKey } from './workerHomeCards';
import { WorkerTabBar, type WorkerTab } from './WorkerTabBar';
import { NativeWorkerPortal } from './NativeWorkerPortal';
import { useWorkerOrders } from './useWorkerOrders';
import { mapWorkerOrder, type NativeOrder } from './workerOrderMapper';
import { requestWorkerAccept } from './workerAcceptOrder';
import { WORKER_SESSION_EXPIRED_MESSAGE } from './workerOrdersFetch';
import { workerTabBadge } from './workerHomeModel';
import { WORKER_TIER_ENDPOINT, workerTierFromResponse, workerTierNextFromResponse, type WorkerTierKey, type WorkerTierNext } from './workerTier';
import { WORKER_RATING_ENDPOINT, workerRatingFromResponse, type WorkerRating } from './workerRating';
import { NativeSupportScreen } from '../../features/support';
import { NativeNotificationsScreen } from '../../features/notifications/NativeNotificationsScreen';
import { unreadCountFromResponse } from '../../features/notifications/notificationsUnread';
import { WorkerAddressScreen } from './WorkerAddressScreen';
import { appStorage } from '../../utils/storage';
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { WORKER_TOKEN_KEY, type WorkerSessionUser } from './workerLoginStorage';
import { colors } from '../../theme/customerHome';

export type WorkerMainView = WorkerTab | 'alerts' | WorkerHomeCardKey;

function isWorkerHomeCard(view: WorkerMainView): view is WorkerHomeCardKey {
  return (WORKER_HOME_CARD_KEYS as readonly string[]).includes(view);
}

type Props = {
  user: WorkerSessionUser;
  mainView: WorkerMainView;
  onChangeView: (view: WorkerMainView) => void;
  onLogout: () => void;
};

/**
 * پوستهٔ اصلی اپ متخصص پس از تأیید. سفارش‌ها یک‌بار اینجا بارگذاری و هر ۱۰ ثانیه تازه می‌شوند
 * تا خانه، نشان نوار پایین و پنل سفارش‌ها یک منبع داشته باشند.
 */
export function WorkerMainShell({ user, mainView, onChangeView, onLogout }: Props) {
  const orders = useWorkerOrders<NativeOrder>(user.id, mapWorkerOrder);
  const { ordersState, hasLoaded, fetchOrders } = orders;
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // درجهٔ خود متخصص (D-71)؛ خطا یا پاسخ نامعتبر یعنی هیچ نشانی نمایش داده نشود.
  const [tierKey, setTierKey] = useState<WorkerTierKey | null>(null);
  const [tierNext, setTierNext] = useState<WorkerTierNext | null>(null);
  // میانگین ستارهٔ خود متخصص (D-73)؛ خطا یعنی «—».
  const [rating, setRating] = useState<WorkerRating | null>(null);

  // پایان نشست روی خانه همان خروج موجود را صدا می‌زند (حساب مسدود را useAccountBlockedLogout جدا مدیریت می‌کند).
  const expired = ordersState.sessionExpired && ordersState.error === WORKER_SESSION_EXPIRED_MESSAGE;
  const logoutFired = useRef(false);
  useEffect(() => {
    if (!expired || mainView !== 'home' || logoutFired.current) return;
    logoutFired.current = true;
    onLogout();
  }, [expired, mainView, onLogout]);

  const loadUnread = useCallback(async () => {
    try {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      setUnreadCount(unreadCountFromResponse(await apiFetch('/notifications')));
    } catch {
      setUnreadCount(0);
    }
  }, []);
  const loadTier = useCallback(async () => {
    try {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      const response = await apiFetch(WORKER_TIER_ENDPOINT);
      setTierKey(workerTierFromResponse(response));
      setTierNext(workerTierNextFromResponse(response));
    } catch {
      setTierKey(null);
      setTierNext(null);
    }
  }, []);
  const loadRating = useCallback(async () => {
    try {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      setRating(workerRatingFromResponse(await apiFetch(WORKER_RATING_ENDPOINT)));
    } catch {
      setRating(null);
    }
  }, []);
  // خانه اعلان، درجه و میانگین ستاره را تازه می‌کند؛ کارت بازخورد همان میانگین را دوباره می‌خواند.
  useEffect(() => {
    if (mainView === 'feedbacks') {
      void loadRating();
      return;
    }
    if (mainView !== 'home') return;
    void loadUnread();
    void loadTier();
    void loadRating();
  }, [mainView, loadUnread, loadTier, loadRating]);

  const handleAccept = async (order: NativeOrder) => {
    if (acceptingId) return;
    setAcceptingId(order.id);
    const result = await requestWorkerAccept(order.id, user.id);
    setAcceptingId(null);
    if (result.ok) Alert.alert('پذیرش سفارش', 'سفارش «' + order.serviceTitle + '» با موفقیت پذیرفته شد.', [{ text: 'باشه' }]);
    else if (result.message) Alert.alert('خطا', result.message, [{ text: 'باشه' }]);
    // بعد از موفقیت یا خطا فهرست‌ها تازه می‌شوند تا شمارش‌ها و کارت بعدی به‌روز شوند.
    void fetchOrders('after-action');
  };

  const activeTab: WorkerTab = mainView === 'alerts' || isWorkerHomeCard(mainView) ? 'home' : mainView;
  const cardKnown = hasLoaded && !ordersState.sessionExpired && !(!!ordersState.error && ordersState.available.length === 0 && ordersState.mine.length === 0);
  const newOrdersBadge = hasLoaded && !ordersState.sessionExpired ? workerTabBadge(ordersState.available.length) : null;

  return (
    <EdgeSafeAreaView style={styles.homeShell} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.content}>
        {mainView === 'home' ? (
          <WorkerHomeScreen
            userName={user.name}
            userAvatar={user.avatar}
            hasUnread={unreadCount > 0}
            tierKey={tierKey}
            tierNext={tierNext}
            rating={rating}
            ordersState={ordersState}
            hasLoaded={hasLoaded}
            acceptingId={acceptingId}
            onAccept={(order) => void handleAccept(order)}
            onRetry={() => void fetchOrders('manual')}
            onOpenProfile={() => onChangeView('profile')}
            onOpenOrders={(tab) => onChangeView(tab === 'my_jobs' ? 'my_jobs' : 'new_orders')}
            onOpenNotifications={() => onChangeView('alerts')}
            onOpenCard={(card) => onChangeView(card)}
          />
        ) : isWorkerHomeCard(mainView) ? (
          <WorkerHomeCardScreen
            card={mainView}
            mine={ordersState.mine}
            known={cardKnown}
            rating={rating}
            onBack={() => onChangeView('home')}
          />
        ) : mainView === 'new_orders' ? (
          <NativeWorkerPortal key="new_orders" initialTab="available" orders={orders} user={user} onSessionExpired={onLogout} />
        ) : mainView === 'my_jobs' ? (
          <NativeWorkerPortal key="my_jobs" initialTab="my_jobs" orders={orders} user={user} onSessionExpired={onLogout} />
        ) : mainView === 'profile' ? (
          <WorkerAddressScreen key={user.id} name={user.name} onLogout={onLogout} />
        ) : mainView === 'alerts' ? (
          <NativeNotificationsScreen appearance="worker" />
        ) : (
          <NativeSupportScreen
            appearance="worker"
            user={{ id: user.id, name: user.name || '', phone: user.phone }}
          />
        )}
      </View>
      <WorkerTabBar active={activeTab} newOrdersBadge={newOrdersBadge} onChange={(tab) => onChangeView(tab)} />
    </EdgeSafeAreaView>
  );
}

const styles = StyleSheet.create({
  homeShell: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
