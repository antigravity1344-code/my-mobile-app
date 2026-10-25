import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, shadowMd, shadowSm, space, type } from '../../theme/customerHome';
import {
  IconBell,
  IconClock,
  IconPin,
  IconServiceHome,
  IconServicePaint,
  IconServiceSofa,
  IconServiceWorker,
  IconTabCalendar,
  IconTabOrders,
  IconTabUser,
} from './icons/CustomerIcons';
import { Medal, Star } from 'lucide-react-native';
import { toPersianDigits } from '../../utils/jalaliDateOptions';
import { formatStoredAmount } from '../../features/orders/services/money';
import { canAcceptWorkerOrder, partitionWorkerJobs, workerStatusLabel } from './workerOrderStatus';
import type { WorkerOrdersState } from './workerOrdersFetch';
import type { NativeOrder } from './workerOrderMapper';
import {
  WORKER_STAT_PLACEHOLDER,
  workerGreeting,
  workerOrderTimeLabel,
  workerPriceLine,
  workerStatText,
  workerTodayJobsCount,
  workerWeeklyIncome,
} from './workerHomeModel';
import {
  workerWeeklyIncomeJobCount,
  workerWeeklyIncomeNetText,
  workerWeeklyIncomeWeekLabel,
} from './workerWeeklyIncome';
import type { WorkerWeeklyIncomeReport } from '../../features/worker/services/workerFinance';
import { workerTierBadge, workerTierProgressText, type WorkerTierKey, type WorkerTierNext } from './workerTier';
import { workerRatingText, type WorkerRating } from './workerRating';
import { WORKER_HOME_CARD_KEYS, WORKER_HOME_CARD_LABEL, type WorkerHomeCardKey } from './workerHomeCards';

export type WorkerHomeOrdersTab = 'available' | 'my_jobs';

type Props = {
  userName?: string;
  userAvatar?: string;
  /** فقط وقتی سرور اعلان خوانده‌نشده گزارش کند. */
  hasUnread?: boolean;
  /** درجهٔ خود متخصص از سرور (D-71)؛ null یعنی نشانی نمایش داده نشود. */
  tierKey?: WorkerTierKey | null;
  tierNext?: WorkerTierNext | null;
  /** میانگین ستارهٔ خود متخصص (D-73)؛ null یعنی «—». */
  rating?: WorkerRating | null;
  weeklyIncome?: WorkerWeeklyIncomeReport | null;
  weeklyIncomeError?: string | null;
  weeklyIncomeLoading?: boolean;
  ordersState: WorkerOrdersState<NativeOrder>;
  hasLoaded: boolean;
  acceptingId: string | null;
  onAccept: (order: NativeOrder) => void;
  onRetry: () => void;
  onOpenProfile?: () => void;
  onOpenOrders?: (tab: WorkerHomeOrdersTab) => void;
  onOpenNotifications?: () => void;
  onOpenCard?: (card: WorkerHomeCardKey) => void;
};

const fa = { writingDirection: 'rtl' as const, includeFontPadding: false };

const SHORTCUT_ICONS = [IconTabCalendar, IconTabOrders, IconTabCalendar, IconTabUser] as const;

function ServiceIcon({ category }: { category: NativeOrder['category'] }) {
  if (category === 'painter') return <IconServicePaint />;
  if (category === 'sofa_cleaner') return <IconServiceSofa />;
  if (category === 'hourly_laborer') return <IconServiceWorker size={22} />;
  return <IconServiceHome />;
}

function SectionHeader({ title, count, onSeeAll }: { title: string; count?: string; onSeeAll?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count ? (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {onSeeAll ? (
        <Pressable accessibilityRole="link" onPress={onSeeAll} hitSlop={10} style={styles.seeAll}>
          <Text style={styles.seeAllText}>مشاهدهٔ همه</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function WorkerHomeScreen({
  userName,
  userAvatar,
  hasUnread,
  tierKey,
  tierNext,
  rating,
  weeklyIncome,
  weeklyIncomeError,
  weeklyIncomeLoading,
  ordersState,
  hasLoaded,
  acceptingId,
  onAccept,
  onRetry,
  onOpenProfile,
  onOpenOrders,
  onOpenNotifications,
  onOpenCard,
}: Props) {
  const avatarUri = (userAvatar || '').trim();
  const initial = (userName || '').trim().charAt(0);
  const ready = hasLoaded && !ordersState.sessionExpired;
  const failedEmpty = !!ordersState.error && ordersState.available.length === 0 && ordersState.mine.length === 0;
  const known = ready && !failedEmpty;
  const available = ordersState.available;
  const preview = available.slice(0, 2);
  const more = available.length - preview.length;
  const currentJob = partitionWorkerJobs(ordersState.mine).active[0] ?? null;
  const income = workerWeeklyIncome(weeklyIncome);
  const tierBadge = workerTierBadge(tierKey);
  const tierProgress = workerTierProgressText(tierNext);

  const stats = [
    { label: 'کار امروز', value: known ? workerStatText(workerTodayJobsCount(ordersState.mine)) : WORKER_STAT_PLACEHOLDER },
    { label: 'سفارش جدید', value: known ? workerStatText(available.length) : WORKER_STAT_PLACEHOLDER },
    // میانگین ستارهٔ مشتری‌ها و تعدادش (D-73)؛ بدون ستاره یا خطا «—».
    { label: 'امتیاز', value: workerRatingText(rating) },
  ];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* هدر */}
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
        <Text style={styles.wordmark} numberOfLines={1}>پنل متخصصین</Text>
        <View style={styles.headerSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hasUnread ? 'اعلان‌ها، خوانده‌نشده دارید' : 'اعلان‌ها'}
          onPress={onOpenNotifications}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <IconBell />
          {hasUnread ? <View style={styles.notifDot} /> : null}
        </Pressable>
      </View>

      {/* کارت خوش‌آمد و آمار */}
      <View style={styles.hero}>
        <View style={styles.heroTone}>
          <Svg width="100%" height="100%" style={styles.fill}>
            <Defs>
              <LinearGradient id="workerHomeHero" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.08} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0.06} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#workerHomeHero)" />
            <Circle cx="8%" cy="10%" r="56" fill="#FFFFFF" fillOpacity={0.06} />
          </Svg>
        </View>
        <View style={styles.nameRow}>
          <Text style={[styles.welcomeTitle, styles.welcomeTitleInRow]}>{workerGreeting(userName)}</Text>
          {tierBadge ? (
            <View
              accessible
              accessibilityLabel={`سطح ${tierBadge.label}`}
              style={[
                styles.tierBadge,
                { backgroundColor: tierBadge.background, borderColor: tierBadge.border, borderWidth: tierBadge.borderWidth },
              ]}
            >
              {tierBadge.icon === 'star' ? (
                <Star size={12} color={tierBadge.iconColor} fill={tierBadge.iconColor} />
              ) : (
                <Medal size={12} color={tierBadge.iconColor} />
              )}
              <Text style={[styles.tierBadgeText, { color: tierBadge.color }]}>{tierBadge.label}</Text>
            </View>
          ) : null}
        </View>
        {tierProgress && tierNext ? (
          <View style={styles.tierProgress} accessible accessibilityLabel={tierProgress}>
            <Text style={styles.tierProgressText} numberOfLines={2}>{tierProgress}</Text>
            <View style={styles.tierTrack}>
              <View style={[styles.tierFill, { width: `${Math.round(tierNext.progress * 100)}%` }]} />
            </View>
          </View>
        ) : null}
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statBox} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{s.value}</Text>
              <Text style={styles.statLabel} numberOfLines={2}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* سفارش‌های جدید */}
      <SectionHeader
        title="سفارش‌های جدید"
        count={known && available.length > 0 ? toPersianDigits(available.length) : undefined}
        onSeeAll={() => onOpenOrders?.('available')}
      />
      {!hasLoaded ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.teal} />
          <Text style={styles.stateText}>در حال دریافت سفارش‌ها…</Text>
        </View>
      ) : ordersState.sessionExpired ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>{ordersState.error || 'نشست شما به پایان رسیده است.'}</Text>
        </View>
      ) : failedEmpty ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>دریافت سفارش‌ها انجام نشد.</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
            <Text style={styles.secondaryBtnText}>تلاش دوباره</Text>
          </Pressable>
        </View>
      ) : preview.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>فعلاً سفارش جدیدی نیست.</Text>
        </View>
      ) : (
        <>
          {preview.map((order) => {
            const busy = acceptingId === order.id;
            const time = workerOrderTimeLabel(order.rawDate, order.rawTime);
            return (
              <View key={order.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.serviceIcon}>
                    <ServiceIcon category={order.category} />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>{order.serviceTitle}</Text>
                  <View style={styles.newChip}>
                    <Text style={styles.newChipText}>جدید</Text>
                  </View>
                </View>
                {order.district ? (
                  <View style={styles.metaRow}>
                    <IconPin />
                    <Text style={styles.metaText}>{order.district}</Text>
                  </View>
                ) : null}
                {time ? (
                  <View style={styles.metaRow}>
                    <IconClock />
                    <Text style={styles.metaText}>{time}</Text>
                  </View>
                ) : null}
                <Text style={styles.priceText}>
                  {workerPriceLine(order.serviceId, order.rawPrice, (amount) => formatStoredAmount(amount, order.currencyUnit))}
                </Text>
                {canAcceptWorkerOrder(order.status) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!acceptingId, busy }}
                    disabled={!!acceptingId}
                    onPress={() => onAccept(order)}
                    style={({ pressed }) => [styles.primaryBtn, !!acceptingId && styles.disabled, pressed && styles.pressed]}
                  >
                    {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnText}>پذیرش سفارش</Text>}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {more > 0 ? (
            <Pressable accessibilityRole="link" onPress={() => onOpenOrders?.('available')} style={({ pressed }) => [styles.moreLink, pressed && styles.pressed]}>
              <Text style={styles.seeAllText}>مشاهدهٔ {toPersianDigits(more)} سفارش دیگر</Text>
            </Pressable>
          ) : null}
        </>
      )}

      {/* کار جاری */}
      <SectionHeader title="کار جاری" />
      {!known ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>{WORKER_STAT_PLACEHOLDER}</Text>
        </View>
      ) : currentJob ? (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.serviceIcon}>
              <ServiceIcon category={currentJob.category} />
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>{currentJob.serviceTitle}</Text>
            <View style={styles.statusChip}>
              <Text style={styles.statusChipText}>{workerStatusLabel(currentJob.status)}</Text>
            </View>
          </View>
          {currentJob.district ? (
            <View style={styles.metaRow}>
              <IconPin />
              <Text style={styles.metaText}>{currentJob.district}</Text>
            </View>
          ) : null}
          {workerOrderTimeLabel(currentJob.rawDate, currentJob.rawTime) ? (
            <View style={styles.metaRow}>
              <IconClock />
              <Text style={styles.metaText}>{workerOrderTimeLabel(currentJob.rawDate, currentJob.rawTime)}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenOrders?.('my_jobs')}
            style={({ pressed }) => [styles.secondaryBtn, styles.fullBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryBtnText}>مشاهده و مدیریت کار</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>کار جاری ندارید</Text>
        </View>
      )}

      <View style={styles.grid}>
        {WORKER_HOME_CARD_KEYS.map((card, i) => {
          const label = WORKER_HOME_CARD_LABEL[card];
          const Icon = SHORTCUT_ICONS[i];
          return (
            <Pressable
              key={card}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => onOpenCard?.(card)}
              style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
            >
              <View style={styles.shortcutIcon}>
                <Icon color={colors.teal} />
              </View>
              <Text style={styles.shortcutLabel} numberOfLines={2}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>درآمد این هفته</Text>
        <Text style={styles.stateText}>فقط کارهای قطعی‌شده با اسنپ‌شات پایان کار. شارژ کیف پول درآمد کاری نیست.</Text>
        {weeklyIncomeLoading ? (
          <ActivityIndicator color={colors.teal} />
        ) : weeklyIncomeError ? (
          <Text style={styles.stateText}>{weeklyIncomeError}</Text>
        ) : income.available ? (
          <>
            <Text style={styles.metaText}>{workerWeeklyIncomeWeekLabel(income.report)}</Text>
            <Text style={styles.metaText}>{workerWeeklyIncomeJobCount(income.report)}</Text>
            {income.report.totals.map((total) => (
              <View key={total.currencyUnit} style={styles.incomeRow}>
                <Text style={styles.priceText}>
                  {workerWeeklyIncomeNetText(total, (amount, unit) => formatStoredAmount(amount, unit))}
                </Text>
                <Text style={styles.metaText}>
                  مبلغ کارها: {formatStoredAmount(total.grossAmount, total.currencyUnit)} · کمیسیون: {formatStoredAmount(total.commissionAmount, total.currencyUnit)}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.stateText}>گزارش درآمد این هفته دریافت نشد.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.padX, paddingBottom: 24 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', paddingTop: 8, paddingBottom: 8, gap: 8 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tealSoft,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: 44, height: 44 },
  avatarLetter: { ...type.bold, ...fa, fontSize: 16, lineHeight: 22, color: colors.teal, textAlign: 'center' },
  wordmark: { ...type.bold, ...fa, fontSize: 17, lineHeight: 26, color: colors.teal, textAlign: 'right', flexShrink: 1 },
  headerSpacer: { flex: 1 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...shadowSm,
  },
  notifDot: {
    position: 'absolute', top: 9, left: 10, width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.dot, borderWidth: 1.5, borderColor: colors.white,
  },
  hero: {
    backgroundColor: colors.teal, borderRadius: radius.card, paddingTop: 18, paddingHorizontal: 16,
    paddingBottom: 16, marginBottom: 20, ...shadowMd,
  },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  heroTone: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.card,
    overflow: 'hidden', pointerEvents: 'none',
  },
  welcomeTitle: {
    ...type.bold, ...fa, fontSize: 22, lineHeight: 34, color: colors.white, textAlign: 'center', marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  welcomeTitleInRow: { marginBottom: 0 },
  tierBadge: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tierBadgeText: { ...type.semibold, ...fa, fontSize: 11, lineHeight: 18, textAlign: 'center' },
  tierProgress: { marginTop: -6, marginBottom: 14, alignItems: 'center', gap: 6 },
  tierProgressText: { ...type.medium, ...fa, fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.92)', textAlign: 'center' },
  tierTrack: { width: '60%', height: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', flexDirection: 'row-reverse' },
  tierFill: { height: 4, borderRadius: radius.pill, backgroundColor: colors.white },
  statsRow: { flexDirection: 'row-reverse', gap: 8 },
  statBox: {
    flex: 1, minHeight: 64, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4,
  },
  statValue: { ...type.bold, ...fa, fontSize: 20, lineHeight: 28, color: colors.white, textAlign: 'center' },
  statLabel: { ...type.medium, ...fa, fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', marginBottom: 10, gap: 8,
  },
  sectionTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  sectionTitle: { ...type.bold, ...fa, fontSize: 16, lineHeight: 24, color: colors.text, textAlign: 'right' },
  countPill: { minWidth: 26, height: 22, borderRadius: 11, backgroundColor: colors.teal, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countPillText: { ...type.bold, ...fa, fontSize: 12, lineHeight: 16, color: colors.white },
  seeAll: { minHeight: 44, justifyContent: 'center' },
  seeAllText: { ...type.semibold, ...fa, fontSize: 13, lineHeight: 20, color: colors.teal, textAlign: 'center' },
  moreLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, marginBottom: 12 },
  card: {
    backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 12, gap: 8, ...shadowSm,
  },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  serviceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...type.bold, ...fa, flex: 1, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'right' },
  newChip: { borderRadius: 999, backgroundColor: colors.tealSoft, paddingHorizontal: 10, paddingVertical: 3 },
  newChipText: { ...type.semibold, ...fa, fontSize: 12, lineHeight: 18, color: colors.teal },
  statusChip: { borderRadius: 999, backgroundColor: colors.amberBg, paddingHorizontal: 10, paddingVertical: 3, maxWidth: '45%' },
  statusChipText: { ...type.semibold, ...fa, fontSize: 12, lineHeight: 18, color: colors.amberText, textAlign: 'center' },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  metaText: { ...type.regular, ...fa, flex: 1, fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: 'right' },
  incomeRow: { gap: 4 },
  priceText: { ...type.semibold, ...fa, fontSize: 13.5, lineHeight: 21, color: colors.text, textAlign: 'right' },
  primaryBtn: {
    minHeight: 46, borderRadius: radius.button, backgroundColor: colors.teal,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 4,
  },
  primaryBtnText: { ...type.bold, ...fa, fontSize: 14, lineHeight: 20, color: colors.white, textAlign: 'center' },
  secondaryBtn: {
    minHeight: 44, borderRadius: radius.button, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, alignSelf: 'center',
  },
  fullBtn: { alignSelf: 'stretch', marginTop: 4 },
  secondaryBtnText: { ...type.bold, ...fa, fontSize: 14, lineHeight: 20, color: colors.teal, textAlign: 'center' },
  disabled: { opacity: 0.6 },
  stateCard: {
    backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 18, paddingHorizontal: 14, marginBottom: 16, alignItems: 'center', gap: 10, ...shadowSm,
  },
  stateText: { ...type.medium, ...fa, fontSize: 13.5, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 4, marginBottom: 12 },
  shortcut: {
    width: '48.5%', minHeight: 88, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 4,
  },
  shortcutIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { ...type.semibold, ...fa, fontSize: 13, lineHeight: 20, color: colors.text, textAlign: 'center' },
  pressed: { opacity: 0.86 },
});
