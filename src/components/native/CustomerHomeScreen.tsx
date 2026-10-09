import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { useOrders, formatOrderAmount, type OrderItem, type OrderStatus } from '../../features/orders';
import { colors, radius, shadowCtaBtn, shadowMd, shadowSm, space, type } from '../../theme/customerHome';
import { completedRecencyIso, selectSmartHero } from './selectSmartHero';
import { formatJalaliDateTime } from '../../utils/jalaliDisplay';
import { CUSTOMER_ORDER_STATUS_LABELS } from '../../features/orders/orderStatusLabels';
import { apiFetch } from '../../api/apiClient';
import { unreadCountFromResponse } from '../../features/notifications/notificationsUnread';
import {
  IconBell,
  IconClock,
  IconHeadset,
  IconHeadsetCompact,
  IconPin,
  IconPriceTag,
  IconServiceHome,
  IconServiceOffice,
  IconServicePaint,
  IconServiceSofa,
  IconServiceStairs,
  IconServiceWorker,
  IconShield,
  IconStatusClock,
  IconTabUser,
} from './icons/CustomerIcons';

const STATUS_LABEL: Record<OrderStatus, string> = CUSTOMER_ORDER_STATUS_LABELS;

const STATUS_TONE: Record<OrderStatus, { bg: string; text: string; icon: string }> = {
  PENDING: { bg: colors.amberBg, text: colors.amberText, icon: colors.amberIcon },
  ACCEPTED: { bg: '#E0F2FE', text: '#0369A1', icon: '#0369A1' },
  CONFIRMED: { bg: '#E0F2FE', text: '#0369A1', icon: '#0369A1' },
  ASSIGNED: { bg: '#EDE9FE', text: '#6D28D9', icon: '#6D28D9' },
  IN_PROGRESS: { bg: '#DCFCE7', text: '#15803D', icon: '#15803D' },
  COMPLETED: { bg: '#CCFBF1', text: '#0F766E', icon: '#0F766E' },
  CANCELLED: { bg: '#FEE2E2', text: '#B91C1C', icon: '#B91C1C' },
  UNKNOWN: { bg: '#F1F5F9', text: '#475569', icon: '#64748B' },
};

type Shortcut = {
  label: string;
  serviceId: string;
  Icon: typeof IconServiceHome;
};

const SERVICE_SHORTCUTS: Shortcut[] = [
  { label: 'نظافت منزل', serviceId: 'home_unit_cleaning', Icon: IconServiceHome },
  { label: 'راه‌پله و مشاعات', serviceId: 'staircase_common_areas', Icon: IconServiceStairs },
  { label: 'نظافت محل کار', serviceId: 'office_company_cleaning', Icon: IconServiceOffice },
  { label: 'مبل‌شویی', serviceId: 'sofa_carpet_washing', Icon: IconServiceSofa },
  { label: 'کارگر ساعتی', serviceId: 'hourly_labor', Icon: IconServiceWorker },
  { label: 'نقاشی ساختمان', serviceId: 'building_painting', Icon: IconServicePaint },
];

type Props = {
  userName?: string;
  userAvatar?: string;
  onOpenProfile?: () => void;
  onStartBooking: (serviceId?: string) => void;
  onOpenOrders: (orderId?: string) => void;
  onOpenNotifications: () => void;
  onOpenSupport: () => void;
};

function profileInitial(name?: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0);
}

function orderTime(order: OrderItem): string {
  const label = order.timeSlot?.label?.trim() ?? '';
  if (label && label !== '—') return label;
  const start = order.timeSlot?.startTime?.trim() ?? '';
  if (start && start !== '—') return start;
  return '';
}

function orderPlace(order: OrderItem): string {
  const district = order.address?.district?.trim() ?? '';
  if (district && district !== '—') return district;
  const full = order.address?.fullAddress?.trim() ?? '';
  if (!full || full === '—') return '';
  const first = full.split(/[،,]/)[0]?.trim() ?? '';
  return first;
}

function visibleServiceId(serviceId: string): string | undefined {
  const service = SERVICES_CATALOG.find((item) => item.id === serviceId && item.isVisible);
  return service?.id;
}

function statusLine(status: OrderStatus): string {
  if (status === 'PENDING') return 'سفارش ثبت شده و در انتظار تأیید است.';
  if (status === 'ACCEPTED') return 'سفارش شما در حال پیگیری است.';
  if (status === 'CONFIRMED') return 'سفارش تأیید شده است.';
  if (status === 'ASSIGNED') return 'متخصص برای این سفارش مشخص شده است.';
  if (status === 'IN_PROGRESS') return 'انجام خدمت آغاز شده است.';
  return '';
}

function formatHistoryDate(value: string): string {
  return formatJalaliDateTime(value);
}

function iconForService(serviceId: string): typeof IconServiceHome {
  return SERVICE_SHORTCUTS.find((item) => item.serviceId === serviceId)?.Icon ?? IconServiceHome;
}

export function CustomerHomeScreen({
  userName,
  userAvatar,
  onOpenProfile,
  onStartBooking,
  onOpenOrders,
  onOpenNotifications,
  onOpenSupport,
}: Props) {
  const avatarUri = (userAvatar || '').trim();
  const initial = profileInitial(userName);
  const { allOrders, loading, loadError, refreshing, refreshOrders } = useOrders();

  // نقطه زنگ فقط وقتی اعلان خوانده‌نشده هست؛ خطا یا نامعلوم = بدون نقطه.
  const [unreadCount, setUnreadCount] = useState(0);
  const loadUnreadCount = useCallback(async () => {
    const res = await apiFetch('/notifications');
    setUnreadCount(unreadCountFromResponse(res));
  }, []);

  useEffect(() => {
    void refreshOrders({ silent: true });
    void loadUnreadCount();
  }, [refreshOrders, loadUnreadCount]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refreshOrders({ silent: true });
        void loadUnreadCount();
      }
    });
    return () => subscription.remove();
  }, [refreshOrders, loadUnreadCount]);

  const hero = useMemo(
    () =>
      selectSmartHero(
        allOrders,
        { loading: loading || refreshing, error: loadError },
        (serviceId) => Boolean(visibleServiceId(serviceId)),
      ),
    [allOrders, loading, refreshing, loadError],
  );

  const openService = (serviceId: string) => {
    onStartBooking(visibleServiceId(serviceId));
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="پروفایل"
          onPress={onOpenProfile}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : initial ? (
            <Text style={styles.avatarLetter}>{initial}</Text>
          ) : (
            <IconTabUser size={20} color={colors.teal} strokeWidth={1.7} />
          )}
        </Pressable>
        <Text style={styles.wordmark}>پاکشو</Text>
        <View style={styles.headerSpacer} />
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="اعلان‌ها"
            onPress={onOpenNotifications}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <IconBell />
            {unreadCount > 0 ? <View style={styles.notifDot} /> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="پشتیبانی"
            onPress={onOpenSupport}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <IconHeadset />
          </Pressable>
        </View>
      </View>

      {hero.kind === 'loading' ? <HeroSkeleton /> : null}
      {hero.kind === 'error' ? (
        <View style={styles.heroError}>
          <Text style={styles.heroErrorTitle}>خواندن سفارش‌ها انجام نشد</Text>
          <Text style={styles.heroErrorText}>لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refreshOrders()}
            style={({ pressed }) => [styles.heroRetry, pressed && styles.pressed]}
          >
            <Text style={styles.heroRetryText}>تلاش دوباره</Text>
          </Pressable>
        </View>
      ) : null}
      {hero.kind === 'active' ? (
        <ActiveOrderHero
          order={hero.order}
          otherActiveCount={hero.otherActiveCount}
          onOpen={() => onOpenOrders(hero.order.id)}
          onOpenAll={() => onOpenOrders()}
        />
      ) : null}
      {hero.kind === 'reorder' ? (
        <ReorderHero order={hero.order} onReorder={() => onStartBooking(hero.preselectServiceId)} />
      ) : null}
      {hero.kind === 'none' ? <WelcomeHero /> : null}

      <View style={[styles.section, styles.servicesSection]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, styles.servicesTitle]}>خدمات پاکشو</Text>
        </View>
        <View style={styles.serviceGrid}>
          {[SERVICE_SHORTCUTS.slice(0, 3), SERVICE_SHORTCUTS.slice(3)].map((row) => (
            <View key={row[0].serviceId} style={styles.serviceRow}>
              {row.map((item) => (
                <Pressable
                  key={item.serviceId}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  android_ripple={{ color: colors.servicePress, foreground: true }}
                  onPress={() => openService(item.serviceId)}
                  style={(state) => {
                    const hovered = 'hovered' in state && Boolean((state as { hovered?: boolean }).hovered);
                    return [styles.serviceCard, (state.pressed || hovered) && styles.serviceCardPressed];
                  }}
                >
                  <View style={styles.serviceIcon}>
                    <item.Icon size={18} />
                  </View>
                  <Text style={styles.serviceName} numberOfLines={2}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.trustRow}>
        <View style={styles.trustItem}>
          <IconShield />
          <Text style={styles.trustText}>متخصص تأییدشده</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <IconPriceTag />
          <Text style={styles.trustText}>قیمت شفاف</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <IconHeadsetCompact />
          <Text style={styles.trustText}>پشتیبانی سریع</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function HeroSkeleton() {
  return (
    <View style={styles.heroSkeleton}>
      <View style={styles.skelLine} />
      <View style={[styles.skelLine, styles.skelLineShort]} />
      <View style={styles.skelButton} />
    </View>
  );
}

function ActiveOrderHero({
  order,
  otherActiveCount,
  onOpen,
  onOpenAll,
}: {
  order: OrderItem;
  otherActiveCount: number;
  onOpen: () => void;
  onOpenAll: () => void;
}) {
  const tone = STATUS_TONE[order.status] ?? STATUS_TONE.PENDING;
  const time = orderTime(order);
  const place = orderPlace(order);
  const amount = `${formatOrderAmount(order.pricing?.total)} تومان`;
  const others = otherActiveCount.toLocaleString('fa-IR');

  return (
    <View style={styles.cta}>
      <View style={styles.ctaTone}>
        <Svg width="100%" height="100%" style={styles.fill}>
          <Defs>
            <LinearGradient id="customerHomeCta" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.06} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.04} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#customerHomeCta)" />
        </Svg>
      </View>
      <View style={styles.heroTop}>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {order.serviceTitle}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <IconStatusClock color={tone.icon} />
          <Text style={[styles.statusText, { color: tone.text }]}>{STATUS_LABEL[order.status]}</Text>
        </View>
      </View>
      <Text style={styles.heroLine}>{statusLine(order.status)}</Text>
      {time || place ? (
        <View style={styles.orderMeta}>
          {time ? (
            <>
              <IconClock color="rgba(255,255,255,0.8)" />
              <Text style={styles.heroMeta}>{time}</Text>
            </>
          ) : null}
          {time && place ? <View style={styles.heroDot} /> : null}
          {place ? (
            <>
              <IconPin color="rgba(255,255,255,0.8)" />
              <Text style={styles.heroMeta} numberOfLines={1}>
                {place}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.heroAmount}>{amount}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="پیگیری سفارش"
        onPress={onOpen}
        style={({ pressed }) => [styles.ctaBtn, styles.heroCtaBtn, pressed && styles.pressed]}
      >
        <Text style={styles.ctaBtnText}>پیگیری سفارش</Text>
      </Pressable>
      {otherActiveCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={onOpenAll} hitSlop={8} style={styles.heroMore}>
          <Text style={styles.heroMoreText}>{`+${others} سفارش فعال دیگر · مشاهده همه`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReorderHero({ order, onReorder }: { order: OrderItem; onReorder: () => void }) {
  const ServiceIcon = iconForService(order.serviceId);
  const when = formatHistoryDate(completedRecencyIso(order));

  return (
    <View style={styles.reorderCard}>
      <View style={styles.reorderRow}>
        <View style={styles.reorderIcon}>
          <ServiceIcon size={22} />
        </View>
        <View style={styles.reorderCopy}>
          <Text style={styles.reorderLabel}>آخرین خدمت</Text>
          <Text style={styles.reorderTitle} numberOfLines={2}>
            {order.serviceTitle}
          </Text>
          {when ? <Text style={styles.reorderDate}>{`آخرین سفارش: ${when}`}</Text> : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="سفارش مجدد"
        onPress={onReorder}
        style={({ pressed }) => [styles.reorderBtn, pressed && styles.pressed]}
      >
        <Text style={styles.reorderBtnText}>سفارش مجدد</Text>
      </Pressable>
    </View>
  );
}

function WelcomeHero() {
  return (
    <View style={styles.cta}>
      <View style={styles.ctaTone}>
        <Svg width="100%" height="100%" style={styles.fill}>
          <Defs>
            <LinearGradient id="customerHomeWelcome" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.06} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.04} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#customerHomeWelcome)" />
          <Circle cx="8%" cy="12%" r="56" fill="#FFFFFF" fillOpacity={0.06} />
          <Circle cx="20%" cy="100%" r="40" fill="#FFFFFF" fillOpacity={0.04} />
        </Svg>
      </View>
      <Text style={styles.welcomeTitle}>به پاکشو خوش آمدید!</Text>
      <Text style={styles.welcomeDesc}>متخصصین متعهد برای نظافت و خدمات منزل شما.</Text>
      <View style={styles.welcomeDivider} />
      <Text style={styles.welcomeHint}>خدمت مورد نظرتان را از لیست زیر انتخاب کنید ↓</Text>
    </View>
  );
}

const fa = {
  writingDirection: 'rtl' as const,
  includeFontPadding: false,
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: space.padX,
    paddingBottom: space.sm,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
  },
  avatarLetter: {
    ...type.bold,
    ...fa,
    fontSize: 16,
    lineHeight: 20,
    color: colors.teal,
    textAlign: 'center',
  },
  wordmark: {
    ...type.bold,
    ...fa,
    fontSize: 18,
    lineHeight: 24,
    color: colors.teal,
    textAlign: 'right',
  },
  headerSpacer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: space.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowSm,
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    left: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.dot,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  cta: {
    backgroundColor: colors.teal,
    borderRadius: radius.card,
    minHeight: 152,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginBottom: 20,
    ...shadowMd,
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  ctaTone: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.card,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  ctaTitle: {
    ...type.bold,
    ...fa,
    fontSize: 17,
    lineHeight: 24,
    color: colors.white,
    textAlign: 'center',
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  ctaDesc: {
    ...type.regular,
    ...fa,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  ctaDescSecond: {
    marginTop: 4,
    marginBottom: 16,
  },
  ctaBtn: {
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.button,
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCtaBtn,
  },
  heroCtaBtn: {
    alignSelf: 'flex-end',
  },
  ctaBtnText: {
    ...type.bold,
    ...fa,
    fontSize: 14,
    lineHeight: 20,
    color: colors.teal,
    textAlign: 'center',
  },
  section: {
    marginBottom: space.lg,
  },
  servicesSection: {
    marginBottom: 20,
  },
  sectionHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  orderHead: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  orderTitle: {
    flexShrink: 1,
    textAlign: 'right',
    paddingRight: 8,
  },
  orderLink: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 21,
    color: colors.teal,
    textAlign: 'left',
    paddingLeft: 8,
  },
  sectionTitle: {
    ...type.bold,
    ...fa,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
    textAlign: 'right',
  },
  servicesTitle: {
    width: '100%',
    textAlign: 'center',
  },
  serviceGrid: {
    gap: 8,
  },
  serviceRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 8,
  },
  serviceCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 6,
    minHeight: 80,
    ...shadowMd,
  },
  serviceCardPressed: {
    backgroundColor: colors.servicePress,
    borderColor: colors.servicePressBorder,
  },
  serviceIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceName: {
    ...type.medium,
    ...fa,
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 26,
    fontSize: 10,
    lineHeight: 13,
    color: colors.text,
    textAlign: 'center',
  },
  orderCard: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 16,
    paddingBottom: 18,
    paddingRight: 14,
    paddingLeft: 10,
    gap: 8,
    ...shadowMd,
  },
  orderBody: {
    flex: 1,
    minWidth: 0,
  },
  orderTop: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  orderName: {
    ...type.bold,
    ...fa,
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.text,
    textAlign: 'right',
  },
  statusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 24,
    marginTop: 0,
    marginBottom: 0,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 0,
    flexShrink: 0,
  },
  statusText: {
    ...type.semibold,
    ...fa,
    marginTop: 0,
    marginBottom: 0,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'right',
    textAlignVertical: 'center',
  },
  orderMeta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  metaText: {
    ...type.regular,
    ...fa,
    fontSize: 12.5,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'right',
    flexShrink: 1,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.mutedLight,
  },
  orderPrice: {
    ...type.bold,
    ...fa,
    fontSize: 14,
    lineHeight: 18,
    color: colors.teal,
    textAlign: 'right',
  },
  chevron: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    paddingHorizontal: 14,
    ...shadowMd,
  },
  emptyText: {
    ...type.medium,
    ...fa,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'right',
  },
  trustRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.trust,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 12,
    gap: 6,
  },
  trustItem: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
  },
  trustText: {
    ...type.medium,
    ...fa,
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'right',
    textAlignVertical: 'center',
  },
  trustDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 2,
    backgroundColor: colors.border,
  },
  heroTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  heroTitle: {
    ...type.bold,
    ...fa,
    flex: 1,
    marginTop: 0,
    marginBottom: 0,
    fontSize: 17,
    lineHeight: 24,
    color: colors.white,
    textAlign: 'right',
    textAlignVertical: 'center',
  },
  heroLine: {
    ...type.regular,
    ...fa,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'right',
    marginBottom: 8,
  },
  heroMeta: {
    ...type.regular,
    ...fa,
    fontSize: 12.5,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'right',
    flexShrink: 1,
  },
  heroDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  heroAmount: {
    ...type.bold,
    ...fa,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
    textAlign: 'right',
    marginBottom: 16,
  },
  heroMore: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  heroMoreText: {
    ...type.medium,
    ...fa,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.white,
    textAlign: 'right',
  },
  heroSkeleton: {
    minHeight: 168,
    borderRadius: radius.card,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 20,
    gap: 12,
  },
  skelLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.tealSoft,
    width: '70%',
    alignSelf: 'flex-end',
  },
  skelLineShort: {
    width: '42%',
  },
  skelButton: {
    height: 44,
    width: 140,
    borderRadius: radius.button,
    backgroundColor: colors.tealSoft,
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  heroError: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: '#F3D4BE',
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  heroErrorTitle: {
    ...type.bold,
    ...fa,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    textAlign: 'right',
  },
  heroErrorText: {
    ...type.regular,
    ...fa,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'right',
  },
  heroRetry: {
    alignSelf: 'flex-end',
    backgroundColor: colors.teal,
    borderRadius: radius.button,
    minHeight: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRetryText: {
    ...type.bold,
    ...fa,
    fontSize: 13,
    lineHeight: 18,
    color: colors.white,
  },
  reorderCard: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 168,
    padding: 16,
    marginBottom: 20,
    gap: 16,
    ...shadowMd,
  },
  reorderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  reorderIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  reorderLabel: {
    ...type.medium,
    ...fa,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'right',
  },
  reorderTitle: {
    ...type.bold,
    ...fa,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    textAlign: 'right',
  },
  reorderDate: {
    ...type.regular,
    ...fa,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'right',
  },
  reorderBtn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.teal,
    borderRadius: radius.button,
    minHeight: 44,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnText: {
    ...type.bold,
    ...fa,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
  },
  welcomeTitle: {
    ...type.bold,
    ...fa,
    fontSize: 18,
    lineHeight: 26,
    color: colors.white,
    textAlign: 'right',
    marginBottom: 8,
  },
  welcomeDesc: {
    ...type.regular,
    ...fa,
    fontSize: 13.5,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'right',
  },
  welcomeDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginTop: 16,
    marginBottom: 12,
  },
  welcomeHint: {
    ...type.medium,
    ...fa,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.86,
  },
});
