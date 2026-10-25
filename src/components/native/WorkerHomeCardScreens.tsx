import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatStoredAmount } from '../../features/orders/services/money';
import { loadWorkerWallet, type WorkerWallet } from '../../features/worker/services/workerFinance';
import { colors, radius, shadowSm, space, type } from '../../theme/customerHome';
import { toPersianDigits } from '../../utils/jalaliDateOptions';
import {
  WORKER_FEEDBACK_PRIVACY_NOTE,
  WORKER_HOME_CARD_LABEL,
  WORKER_SERVICES_NOTE,
  WORKER_TRANSACTIONS_NOTE,
  workerCalendarDays,
  workerCalendarWeek,
  workerFeedbackEmpty,
  workerFeedbackStats,
  workerLedgerCreditRows,
  workerLedgerRows,
  workerLedgerWorkRows,
  workerServiceRows,
  type WorkerHomeCardKey,
  type WorkerLedgerRow,
} from './workerHomeCards';
import { previewActive } from './previewRuntime';
import type { NativeOrder } from './workerOrderMapper';
import type { WorkerRating } from './workerRating';
import {
  SKILLS_PREVIEW_BLOCKED,
  initialSkillsState,
  loadWorkerSkills,
  saveWorkerSkills,
  workerSkillsReducer,
} from './workerSkills';

const fa = { writingDirection: 'rtl' as const, includeFontPadding: false };

type CardScreenProps = {
  title: string;
  onBack: () => void;
  children: ReactNode;
};

function CardScreen({ title, onBack, children }: CardScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="بازگشت" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>بازگشت</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

function StateBlock({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateText}>{text}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>تلاش دوباره</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function WorkerCalendarScreen({
  mine,
  known,
  onBack,
}: {
  mine: readonly NativeOrder[];
  known: boolean;
  onBack: () => void;
}) {
  const week = workerCalendarWeek(mine);
  const days = workerCalendarDays(mine);
  return (
    <CardScreen title={WORKER_HOME_CARD_LABEL.calendar} onBack={onBack}>
      <Text style={styles.note}>رزروها و نوبت‌های کاری ثبت‌شده به تفکیک روز و وضعیت. برنامهٔ آزاد جداگانه‌ای وجود ندارد.</Text>
      <View style={styles.weekRow}>
        {week.map((day) => (
          <View
            key={day.key}
            style={[styles.weekCell, day.isToday && styles.weekCellToday]}
            accessible
            accessibilityLabel={`${day.weekday} ${day.dayNumber}، ${toPersianDigits(day.jobCount)} کار`}
          >
            <Text style={[styles.weekLabel, day.isToday && styles.weekTodayText]}>{day.weekday}</Text>
            <Text style={[styles.weekDay, day.isToday && styles.weekTodayText]}>{day.dayNumber}</Text>
            <Text style={[styles.weekCount, day.isToday && styles.weekTodayText]}>
              {day.jobCount > 0 ? toPersianDigits(day.jobCount) : '·'}
            </Text>
          </View>
        ))}
      </View>
      {!known ? (
        <StateBlock text="در حال دریافت کارهای ثبت‌شده…" />
      ) : days.length === 0 ? (
        <StateBlock text="رزرو یا نوبت کاری ثبت‌شده‌ای نیست." />
      ) : (
        days.map((group) => (
          <View key={group.key} style={styles.card}>
            <Text style={styles.sectionTitle}>{group.title}</Text>
            {group.jobs.map((job) => (
              <View key={job.id} style={styles.jobRow}>
                <View style={styles.jobText}>
                  <Text style={styles.jobTitle}>{job.title}</Text>
                  {job.timeLabel ? <Text style={styles.meta}>{job.timeLabel}</Text> : null}
                </View>
                <View style={[styles.statusChip, job.tone === 'cancelled' && styles.statusChipCancel, job.tone === 'completed' && styles.statusChipDone]}>
                  <Text style={styles.statusChipText}>{job.statusLabel}</Text>
                </View>
              </View>
            ))}
          </View>
        ))
      )}
    </CardScreen>
  );
}

export function WorkerServicesScreen({ onBack }: { onBack: () => void }) {
  const [state, dispatch] = useReducer(workerSkillsReducer, initialSkillsState);
  const request = useRef<AbortController | null>(null);
  const preview = previewActive();

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    dispatch({ type: 'load' });
    const result = await loadWorkerSkills(controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    dispatch({ type: 'loaded', result });
  }, []);

  useEffect(() => {
    void load();
    return () => { request.current?.abort(); request.current = null; };
  }, [load]);

  const save = async () => {
    if (request.current || state.phase !== 'ready' || state.sessionExpired) return;
    if (preview) {
      dispatch({ type: 'saved', result: { ok: false, message: SKILLS_PREVIEW_BLOCKED } });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    dispatch({ type: 'save' });
    const result = await saveWorkerSkills(state.draft, controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    dispatch({ type: 'saved', result });
  };

  const rows = workerServiceRows(state.draft);
  const dirty = state.saved != null && state.draft.slice().sort().join('\0') !== state.saved.slice().sort().join('\0');
  const canEdit = state.phase === 'ready' && !state.sessionExpired && !preview;

  return (
    <CardScreen title={WORKER_HOME_CARD_LABEL.services} onBack={onBack}>
      <Text style={styles.note}>{WORKER_SERVICES_NOTE}</Text>
      {preview ? <Text style={styles.note}>در پیش‌نمایش ذخیره انجام نمی‌شود.</Text> : null}
      {state.phase === 'loading' ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.teal} />
          <Text style={styles.stateText}>در حال دریافت خدمات…</Text>
        </View>
      ) : state.phase === 'loadError' ? (
        <StateBlock text={state.message || 'دریافت خدمات انجام نشد.'} onRetry={state.sessionExpired ? undefined : () => void load()} />
      ) : (
        rows.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canEdit, selected: row.active }}
            accessibilityLabel={`${row.title}، ${row.active ? 'فعال' : 'غیرفعال'}`}
            disabled={!canEdit}
            onPress={() => dispatch({ type: 'toggle', serviceId: row.id })}
            style={({ pressed }) => [styles.card, styles.serviceRow, pressed && styles.pressed]}
          >
            <View style={styles.jobText}>
              <Text style={styles.jobTitle}>{row.title}</Text>
              {row.badge ? <Text style={styles.meta}>{row.badge}</Text> : null}
              {!row.known ? <Text style={styles.meta}>مهارت ثبت‌شده خارج از کاتالوگ جاری</Text> : null}
            </View>
            <View style={[styles.statusChip, row.active ? styles.statusChipDone : styles.statusChipIdle]}>
              <Text style={styles.statusChipText}>{row.active ? 'فعال' : 'غیرفعال'}</Text>
            </View>
          </Pressable>
        ))
      )}
      {state.sessionExpired ? <Text style={styles.error}>برای ادامه دوباره وارد شوید.</Text> : null}
      {state.message ? <Text style={[styles.note, state.error && styles.error]}>{state.message}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canEdit || !dirty || state.phase === 'saving', busy: state.phase === 'saving' }}
        disabled={!canEdit || !dirty || state.phase === 'saving'}
        onPress={() => void save()}
        style={[styles.primaryBtn, (!canEdit || !dirty) && styles.disabled]}
      >
        {state.phase === 'saving' ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnText}>ذخیره فهرست خدمات</Text>}
      </Pressable>
    </CardScreen>
  );
}

function LedgerBlock({ title, rows, empty }: { title: string; rows: WorkerLedgerRow[]; empty: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.length === 0 ? <Text style={styles.meta}>{empty}</Text> : rows.map((item) => (
        <View key={item.id} style={styles.ledgerItem}>
          <View style={styles.jobRow}>
            <Text style={styles.jobTitle}>{item.title}</Text>
            <Text style={styles.amount}>{formatStoredAmount(item.amount, item.currencyUnit)}</Text>
          </View>
          <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString('fa-IR')}</Text>
          {item.kind === 'commission' && item.grossAmount !== null ? (
            <Text style={styles.meta}>مبلغ کار: {formatStoredAmount(item.grossAmount, item.currencyUnit)}</Text>
          ) : null}
          {item.kind === 'commission' && item.commissionAmount !== null ? (
            <Text style={styles.meta}>کمیسیون: {formatStoredAmount(item.commissionAmount, item.currencyUnit)}</Text>
          ) : null}
          {item.kind === 'commission' && item.netAmount !== null ? (
            <Text style={styles.meta}>سهم خالص کار: {formatStoredAmount(item.netAmount, item.currencyUnit)}</Text>
          ) : null}
          {item.kind === 'commission' && item.ratePercent !== null ? (
            <Text style={styles.meta}>درصد کمیسیون: {toPersianDigits(item.ratePercent)}٪</Text>
          ) : null}
          {item.kind === 'topup' ? <Text style={styles.meta}>شارژ اعتبار؛ درآمد کاری نیست.</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function WorkerTransactionsScreen({ onBack }: { onBack: () => void }) {
  const [wallet, setWallet] = useState<WorkerWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWallet(null);
    const result = await loadWorkerWallet();
    if (result.success) setWallet(result.value);
    else setError(result.message);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const rows = workerLedgerRows(wallet);

  return (
    <CardScreen title={WORKER_HOME_CARD_LABEL.transactions} onBack={onBack}>
      <Text style={styles.note}>{WORKER_TRANSACTIONS_NOTE}</Text>
      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.teal} />
          <Text style={styles.stateText}>در حال دریافت گردش مالی…</Text>
        </View>
      ) : error ? (
        <StateBlock text={error} onRetry={() => void refresh()} />
      ) : wallet ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>مانده اعتبار کمیسیون</Text>
            {wallet.balances.length === 0 ? (
              <Text style={styles.meta}>مانده‌ای ثبت نشده است.</Text>
            ) : wallet.balances.map((item, index) => (
              <View key={`${item.currencyUnit}-${index}`} style={styles.jobRow}>
                <Text style={styles.meta}>{item.currencyUnit}</Text>
                <Text style={styles.amount}>{formatStoredAmount(item.balance, item.currencyUnit)}</Text>
              </View>
            ))}
            {!wallet.canAcceptNewOrders ? (
              <Text style={styles.error}>به‌دلیل مانده منفی، پذیرش سفارش جدید ممکن نیست.</Text>
            ) : null}
          </View>
          <LedgerBlock title="کمیسیون کارها" rows={workerLedgerWorkRows(rows)} empty="کسر کمیسیونی ثبت نشده است." />
          <LedgerBlock title="شارژ اعتبار" rows={workerLedgerCreditRows(rows)} empty="شارژ ثبت‌شده‌ای نیست." />
        </>
      ) : (
        <StateBlock text="گردش مالی دریافت نشد." onRetry={() => void refresh()} />
      )}
    </CardScreen>
  );
}

export function WorkerFeedbacksScreen({
  rating,
  onBack,
}: {
  rating: WorkerRating | null;
  onBack: () => void;
}) {
  const stats = workerFeedbackStats(rating);
  return (
    <CardScreen title={WORKER_HOME_CARD_LABEL.feedbacks} onBack={onBack}>
      <Text style={styles.note}>{WORKER_FEEDBACK_PRIVACY_NOTE}</Text>
      <View style={styles.card} accessible accessibilityLabel={`امتیاز آماری: ${stats.headline}`}>
        <Text style={styles.sectionTitle}>امتیاز آماری</Text>
        <Text style={styles.statValue}>{stats.headline}</Text>
        {workerFeedbackEmpty(stats) ? (
          <Text style={styles.meta}>هنوز امتیاز ثبت‌شده‌ای نیست.</Text>
        ) : (
          <Text style={styles.meta}>
            میانگین {toPersianDigits((stats.average ?? 0).toFixed(1)).replace('.', '٫')} از ۵، از {toPersianDigits(stats.count)} ارزیابی
          </Text>
        )}
      </View>
    </CardScreen>
  );
}

export function WorkerHomeCardScreen({
  card,
  mine,
  known,
  rating,
  onBack,
}: {
  card: WorkerHomeCardKey;
  mine: readonly NativeOrder[];
  known: boolean;
  rating: WorkerRating | null;
  onBack: () => void;
}) {
  if (card === 'calendar') return <WorkerCalendarScreen mine={mine} known={known} onBack={onBack} />;
  if (card === 'services') return <WorkerServicesScreen onBack={onBack} />;
  if (card === 'transactions') return <WorkerTransactionsScreen onBack={onBack} />;
  return <WorkerFeedbacksScreen rating={rating} onBack={onBack} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: space.padX,
    paddingTop: 8, paddingBottom: 8, gap: 8,
  },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  backText: { ...type.semibold, ...fa, fontSize: 14, lineHeight: 22, color: colors.teal, textAlign: 'center' },
  title: { ...type.bold, ...fa, flex: 1, fontSize: 17, lineHeight: 26, color: colors.text, textAlign: 'center' },
  headerSpacer: { width: 48 },
  content: { paddingHorizontal: space.padX, paddingBottom: 24, gap: 12 },
  note: { ...type.medium, ...fa, fontSize: 13.5, lineHeight: 22, color: colors.muted, textAlign: 'right' },
  weekRow: { flexDirection: 'row-reverse', gap: 6 },
  weekCell: {
    flex: 1, minHeight: 72, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, ...shadowSm,
  },
  weekCellToday: { backgroundColor: colors.teal, borderColor: colors.teal },
  weekLabel: { ...type.medium, ...fa, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  weekDay: { ...type.bold, ...fa, fontSize: 16, lineHeight: 22, color: colors.text, textAlign: 'center' },
  weekCount: { ...type.regular, ...fa, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  weekTodayText: { color: colors.white },
  card: {
    backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border,
    padding: 14, gap: 8, ...shadowSm,
  },
  sectionTitle: { ...type.bold, ...fa, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'right' },
  jobRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  jobText: { flex: 1, gap: 2 },
  jobTitle: { ...type.semibold, ...fa, fontSize: 14, lineHeight: 22, color: colors.text, textAlign: 'right' },
  meta: { ...type.regular, ...fa, fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: 'right' },
  amount: { ...type.bold, ...fa, fontSize: 14, lineHeight: 22, color: colors.text, textAlign: 'left' },
  statusChip: { borderRadius: 999, backgroundColor: colors.amberBg, paddingHorizontal: 10, paddingVertical: 3, maxWidth: '42%' },
  statusChipDone: { backgroundColor: colors.tealSoft },
  statusChipIdle: { backgroundColor: colors.bg },
  statusChipCancel: { backgroundColor: '#F8E6EA' },
  statusChipText: { ...type.semibold, ...fa, fontSize: 12, lineHeight: 18, color: colors.teal, textAlign: 'center' },
  serviceRow: { flexDirection: 'row-reverse', alignItems: 'center' },
  stateCard: {
    backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 18, paddingHorizontal: 14, alignItems: 'center', gap: 10, ...shadowSm,
  },
  stateText: { ...type.medium, ...fa, fontSize: 13.5, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  primaryBtn: {
    minHeight: 46, borderRadius: radius.button, backgroundColor: colors.teal,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  primaryBtnText: { ...type.bold, ...fa, fontSize: 14, lineHeight: 20, color: colors.white, textAlign: 'center' },
  secondaryBtn: {
    minHeight: 44, borderRadius: radius.button, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18,
  },
  secondaryBtnText: { ...type.bold, ...fa, fontSize: 14, lineHeight: 20, color: colors.teal, textAlign: 'center' },
  ledgerItem: { gap: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  statValue: { ...type.bold, ...fa, fontSize: 28, lineHeight: 40, color: colors.teal, textAlign: 'center' },
  error: { ...type.medium, ...fa, fontSize: 13.5, lineHeight: 22, color: colors.dot, textAlign: 'right' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.86 },
});
