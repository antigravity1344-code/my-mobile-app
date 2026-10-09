import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Briefcase,
  MapPin,
  Clock,
  CheckCircle,
  Phone,
  User,
} from 'lucide-react-native';
import { UserData } from '../../types/user';
import { appStorage } from '../../utils/storage';
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { isAccountBlockedResponse } from '../../api/accountBlocked';
import type { ApiOrder } from '../../api/types';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';
import { classifyWorkerOrder, describeWorkerServiceFacts, type WorkerServiceCategory } from './workerServiceCategory';
import {
  canAcceptWorkerOrder,
  canCallWorkerCustomer,
  canCompleteWorkerOrder,
  isActiveWorkerJob,
  normalizeWorkerOrderStatus,
  partitionWorkerJobs,
  preAcceptOrderView,
  workerOrderArea,
  workerStatusLabel,
  workerStatusTone,
  type WorkerOrderStatus,
  type WorkerStatusTone,
} from './workerOrderStatus';
import {
  applyWorkerOrdersLoad,
  classifyWorkerOrdersResponse,
  shouldStartWorkerOrdersFetch,
  showsWorkerOrdersSpinner,
  type WorkerOrdersFetchMode,
  type WorkerOrdersResponse,
  type WorkerOrdersState,
} from './workerOrdersFetch';

export type SpecialistCategory = 'all' | 'cleaner' | 'hourly_laborer' | 'painter' | 'sofa_cleaner';

interface NativeOrder {
  id: string;
  serviceTitle: string;
  category: WorkerServiceCategory | null;
  badge: string;
  customerName: string;
  phone: string;
  district: string;
  address: string;
  date: string;
  timeSlot: string;
  wageTotal: number;
  paymentMethod: 'ONLINE' | 'CASH';
  detailsNote: string;
  /** وضعیت خام سرور (CANCELLED/CONFIRMED دیگر به OPEN تبدیل نمی‌شوند). */
  status: WorkerOrderStatus;
  createdAt: string;
}

interface NativeWorkerPortalProps {
  user: UserData;
  onSwitchToCustomer?: () => void;
  onLogout?: () => void;
  /** وقتی سرور نشست را نامعتبر می‌داند (۴۰۱)، دکمه «ورود دوباره» این را صدا می‌زند. */
  onSessionExpired?: () => void;
}

export const NativeWorkerPortal: React.FC<NativeWorkerPortalProps> = ({
  user,
  onSwitchToCustomer,
  onLogout,
  onSessionExpired,
}) => {
  const [activeCategory, setActiveCategory] = useState<SpecialistCategory>('all');
  const [activeTab, setActiveTab] = useState<'available' | 'my_jobs'>('available');
  const [ordersState, setOrdersState] = useState<WorkerOrdersState<NativeOrder>>({
    available: [],
    mine: [],
    error: null,
    sessionExpired: false,
  });
  const availableOrders = ordersState.available;
  const myAcceptedOrders = ordersState.mine;
  const [loading, setLoading] = useState(false);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);
  // تعداد درخواست‌های در جریان و شماره آخرین درخواست؛ پاسخ کهنه‌تر از آخرین درخواست اعمال نمی‌شود.
  const fetchesInFlight = useRef(0);
  const latestFetchId = useRef(0);
  const sessionExpiredRef = useRef(false);
  // جلوگیری از ارسال دوباره پذیرش/تکمیل برای همان سفارش تا پاسخ قبلی برسد
  const actionsInFlight = useRef<Set<string>>(new Set());
  const [busyOrderIds, setBusyOrderIds] = useState<string[]>([]);

  const beginOrderAction = (orderId: string): boolean => {
    if (actionsInFlight.current.has(orderId)) return false;
    actionsInFlight.current.add(orderId);
    setBusyOrderIds(Array.from(actionsInFlight.current));
    return true;
  };

  const endOrderAction = (orderId: string) => {
    actionsInFlight.current.delete(orderId);
    setBusyOrderIds(Array.from(actionsInFlight.current));
  };

  const mapBackendOrder = (o: ApiOrder): NativeOrder => {
    const classified = classifyWorkerOrder(o);
    return {
      id: o.id,
      serviceTitle: o.serviceTitle || 'نظافت منزل',
      category: classified.category,
      badge: classified.badge,
      customerName: o.customerName || 'مشتری',
      phone: o.customerPhone || '',
      district: workerOrderArea(o),
      address: o.address || '',
      date: o.date || 'امروز',
      timeSlot: o.time || 'نامشخص',
      wageTotal: o.price ? Math.round(o.price * 0.8) : 0,
      paymentMethod: o.paymentMethod === 'ONLINE' ? 'ONLINE' : 'CASH',
      detailsNote: describeWorkerServiceFacts(o),
      status: normalizeWorkerOrderStatus(o.status),
      createdAt: o.createdAt || '',
    };
  };

  const fetchOrders = useCallback(async (mode: WorkerOrdersFetchMode) => {
    if (mode === 'poll' && sessionExpiredRef.current) return;
    if (!shouldStartWorkerOrdersFetch(mode, fetchesInFlight.current > 0)) return;
    const fetchId = ++latestFetchId.current;
    fetchesInFlight.current += 1;
    if (showsWorkerOrdersSpinner(mode)) setLoading(true);
    try {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      const available = classifyWorkerOrdersResponse(await apiFetch('/orders/available'));
      let mine: WorkerOrdersResponse | null = null;
      if (user?.id && available.kind !== 'expired' && available.kind !== 'blocked') {
        // توکن سراسری است؛ پیش از درخواست دوم دوباره توکن متخصص گذاشته می‌شود.
        await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
        mine = classifyWorkerOrdersResponse(await apiFetch('/orders'));
      }
      if (fetchId !== latestFetchId.current) return;
      // سفارش باز: فقط محدوده؛ تلفن، نام، یادداشت و نشانی دقیق قبل از پذیرش نگه داشته نمی‌شود.
      const availableMapped: WorkerOrdersResponse =
        available.kind === 'ok'
          ? { kind: 'ok', orders: (available.orders as ApiOrder[]).map((o) => mapBackendOrder(preAcceptOrderView(o))) }
          : available;
      const mineMapped: WorkerOrdersResponse | null =
        mine && mine.kind === 'ok' ? { kind: 'ok', orders: (mine.orders as ApiOrder[]).map(mapBackendOrder) } : mine;
      setOrdersState((prev) => {
        const next = applyWorkerOrdersLoad(prev, { available: availableMapped, mine: mineMapped }, mode);
        sessionExpiredRef.current = next.sessionExpired;
        return next;
      });
    } catch (e) {
      console.warn('Error fetching worker orders', e);
    } finally {
      fetchesInFlight.current -= 1;
      if (fetchId === latestFetchId.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchOrders('initial');
    const interval = setInterval(() => void fetchOrders('poll'), 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const showActionError = (message: string) => {
    Alert.alert('خطا', message, [{ text: 'باشه' }]);
  };

  const handleAcceptOrder = async (order: NativeOrder) => {
    if (!user?.id || !canAcceptWorkerOrder(order.status)) return;
    if (!beginOrderAction(order.id)) return;
    try {
      const res = await apiFetch('/orders/' + order.id + '/accept', {
        method: 'PUT',
        body: JSON.stringify({ cleanerId: user.id }),
      });
      if (res.success) {
        setSuccessAlert('سفارش «' + order.serviceTitle + '» با موفقیت پذیرفته شد.');
        setTimeout(() => setSuccessAlert(null), 5000);
      } else {
        // حساب مسدود: دیالوگ و خروج را useAccountBlockedLogout نشان می‌دهد؛ دیالوگ دوم لازم نیست.
        if (!isAccountBlockedResponse(res)) showActionError(res.message || 'خطا در پذیرش سفارش');
      }
    } catch {
      showActionError('ارتباط برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
    } finally {
      endOrderAction(order.id);
      // بعد از موفقیت یا خطا (مثلاً سفارشی که مشتری لغو کرده) فهرست‌ها تازه می‌شوند تا کارت کهنه نماند.
      void fetchOrders('after-action');
    }
  };

  const confirmCompleteOrder = (order: NativeOrder) => {
    if (!user?.id || !canCompleteWorkerOrder(order.status)) return;
    if (busyOrderIds.includes(order.id)) return;
    Alert.alert(
      'اتمام کار',
      'آیا کار «' + order.serviceTitle + '» واقعاً تمام شده است؟ پس از ثبت، سفارش به‌عنوان انجام‌شده برای مشتری نمایش داده می‌شود.',
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'بله، تمام شد', onPress: () => void handleCompleteOrder(order) },
      ],
      { cancelable: true },
    );
  };

  const handleCompleteOrder = async (order: NativeOrder) => {
    if (!user?.id || !canCompleteWorkerOrder(order.status)) return;
    if (!beginOrderAction(order.id)) return;
    try {
      const res = await apiFetch('/orders/' + order.id + '/complete', {
        method: 'PUT',
        body: JSON.stringify({ cleanerId: user.id }),
      });
      if (res.success) {
        setSuccessAlert('سفارش «' + order.serviceTitle + '» تکمیل شد.');
        setTimeout(() => setSuccessAlert(null), 5000);
      } else {
        // حساب مسدود: دیالوگ و خروج را useAccountBlockedLogout نشان می‌دهد؛ دیالوگ دوم لازم نیست.
        if (!isAccountBlockedResponse(res)) showActionError(res.message || 'خطا در تکمیل سفارش');
      }
    } catch {
      showActionError('ارتباط برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
    } finally {
      endOrderAction(order.id);
      void fetchOrders('after-action');
    }
  };

  const handleCallCustomer = (order: NativeOrder) => {
    if (!canCallWorkerCustomer(order.status, order.phone)) return;
    Linking.openURL('tel:' + order.phone);
  };

  const { active: activeJobs, history: jobHistory } = partitionWorkerJobs(myAcceptedOrders);

  const badgeStyleFor = (tone: WorkerStatusTone) =>
    tone === 'cancelled' ? styles.cancelledBadge : tone === 'completed' ? styles.completedBadge : tone === 'active' ? styles.inProgressBadge : styles.neutralBadge;
  const badgeTextStyleFor = (tone: WorkerStatusTone) =>
    tone === 'cancelled' ? styles.cancelledBadgeText : tone === 'completed' ? styles.completedBadgeText : tone === 'active' ? styles.inProgressBadgeText : styles.neutralBadgeText;

  const renderJobCard = (order: NativeOrder) => {
    const active = isActiveWorkerJob(order.status);
    const tone = workerStatusTone(order.status);
    const busy = busyOrderIds.includes(order.id);
    return (
      <View key={order.id} style={[styles.orderCard, active ? styles.myJobCard : styles.historyCard]}>
        <View style={styles.cardTop}>
          <View style={badgeStyleFor(tone)}>
            <Text style={badgeTextStyleFor(tone)}>{workerStatusLabel(order.status)}</Text>
          </View>
          <View style={styles.titleArea}>
            <Text style={styles.serviceTitle}>{order.serviceTitle}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <MapPin size={16} color={active ? '#059669' : '#94a3b8'} />
          {active ? (
            <Text style={styles.infoText}>
              {order.district ? <Text style={styles.boldText}>{order.district}: </Text> : null}
              {order.address || 'بدون آدرس'}
            </Text>
          ) : (
            <Text style={styles.infoText}>{order.district || 'محدوده نامشخص'}</Text>
          )}
        </View>

        <View style={styles.infoRow}>
          <Clock size={16} color={active ? '#059669' : '#94a3b8'} />
          <Text style={styles.infoText}>{order.date} | {order.timeSlot}</Text>
        </View>

        {canCallWorkerCustomer(order.status, order.phone) ? (
          <View style={styles.actionButtonsRow}>
            <Pressable
              onPress={() => handleCallCustomer(order)}
              style={styles.callButton}
            >
              <Phone size={16} color="#fff" />
              <Text style={styles.callButtonText}>تماس با مشتری ({order.phone})</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.wageBox}>
            <Text style={styles.wageLabel}>مبلغ تسویه:</Text>
            <Text style={styles.wageValue}>{(Number(order.wageTotal) || 0).toLocaleString('fa-IR')} تومان</Text>
          </View>
        </View>
        {canCompleteWorkerOrder(order.status) ? (
          <Pressable
            onPress={() => confirmCompleteOrder(order)}
            disabled={busy}
            style={[styles.completeButtonFull, busy && styles.buttonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="اتمام کار"
            accessibilityState={{ disabled: busy }}
          >
            <Text style={styles.completeButtonText}>{busy ? 'در حال ثبت...' : 'اتمام کار'}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const filteredOrders = availableOrders.filter(order => {
    if (activeCategory === 'all') return true;
    return order.category === activeCategory;
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <View style={styles.workerProfile}>
          <View style={styles.avatarBox}>
            <Briefcase size={22} color="#fff" />
          </View>
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.workerName}>{user?.name || ''}</Text>
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>آماده کار</Text>
              </View>
            </View>
            <Text style={styles.workerSub}>مشاهده و پذیرش سفارشات</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {onSwitchToCustomer && (
            <Pressable onPress={onSwitchToCustomer} style={styles.switchButton}>
              <User size={14} color="#0284c7" />
              <Text style={styles.switchButtonText}>نمای مشتری</Text>
            </Pressable>
          )}
          {onLogout && (
            <Pressable onPress={onLogout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>خروج</Text>
            </Pressable>
          )}
        </View>
      </View>

      {successAlert && (
        <View style={styles.alertSuccess}>
          <CheckCircle size={18} color="#059669" />
          <Text style={styles.alertSuccessText}>{successAlert}</Text>
        </View>
      )}

      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab('available')}
          style={[styles.tabItem, activeTab === 'available' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            سفارش‌های جدید ({availableOrders.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('my_jobs')}
          style={[styles.tabItem, activeTab === 'my_jobs' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'my_jobs' && styles.tabTextActive]}>
            کارهای من ({activeJobs.length})
          </Text>
        </Pressable>
      </View>

      {activeTab === 'available' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.categoryScroll, { flexDirection: 'row-reverse' }]}
        >
          {[
            { id: 'all', label: 'همه تخصص‌ها' },
            { id: 'cleaner', label: 'نظافتچی منزل' },
            { id: 'hourly_laborer', label: 'کارگر ساعتی' },
          ].map(cat => (
            <Pressable
              key={cat.id}
              onPress={() => setActiveCategory(cat.id as SpecialistCategory)}
              style={[
                styles.categoryChip,
                activeCategory === cat.id && styles.categoryChipActive
              ]}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  activeCategory === cat.id && styles.categoryChipTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {ordersState.error ? (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{ordersState.error}</Text>
          {ordersState.sessionExpired ? (
            onSessionExpired ? (
              <Pressable onPress={onSessionExpired} style={styles.retryButton} accessibilityRole="button">
                <Text style={styles.retryButtonText}>ورود دوباره</Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable
              onPress={() => void fetchOrders('manual')}
              disabled={loading}
              style={[styles.retryButton, loading && styles.buttonDisabled]}
              accessibilityRole="button"
            >
              <Text style={styles.retryButtonText}>تلاش دوباره</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {loading && <ActivityIndicator size="large" color="#059669" style={{marginTop: 20}} />}

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {!loading && activeTab === 'available' ? (
          filteredOrders.length === 0 ? (
            ordersState.error ? null : <View style={styles.emptyBox}>
              <CheckCircle size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>سفارشی برای پذیرش موجود نیست</Text>
            </View>
          ) : (
            filteredOrders.map(order => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.cardTop}>
                  {order.badge ? (
                    <View style={styles.badgeBox}>
                      <Text style={styles.badgeText}>{order.badge}</Text>
                    </View>
                  ) : null}
                  <View style={styles.titleArea}>
                    <Text style={styles.serviceTitle}>{order.serviceTitle}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <MapPin size={16} color="#0284c7" />
                  <Text style={styles.infoText}>
                    <Text style={styles.boldText}>{order.district || 'محدوده نامشخص'}</Text>
                    {' — آدرس دقیق و تماس پس از پذیرش نمایش داده می‌شود'}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Clock size={16} color="#0284c7" />
                  <Text style={styles.infoText}>{order.date} | {order.timeSlot}</Text>
                </View>

                {order.detailsNote ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteText}>توضیحات: {order.detailsNote}</Text>
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  <View style={styles.wageBox}>
                    <Text style={styles.wageLabel}>دستمزد کارگر:</Text>
                    <Text style={styles.wageValue}>{(Number(order.wageTotal) || 0).toLocaleString('fa-IR')} تومان</Text>
                  </View>

                  {canAcceptWorkerOrder(order.status) ? (
                    <Pressable
                      onPress={() => handleAcceptOrder(order)}
                      disabled={busyOrderIds.includes(order.id)}
                      style={[styles.acceptButton, busyOrderIds.includes(order.id) && styles.buttonDisabled]}
                      accessibilityState={{ disabled: busyOrderIds.includes(order.id) }}
                    >
                      <CheckCircle size={16} color="#fff" />
                      <Text style={styles.acceptButtonText}>
                        {busyOrderIds.includes(order.id) ? 'در حال پذیرش...' : 'پذیرش سفارش'}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.wageLabel}>{workerStatusLabel(order.status)}</Text>
                  )}
                </View>
              </View>
            ))
          )
        ) : !loading && activeTab === 'my_jobs' ? (
          myAcceptedOrders.length === 0 ? (
            ordersState.error ? null : <View style={styles.emptyBox}>
              <Briefcase size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>هنوز سفارشی نپذیرفته‌اید</Text>
            </View>
          ) : (
            <>
              {activeJobs.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Briefcase size={40} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>کار فعالی ندارید</Text>
                </View>
              ) : (
                activeJobs.map(renderJobCard)
              )}
              {jobHistory.length > 0 ? (
                <>
                  <Text style={styles.historyTitle}>سوابق (انجام‌شده و لغوشده)</Text>
                  {jobHistory.map(renderJobCard)}
                </>
              ) : null}
            </>
          )
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  alertError: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.4)' },
  alertErrorText: { flex: 1, color: '#fecaca', fontSize: 13, fontWeight: '600', textAlign: 'right' },
  retryButton: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  retryButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  headerBar: { backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 16 },
  workerProfile: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatarBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  workerName: { fontSize: 16, fontWeight: '800', color: '#ffffff', textAlign: 'right' },
  onlineBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  onlineText: { color: '#34d399', fontSize: 10, fontWeight: '700' },
  workerSub: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 2 },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  switchButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  switchButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  logoutButton: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  logoutButtonText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  alertSuccess: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#6ee7b7', padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 14 },
  alertSuccessText: { color: '#065f46', fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  tabBar: { flexDirection: 'row-reverse', backgroundColor: '#1e293b', marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 4 },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabItemActive: { backgroundColor: '#059669' },
  tabText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#ffffff' },
  categoryScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row-reverse' },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  categoryChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  categoryChipText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  categoryChipTextActive: { color: '#ffffff', fontWeight: '800' },
  listContent: { padding: 16, paddingBottom: 40, gap: 14 },
  emptyBox: { backgroundColor: '#1e293b', borderRadius: 20, padding: 32, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  emptyTitle: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  emptyDesc: { color: '#94a3b8', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  orderCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  myJobCard: { borderLeftWidth: 4, borderLeftColor: '#059669' },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 10 },
  titleArea: { flex: 1, alignItems: 'flex-end' },
  serviceTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', textAlign: 'right' },
  badgeBox: { backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { color: '#0369a1', fontSize: 10, fontWeight: '700' },
  inProgressBadge: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  inProgressBadgeText: { color: '#047857', fontSize: 10, fontWeight: '700' },
  completedBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  completedBadgeText: { color: '#0369a1', fontSize: 10, fontWeight: '700' },
  cancelledBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  cancelledBadgeText: { color: '#b91c1c', fontSize: 10, fontWeight: '700' },
  neutralBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  neutralBadgeText: { color: '#475569', fontSize: 10, fontWeight: '700' },
  historyCard: { opacity: 0.85 },
  historyTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '800', textAlign: 'right', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoText: { fontSize: 12, color: '#475569', textAlign: 'right', flex: 1 },
  boldText: { fontWeight: '700', color: '#0f172a' },
  noteBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 8, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  noteText: { color: '#64748b', fontSize: 11, textAlign: 'right' },
  actionButtonsRow: { marginTop: 4, marginBottom: 10 },
  callButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 12, paddingVertical: 10 },
  callButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  cardFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, marginTop: 4 },
  wageBox: { alignItems: 'flex-end' },
  wageLabel: { fontSize: 10, color: '#64748b' },
  wageValue: { fontSize: 14, fontWeight: '900', color: '#059669' },
  acceptButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  acceptButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  completeButton: { backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  completeButtonFull: {
    marginTop: 10,
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
});
