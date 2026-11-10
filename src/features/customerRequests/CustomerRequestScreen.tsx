import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { isServiceEnabled } from '../../config/serviceAvailability';
import { colors } from '../../theme/customerHome';
import { buildJalaliDateOptions, toPersianDigits } from '../../utils/jalaliDateOptions';
import { cancelCustomerRequest, createCustomerRequest, listCustomerRequests, loadCustomerRequestBounds, type CustomerRequestView } from './customerRequestApi';
import {
  buildCustomerRequestPayload,
  CUSTOMER_REQUEST_HOURS,
  CUSTOMER_REQUEST_PERCENTS,
  type CustomerRequestGender,
} from './customerRequestPayload';

const GENDERS: Array<{ value: CustomerRequestGender; label: string }> = [
  { value: 'NO_PREFERENCE', label: 'فرقی ندارد' },
  { value: 'FEMALE', label: 'زن' },
  { value: 'MALE', label: 'مرد' },
];
const HOURS_OF_DAY = Array.from({ length: 24 }, (_, hour) => hour);
const STATUS_LABEL: Record<CustomerRequestView['status'], string> = {
  OPEN: 'در انتظار پذیرش متخصص',
  ACCEPTED: 'پذیرفته شد',
  CANCELLED: 'لغو شد',
};

export function CustomerRequestScreen({ onBack }: { onBack: () => void }) {
  const days = useMemo(() => buildJalaliDateOptions(new Date(), 7), []);
  const services = useMemo(
    () => SERVICES_CATALOG.filter((service) => service.isVisible && isServiceEnabled(service.id)),
    [],
  );
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? '');
  const serviceTitle = services.find((service) => service.id === serviceId)?.title ?? '';
  const [dayIndex, setDayIndex] = useState<number | null>(1);
  const [hour, setHour] = useState<number | null>(null);
  const [hours, setHours] = useState<number>(1);
  const [bounds, setBounds] = useState<{ minPercent: number; maxPercent: number }>({ minPercent: 70, maxPercent: 130 });
  const percentChoices = CUSTOMER_REQUEST_PERCENTS.filter((value) => value >= bounds.minPercent && value <= bounds.maxPercent);
  const [percent, setPercent] = useState<number>(100);
  const [gender, setGender] = useState<CustomerRequestGender>('NO_PREFERENCE');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<CustomerRequestView[]>([]);

  const refresh = async () => {
    const result = await listCustomerRequests();
    if (result.ok) setRequests(result.value);
  };
  useEffect(() => {
    void refresh();
    void loadCustomerRequestBounds().then((result) => {
      if (result) setBounds(result);
    });
  }, []);
  useEffect(() => {
    // اگر درصد انتخابی بیرون از بازهٔ جدید است، نزدیک‌ترین مقدار مجاز انتخاب می‌شود.
    if (percentChoices.length && !percentChoices.includes(percent as typeof percentChoices[number])) {
      setPercent(percentChoices[0]!);
    }
  }, [bounds.minPercent, bounds.maxPercent]);

  const submit = async () => {
    const day = dayIndex == null ? null : days[dayIndex];
    const built = buildCustomerRequestPayload({
      serviceId,
      dateString: day ? day.dateString : null,
      hour,
      hours,
      percent,
      address,
      gender,
    });
    if (!built.ok) { setMessage(built.message); return; }
    setBusy(true); setMessage(null);
    const result = await createCustomerRequest(built.payload);
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    setMessage('درخواست ثبت شد. پس از پذیرش متخصص، سفارش ساخته می‌شود.');
    setAddress('');
    await refresh();
  };

  const cancel = async (id: string) => {
    const result = await cancelCustomerRequest(id);
    setMessage(result.ok ? 'درخواست لغو شد.' : result.message);
    await refresh();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.link}>بازگشت</Text></Pressable>
      <Text style={styles.title}>درخواست ساعت دلخواه</Text>
      <Text style={styles.body}>{serviceTitle}. زمان و درصد قیمت را انتخاب کنید؛ قیمت فقط در بازه‌ی مجاز پذیرفته می‌شود.</Text>

      <Text style={styles.label}>خدمت</Text>
      <View style={styles.serviceGrid}>
        {services.map((service) => (
          <Chip key={service.id} equal selected={serviceId === service.id} label={service.title} onPress={() => setServiceId(service.id)} />
        ))}
      </View>

      <Text style={styles.label}>روز</Text>
      <View style={styles.chips}>
        {days.map((day, index) => (
          <Chip key={day.dateString} selected={dayIndex === index} label={`${day.dayOfWeek} ${toPersianDigits(day.dayOfMonth)} ${day.monthName}`} onPress={() => setDayIndex(index)} />
        ))}
      </View>

      <Text style={styles.label}>ساعت شروع</Text>
      <View style={styles.chips}>
        {HOURS_OF_DAY.map((value) => (
          <Chip key={value} selected={hour === value} label={toPersianDigits(`${String(value).padStart(2, '0')}:00`)} onPress={() => setHour(value)} />
        ))}
      </View>

      <Text style={styles.label}>مدت کار (ساعت)</Text>
      <View style={styles.chips}>
        {CUSTOMER_REQUEST_HOURS.map((value) => (
          <Chip key={value} selected={hours === value} label={toPersianDigits(value)} onPress={() => setHours(value)} />
        ))}
      </View>

      <Text style={styles.label}>درصد قیمت نسبت به تعرفه</Text>
      <View style={styles.chips}>
        {percentChoices.map((value) => (
          <Chip key={value} selected={percent === value} label={`${toPersianDigits(value)}٪`} onPress={() => setPercent(value)} />
        ))}
      </View>

      <Text style={styles.label}>ترجیح جنسیت متخصص</Text>
      <View style={styles.chips}>
        {GENDERS.map((item) => (
          <Chip key={item.value} selected={gender === item.value} label={item.label} onPress={() => setGender(item.value)} />
        ))}
      </View>

      <Text style={styles.label}>آدرس خدمت</Text>
      <TextInput value={address} onChangeText={setAddress} placeholder="شهر، محله، خیابان و پلاک" style={styles.input} multiline />

      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[styles.submit, busy && styles.disabled]}>
        <Text style={styles.submitText}>{busy ? 'در حال ثبت…' : 'ثبت درخواست'}</Text>
      </Pressable>

      <Text style={styles.label}>درخواست‌های من</Text>
      {requests.length === 0 ? <Text style={styles.body}>هنوز درخواستی ثبت نکرده‌اید.</Text> : null}
      {requests.map((request) => (
        <View key={request.id} style={styles.card}>
          <Text style={styles.body}>{STATUS_LABEL[request.status]} · {toPersianDigits(Math.round(request.adjustmentBasisPoints / 100))}٪</Text>
          {request.status === 'OPEN' ? (
            <Pressable accessibilityRole="button" onPress={() => void cancel(request.id)}><Text style={styles.link}>لغو درخواست</Text></Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function Chip({ selected, label, onPress, equal = false }: { selected: boolean; label: string; onPress: () => void; equal?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, equal && styles.chipEqual, selected && styles.chipSelected]}>
      <Text numberOfLines={equal ? 2 : undefined} style={[styles.chipText, equal && styles.chipTextEqual, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, backgroundColor: colors.bg },
  link: { color: colors.teal, fontWeight: '600', textAlign: 'right' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'right' },
  body: { color: colors.muted, textAlign: 'right', lineHeight: 22 },
  label: { fontWeight: '700', color: colors.text, textAlign: 'right', marginTop: 8 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  serviceGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.white },
  chipEqual: { width: '48.5%', minHeight: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  chipSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.text },
  chipTextEqual: { textAlign: 'center', lineHeight: 22 },
  chipTextSelected: { color: colors.white, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, minHeight: 64, textAlign: 'right', backgroundColor: colors.white },
  message: { color: colors.teal, textAlign: 'right' },
  submit: { backgroundColor: colors.teal, borderRadius: 16, padding: 14, alignItems: 'center', marginTop: 8 },
  submitText: { color: colors.white, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, gap: 6, backgroundColor: colors.white },
});
