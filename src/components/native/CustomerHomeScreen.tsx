import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { useOrders, formatOrderAmount, type OrderItem, type OrderStatus } from '../../features/orders';
import { colors, radius, shadowBtn, shadowMd, shadowSm, space, type } from '../../theme/customerHome';
import {
  IconBell,
  IconChevronBack,
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
} from './icons/CustomerIcons';

const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'در انتظار تأیید',
  ACCEPTED: 'در حال انجام',
  CONFIRMED: 'تأیید شده',
  ASSIGNED: 'تخصیص متخصص',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'انجام شده',
  CANCELLED: 'لغو شده',
};

const STATUS_TONE: Record<OrderStatus, { bg: string; text: string; icon: string }> = {
  PENDING: { bg: colors.amberBg, text: colors.amberText, icon: colors.amberIcon },
  ACCEPTED: { bg: '#E0F2FE', text: '#0369A1', icon: '#0369A1' },
  CONFIRMED: { bg: '#E0F2FE', text: '#0369A1', icon: '#0369A1' },
  ASSIGNED: { bg: '#EDE9FE', text: '#6D28D9', icon: '#6D28D9' },
  IN_PROGRESS: { bg: '#DCFCE7', text: '#15803D', icon: '#15803D' },
  COMPLETED: { bg: '#CCFBF1', text: '#0F766E', icon: '#0F766E' },
  CANCELLED: { bg: '#FEE2E2', text: '#B91C1C', icon: '#B91C1C' },
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
  onStartBooking: (serviceId?: string) => void;
  onOpenOrders: (orderId?: string) => void;
  onOpenNotifications: () => void;
  onOpenSupport: () => void;
};

function greetingTitle(name?: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'سلام';
  const given = trimmed.split(/\s+/)[0];
  return `سلام، ${given}`;
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

export function CustomerHomeScreen({
  userName,
  onStartBooking,
  onOpenOrders,
  onOpenNotifications,
  onOpenSupport,
}: Props) {
  const { allOrders, loading } = useOrders();

  const currentOrder = useMemo(() => {
    const active = allOrders.filter((order) => ACTIVE_STATUSES.includes(order.status));
    active.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return active[0];
  }, [allOrders]);

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
        <View style={styles.greeting}>
          <Text style={styles.greetingTitle}>{greetingTitle(userName)}</Text>
          <Text style={styles.greetingSub}>امروز چه خدمتی نیاز داری؟</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="اعلان‌ها"
            onPress={onOpenNotifications}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <IconBell />
            <View style={styles.notifDot} />
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
        <Text style={styles.ctaTitle}>ثبت سفارش جدید</Text>
        <Text style={styles.ctaDesc}>در چند قدم ساده رزرو کن؛ پرداخت بعد از انجام کار.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="شروع"
          onPress={() => onStartBooking()}
          style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}
        >
          <Text style={styles.ctaBtnText}>شروع</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>خدمات پاکشو</Text>
          <Pressable accessibilityRole="button" onPress={() => onStartBooking()} hitSlop={8}>
            <Text style={styles.sectionLink}>همه خدمات</Text>
          </Pressable>
        </View>
        <View style={styles.serviceGrid}>
          {SERVICE_SHORTCUTS.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => openService(item.serviceId)}
              style={({ pressed }) => [styles.serviceCard, pressed && styles.pressed]}
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
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>سفارش جاری</Text>
          <Pressable accessibilityRole="button" onPress={() => onOpenOrders()} hitSlop={8}>
            <Text style={styles.sectionLink}>مشاهده همه</Text>
          </Pressable>
        </View>
        {currentOrder ? (
          <OrderSummary order={currentOrder} onPress={() => onOpenOrders(currentOrder.id)} />
        ) : loading ? null : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>سفارش جاری ندارید</Text>
          </View>
        )}
      </View>

      <View style={styles.trustRow}>
        <View style={styles.trustItem}>
          <IconShield />
          <Text style={styles.trustText} numberOfLines={1}>
            متخصص تأییدشده
          </Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <IconPriceTag />
          <Text style={styles.trustText} numberOfLines={1}>
            قیمت شفاف
          </Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <IconHeadsetCompact />
          <Text style={styles.trustText} numberOfLines={1}>
            پشتیبانی سریع
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function OrderSummary({ order, onPress }: { order: OrderItem; onPress: () => void }) {
  const tone = STATUS_TONE[order.status] ?? STATUS_TONE.PENDING;
  const time = orderTime(order);
  const place = orderPlace(order);
  const amount = `${formatOrderAmount(order.pricing?.total)} تومان`;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}
    >
      <View style={styles.orderBody}>
        <View style={styles.orderTop}>
          <Text style={styles.orderName} numberOfLines={2}>
            {order.serviceTitle}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
            <IconStatusClock color={tone.icon} />
            <Text style={[styles.statusText, { color: tone.text }]}>{STATUS_LABEL[order.status]}</Text>
          </View>
        </View>
        {time || place ? (
          <View style={styles.orderMeta}>
            {time ? (
              <>
                <IconClock />
                <Text style={styles.metaText}>{time}</Text>
              </>
            ) : null}
            {time && place ? <View style={styles.metaDot} /> : null}
            {place ? (
              <>
                <IconPin />
                <Text style={styles.metaText} numberOfLines={1}>
                  {place}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
        <Text style={styles.orderPrice}>{amount}</Text>
      </View>
      <View style={styles.chevron}>
        <IconChevronBack />
      </View>
    </Pressable>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 22,
    gap: 12,
  },
  greeting: {
    flex: 1,
    minWidth: 0,
  },
  greetingTitle: {
    ...type.bold,
    ...fa,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
    textAlign: 'right',
    marginBottom: 5,
  },
  greetingSub: {
    ...type.regular,
    ...fa,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'right',
  },
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: space.xs,
    paddingTop: 2,
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
    marginBottom: space.lg,
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
    textAlign: 'right',
    marginBottom: 8,
  },
  ctaDesc: {
    ...type.regular,
    ...fa,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'right',
    marginBottom: 16,
    maxWidth: 300,
    alignSelf: 'flex-end',
  },
  ctaBtn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.white,
    borderRadius: radius.button,
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowBtn,
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
  sectionHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    ...type.bold,
    ...fa,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
    textAlign: 'right',
  },
  sectionLink: {
    ...type.medium,
    ...fa,
    fontSize: 12.5,
    lineHeight: 16,
    color: colors.teal,
    textAlign: 'right',
  },
  serviceGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  serviceCard: {
    width: '31.5%',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 6,
    ...shadowMd,
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
    fontSize: 10,
    lineHeight: 13,
    color: colors.text,
    textAlign: 'center',
  },
  orderCard: {
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
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  statusText: {
    ...type.semibold,
    ...fa,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'right',
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
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 12,
    gap: 2,
  },
  trustItem: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 0,
  },
  trustText: {
    ...type.medium,
    ...fa,
    fontSize: 10.5,
    lineHeight: 13,
    color: colors.muted,
    textAlign: 'right',
    flexShrink: 1,
  },
  trustDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
  },
  pressed: {
    opacity: 0.86,
  },
});
