import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../../theme/customerHome';
import { buildJalaliDateOptions, toPersianDigits } from '../../utils/jalaliDateOptions';
import { formatJalaliDateTime } from '../../utils/jalaliDisplay';
import { workerServiceRows } from './workerHomeCards';
import { loadWorkerSkills } from './workerSkills';
import {
  OFFER_DURATIONS, OFFER_START_HOURS, cancelWorkerOffer, clampBasisPoints, createWorkerOffer, loadWorkerOffers,
  offerRangeFromSelection, priceDeltaLabel, stepBasisPoints, type OffersData, type WorkerOffer,
} from './workerOffers';
import { previewActive } from './previewRuntime';

const STATUS_LABEL: Record<WorkerOffer['status'], string> = { OPEN: 'باز', BOOKED: 'رزرو شد', CANCELLED: 'لغو شد' };
const hourLabel = (hour: number) => toPersianDigits(`${String(hour).padStart(2, '0')}:00`);

export function WorkerOffersScreen({ onBack }: { onBack: () => void }) {
  const dates = useMemo(() => buildJalaliDateOptions(new Date(), 21), []);
  const [data, setData] = useState<OffersData | null>(null);
  const [services, setServices] = useState<{ id: string; title: string }[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [dateString, setDateString] = useState(dates[1]?.dateString || '');
  const [startHour, setStartHour] = useState<number>(18);
  const [duration, setDuration] = useState<number>(3);
  const [basisPoints, setBasisPoints] = useState(8000);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const preview = previewActive();

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPhase('loading'); setMessage(null);
    const [offers, skills] = await Promise.all([loadWorkerOffers(controller.signal), loadWorkerSkills(controller.signal)]);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    if (!offers.ok) { setPhase('error'); setMessage(offers.message); return; }
    setData(offers.data);
    setBasisPoints(current => clampBasisPoints(current, offers.data.minBasisPoints, offers.data.maxBasisPoints));
    const rows = workerServiceRows(skills.ok ? skills.skills : []).filter(row => row.known && (!skills.ok || row.active));
    const list = (rows.length ? rows : workerServiceRows([]).filter(row => row.known)).map(row => ({ id: row.id, title: row.title }));
    setServices(list);
    setServiceId(current => (list.some(row => row.id === current) ? current : list[0]?.id || ''));
    setPhase('ready');
  }, []);
  useEffect(() => { void load(); return () => { request.current?.abort(); request.current = null; }; }, [load]);

  const range = offerRangeFromSelection(dateString, startHour, duration);
  const canSave = phase === 'ready' && !preview && !!serviceId && !!range && !!data;
  const save = async () => {
    if (!canSave || !range || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setPhase('saving'); setMessage(null);
    const result = await createWorkerOffer({ serviceId, ...range, adjustmentBasisPoints: basisPoints }, controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    if (!result.ok) { setPhase('ready'); setMessage(result.message); return; }
    await load();
    setMessage('پیشنهاد ثبت شد و مشتریان آن را می‌بینند.');
  };
  const cancel = async (id: string) => {
    if (phase !== 'ready' || preview || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setPhase('saving'); setMessage(null);
    const result = await cancelWorkerOffer(id, controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    if (!result.ok) { setPhase('ready'); setMessage(result.message); return; }
    await load();
    setMessage('پیشنهاد لغو شد.');
  };

  const editable = phase === 'ready' && !preview;
  const min = data?.minBasisPoints ?? 5000;
  const max = data?.maxBasisPoints ?? 10000;
  const titleOf = (id: string) => services.find(row => row.id === id)?.title || id;
  return <ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.link}>بازگشت به حساب متخصص</Text></Pressable>
    <Text style={styles.title}>ساعت‌های پیشنهادی من</Text>
    <Text style={styles.note}>بازهٔ آزاد خود را با قیمت پایین‌تر از تعرفه ثبت کنید تا مشتری ببیند و رزرو کند. {max > 10000 ? 'درجهٔ شما اجازهٔ قیمت بالاتر از تعرفه را هم می‌دهد.' : 'قیمت نمی‌تواند از تعرفهٔ شرکت بالاتر باشد.'}</Text>
    {preview && <Text style={styles.note}>این بخش در پیش‌نمایش فقط نمایشی است؛ ثبت غیرفعال است.</Text>}
    {phase === 'loading' && <ActivityIndicator color={colors.teal} />}
    {!!data && <>
      <Text style={styles.label}>خدمت</Text>
      <View style={styles.wrap}>{services.map(row => <Pressable key={row.id} accessibilityRole="button" disabled={!editable}
        accessibilityState={{ selected: row.id === serviceId, disabled: !editable }} onPress={() => setServiceId(row.id)}
        style={[styles.chip, row.id === serviceId && styles.selected]}><Text style={styles.text}>{row.title}</Text></Pressable>)}</View>
      <Text style={styles.label}>روز</Text>
      <ScrollView horizontal contentContainerStyle={styles.row}>{dates.slice(1).map(day => <Pressable key={day.dateString} accessibilityRole="button" disabled={!editable}
        accessibilityState={{ selected: day.dateString === dateString, disabled: !editable }} onPress={() => setDateString(day.dateString)}
        style={[styles.chip, day.dateString === dateString && styles.selected]}>
        <Text style={styles.text}>{day.dayOfWeek} {toPersianDigits(day.dayOfMonth)}</Text></Pressable>)}</ScrollView>
      <Text style={styles.label}>ساعت شروع</Text>
      <View style={styles.wrap}>{OFFER_START_HOURS.map(hour => <Pressable key={hour} accessibilityRole="button" disabled={!editable}
        accessibilityState={{ selected: hour === startHour, disabled: !editable }} onPress={() => setStartHour(hour)}
        style={[styles.chip, hour === startHour && styles.selected]}><Text style={styles.text}>{hourLabel(hour)}</Text></Pressable>)}</View>
      <Text style={styles.label}>مدت بازه (ساعت)</Text>
      <View style={styles.wrap}>{OFFER_DURATIONS.map(hours => <Pressable key={hours} accessibilityRole="button" disabled={!editable}
        accessibilityState={{ selected: hours === duration, disabled: !editable }} onPress={() => setDuration(hours)}
        style={[styles.chip, hours === duration && styles.selected]}><Text style={styles.text}>{toPersianDigits(hours)}</Text></Pressable>)}</View>
      <Text style={styles.label}>قیمت نسبت به تعرفه</Text>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel="افزایش درصد" disabled={!editable || basisPoints >= max}
          onPress={() => setBasisPoints(stepBasisPoints(basisPoints, 1, min, max))} style={[styles.stepButton, (!editable || basisPoints >= max) && styles.disabled]}><Text style={styles.stepText}>+</Text></Pressable>
        <View style={styles.stepValue}>
          <Text style={styles.percent}>{toPersianDigits(Math.round(basisPoints / 100))}٪ تعرفه</Text>
          <Text style={styles.note}>{priceDeltaLabel(basisPoints)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="کاهش درصد" disabled={!editable || basisPoints <= min}
          onPress={() => setBasisPoints(stepBasisPoints(basisPoints, -1, min, max))} style={[styles.stepButton, (!editable || basisPoints <= min) && styles.disabled]}><Text style={styles.stepText}>−</Text></Pressable>
      </View>
      <Pressable accessibilityRole="button" disabled={!canSave} onPress={() => void save()} style={[styles.button, !canSave && styles.disabled]}>
        {phase === 'saving' ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>ثبت پیشنهاد</Text>}
      </Pressable>
      <Text style={styles.label}>پیشنهادهای ثبت‌شده</Text>
      {!data.offers.length && <Text style={styles.note}>هنوز پیشنهادی ثبت نکرده‌اید.</Text>}
      {data.offers.map(offer => <View key={offer.id} style={styles.card}>
        <Text style={styles.heading}>{titleOf(offer.serviceId)}</Text>
        <Text style={styles.note}>{formatJalaliDateTime(offer.startAt, { withTime: true })} تا {toPersianDigits(formatJalaliDateTime(offer.endAt, { withTime: true }).split('،').pop()?.trim() || '')}</Text>
        <Text style={styles.note}>{toPersianDigits(Math.round(offer.adjustmentBasisPoints / 100))}٪ تعرفه · {STATUS_LABEL[offer.status]}</Text>
        {offer.status === 'OPEN' && <Pressable accessibilityRole="button" disabled={!editable} onPress={() => void cancel(offer.id)}><Text style={styles.link}>لغو پیشنهاد</Text></Pressable>}
      </View>)}
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.note}>{message}</Text>}
    {phase === 'error' && <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.link}>تلاش دوباره</Text></Pressable>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 }, title: { ...type.bold, fontSize: 22, textAlign: 'right', color: colors.text },
  label: { ...type.semibold, textAlign: 'right', color: colors.text }, note: { ...type.regular, textAlign: 'right', color: colors.muted, lineHeight: 24 },
  heading: { ...type.semibold, textAlign: 'right', color: colors.text },
  link: { ...type.medium, textAlign: 'right', color: colors.teal }, row: { flexDirection: 'row-reverse', gap: 8, flexGrow: 1 },
  wrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }, chip: { padding: 12, borderWidth: 1, borderColor: colors.mutedLight, borderRadius: 12 },
  selected: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, text: { ...type.medium, color: colors.text },
  stepper: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepButton: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal },
  stepText: { ...type.bold, fontSize: 24, color: colors.white }, stepValue: { flex: 1, alignItems: 'center' }, percent: { ...type.bold, fontSize: 20, color: colors.text },
  card: { padding: 14, gap: 6, borderWidth: 1, borderColor: colors.mutedLight, borderRadius: 12 },
  button: { backgroundColor: colors.teal, padding: 14, alignItems: 'center', borderRadius: 12 }, buttonText: { ...type.semibold, color: colors.white }, disabled: { opacity: 0.5 },
});
