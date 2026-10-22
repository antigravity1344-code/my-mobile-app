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
import { colors, radius, shadowMd, shadowSm, space, type } from '../../theme/customerHome';
import { appStorage } from '../../utils/storage';
import { toPersianDigits } from '../../utils/jalaliDateOptions';
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { isAccountBlockedResponse } from '../../api/accountBlocked';
import type { ApiOrder } from '../../api/types';
import { formatStoredAmount } from '../../features/orders/services/money';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';
import { classifyWorkerOrder, describeWorkerServiceFacts, type WorkerServiceCategory } from './workerServiceCategory';
import {
  canAcceptWorkerOrder,
  canCallWorkerCustomer,
  canCompleteWorkerOrder,
  canReportWorkerStart,
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
  grossOrderAmount: number;
  currencyUnit?: string;
  startReported: boolean | null;
  startStatus: string | null;
  startAcceptanceKey: string | null;
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
      grossOrderAmount: typeof o.price === 'number' ? o.price : 0,
      currencyUnit: o.currencyUnit,
      startReported: typeof o.startReported === 'boolean' ? o.startReported : null,
      startStatus: typeof o.startStatus === 'string' ? o.startStatus : null,
      startAcceptanceKey: typeof o.startAcceptanceKey === 'string' ? o.startAcceptanceKey : null,
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
      // سفارش باز: نام مشتری می‌ماند؛ تلفن، یادداشت و نشانی دقیق قبل از پذیرش نمی‌ماند.
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

  const reportWorkerStart = async (order: NativeOrder) => {
    if (!user?.id || !canReportWorkerStart(order.status, order.startReported, order.startAcceptanceKey)) return;
    if (!beginOrderAction(order.id)) return;
    try {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      const res = await apiFetch('/orders/' + encodeURIComponent(order.id) + '/start', {
        method: 'PUT',
        body: JSON.stringify({ acceptanceKey: order.startAcceptanceKey }),
      });
      if (res.success) {
        setSuccessAlert('شروع کار ثبت شد. مشتری می‌تواند شروع کار را تأیید یا رد کند.');
        setTimeout(() => setSuccessAlert(null), 5000);
      } else if (!isAccountBlockedResponse(res)) {
        showActionError(res.message || 'شروع کار ثبت نشد.');
      }
    } catch {
      showActionError('ارتباط برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید.');
    } finally {
      endOrderAction(order.id);
      void fetchOrders('after-action');
    }
  };

  const confirmReportStart = (order: NativeOrder) => {
    if (!canReportWorkerStart(order.status, order.startReported, order.startAcceptanceKey) || busyOrderIds.includes(order.id)) return;
    Alert.alert(
      'ثبت شروع کار',
      'آیا کار این سفارش را شروع کرده‌اید؟ این اعلام برای تأیید مشتری فرستاده می‌شود.',
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'بله، شروع کردم', onPress: () => void reportWorkerStart(order) },
      ],
    );
  };

  const confirmCompleteOrder = (order: NativeOrder) => {
    if (!user?.id || !canCompleteWorkerOrder(order.status, order.startStatus)) return;
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
    if (!user?.id || !canCompleteWorkerOrder(order.status, order.startStatus)) return;
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
  const reviewJobs = jobHistory.filter((order) => order.status === 'CANCEL_REQUESTED');
  const closedJobs = jobHistory.filter((order) => order.status !== 'CANCEL_REQUESTED');

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

        {order.status === 'CANCEL_REQUESTED' ? (
          <Text style={styles.noteText}>درخواست لغو این سفارش در حال بررسی است. تا پایان بررسی کار را ادامه ندهید.</Text>
        ) : null}

        {canCallWorkerCustomer(order.status, order.phone) ? (
          <View style={styles.actionButtonsRow}>
            <Pressable
              onPress={() => handleCallCustomer(order)}
              style={styles.callButton}
            >
              <Phone size={16} color="#fff" />
              <Text style={styles.callButtonText}>تماس با مشتری ({toPersianDigits(order.phone || '')})</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.wageBox}>
            <Text style={styles.wageLabel}>مبلغ سفارش:</Text>
            <Text style={styles.wageValue}>{formatStoredAmount(order.grossOrderAmount, order.currencyUnit)}</Text>
          </View>
        </View>
        {canReportWorkerStart(order.status, order.startReported, order.startAcceptanceKey) ? (
          <Pressable
            onPress={() => confirmReportStart(order)}
            disabled={busy}
            style={[styles.startButtonFull, busy && styles.buttonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="ثبت شروع کار"
            accessibilityState={{ disabled: busy }}
          >
            <Text style={styles.completeButtonText}>{busy ? 'در حال ثبت...' : 'ثبت شروع کار'}</Text>
          </Pressable>
        ) : active && order.startReported ? (
          <Text style={styles.startStatusText}>شروع کار اعلام شده است.</Text>
        ) : null}
        {canCompleteWorkerOrder(order.status, order.startStatus) ? (
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
            <Briefcase size={22} color={colors.teal} />
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
            سفارش‌های جدید ({toPersianDigits(availableOrders.length)})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('my_jobs')}
          style={[styles.tabItem, activeTab === 'my_jobs' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'my_jobs' && styles.tabTextActive]}>
            کارهای من ({toPersianDigits(activeJobs.length)})
          </Text>
        </Pressable>
      </View>

      {activeTab === 'available' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryViewport}
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

      {loading && <ActivityIndicator size="large" color={colors.teal} style={{marginTop: 20}} />}

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {!loading && activeTab === 'available' ? (
          filteredOrders.length === 0 ? (
            ordersState.error ? null : <View style={styles.emptyBox}>
              <CheckCircle size={40} color="#0284c7" />
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
                    <Text style={styles.wageLabel}>مبلغ سفارش:</Text>
                    <Text style={styles.wageValue}>{formatStoredAmount(order.grossOrderAmount, order.currencyUnit)}</Text>
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
              <Briefcase size={40} color="#0284c7" />
              <Text style={styles.emptyTitle}>هنوز سفارشی نپذیرفته‌اید</Text>
            </View>
          ) : (
            <>
              {reviewJobs.map(renderJobCard)}
              {activeJobs.length === 0 && reviewJobs.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Briefcase size={40} color="#0284c7" />
                  <Text style={styles.emptyTitle}>کار فعالی ندارید</Text>
                </View>
              ) : (
                activeJobs.map(renderJobCard)
              )}
              {closedJobs.length > 0 ? (
                <>
                  <Text style={styles.historyTitle}>سوابق (انجام‌شده و لغوشده)</Text>
                  {closedJobs.map(renderJobCard)}
                </>
              ) : null}
            </>
          )
        ) : null}
      </ScrollView>
    </View>
  );
};

const fa = { writingDirection: 'rtl' as const, includeFontPadding: false };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg
  },
  alertError: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.08)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  alertErrorText: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    flex: 1, color: '#b91c1c', fontSize: 13, textAlign: 'right'
  },
  retryButton: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    minHeight: 44,
  },
  retryButtonText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: '#ffffff', fontSize: 12,
  },
  headerBar: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16
  },
  workerProfile: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 12
  },
  avatarBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'
  },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8
  },
  workerName: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    fontSize: 16, color: colors.text, textAlign: 'right'
  },
  onlineBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: 'rgba(13, 148, 136, 0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(13, 148, 136, 0.25)'
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal
  },
  onlineText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.teal, fontSize: 10,
  },
  workerSub: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    fontSize: 11, color: colors.muted, textAlign: 'right', marginTop: 2
  },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8
  },
  switchButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: colors.teal, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    minHeight: 44,
  },
  switchButtonText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.white, fontSize: 11,
  },
  logoutButton: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    minHeight: 44,
  },
  logoutButtonText: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    color: colors.muted, fontSize: 11,
  },
  alertSuccess: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#6ee7b7', padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 14
  },
  alertSuccessText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: '#065f46', fontSize: 12, flex: 1, textAlign: 'right'
  },
  tabBar: { flexDirection: 'row-reverse', backgroundColor: colors.white, marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.border, ...shadowSm
  },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10,
    minHeight: 44,
  },
  tabItemActive: { backgroundColor: colors.teal
  },
  tabText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.muted, fontSize: 12,
  },
  tabTextActive: { color: colors.white
  },
  categoryViewport: { flexGrow: 0, flexShrink: 0 },
  categoryScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row-reverse', alignItems: 'center'
  },
  categoryChip: { flexShrink: 0, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    minHeight: 44,
  },
  categoryChipActive: { backgroundColor: colors.teal, borderColor: colors.teal
  },
  categoryChipText: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    color: colors.muted, fontSize: 12,
  },
  categoryChipTextActive: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.white,
  },
  listContent: { padding: 16, paddingBottom: 40, gap: 14
  },
  emptyBox: { backgroundColor: colors.white, borderRadius: 24, padding: 24, alignItems: 'center', justifyContent: 'center', marginTop: 20, ...shadowMd
  },
  emptyTitle: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.text, fontSize: 17, marginTop: 12, marginBottom: 6
  },
  emptyDesc: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18
  },
  orderCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, ...shadowMd
  },
  myJobCard: { borderLeftWidth: 4, borderLeftColor: colors.teal
  },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10
  },
  titleArea: { flex: 1, alignItems: 'flex-end'
  },
  serviceTitle: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    fontSize: 14, color: colors.text, textAlign: 'right'
  },
  badgeBox: { backgroundColor: colors.tealSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8
  },
  badgeText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.teal, fontSize: 10,
  },
  inProgressBadge: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8
  },
  inProgressBadgeText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: '#047857', fontSize: 10,
  },
  completedBadge: { backgroundColor: colors.tealSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8
  },
  completedBadgeText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.teal, fontSize: 10,
  },
  cancelledBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8
  },
  cancelledBadgeText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: '#b91c1c', fontSize: 10,
  },
  neutralBadge: { backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: colors.border
  },
  neutralBadgeText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.muted, fontSize: 10,
  },
  historyCard: { opacity: 0.85
  },
  historyTitle: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.muted, fontSize: 12, textAlign: 'right', marginTop: 8
  },
  buttonDisabled: { opacity: 0.6
  },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8
  },
  infoText: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    fontSize: 12, color: colors.muted, textAlign: 'right', flex: 1
  },
  boldText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.text
  },
  noteBox: { backgroundColor: colors.bg, borderRadius: 10, padding: 8, marginBottom: 12, borderWidth: 1, borderColor: colors.border
  },
  noteText: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    color: colors.muted, fontSize: 11, textAlign: 'right'
  },
  actionButtonsRow: { marginTop: 4, marginBottom: 10
  },
  callButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.teal, borderRadius: 12, paddingVertical: 10,
    minHeight: 44,
  },
  callButtonText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.white, fontSize: 12,
  },
  cardFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 4
  },
  wageBox: { alignItems: 'flex-end'
  },
  wageLabel: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    fontSize: 10, color: colors.muted
  },
  wageValue: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    fontSize: 14, color: colors.teal
  },
  acceptButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: colors.teal, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
    minHeight: 44,
  },
  acceptButtonText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.white, fontSize: 12,
  },
  completeButton: { backgroundColor: colors.teal, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    minHeight: 44,
  },
  startButtonFull: { marginTop: 10, backgroundColor: colors.teal, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
  },
  startStatusText: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    marginTop: 10, fontSize: 12, color: colors.teal, textAlign: 'right'
  },
  completeButtonFull: {
    marginTop: 10,
    backgroundColor: colors.teal,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  completeButtonText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: colors.white, fontSize: 11,
  }});
