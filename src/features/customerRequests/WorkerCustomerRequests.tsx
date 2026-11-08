import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { colors } from '../../theme/customerHome';
import { WORKER_TOKEN_KEY } from '../../components/native/workerLoginStorage';
import { appStorage } from '../../utils/storage';
import { toPersianDigits, buildJalaliDateOptions } from '../../utils/jalaliDateOptions';

export type WorkerCustomerRequest = {
  id: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  total: number | null;
  genderPreference: string;
  createdAt: string;
};

const GENDER_LABEL: Record<string, string> = { FEMALE: 'ترجیح: زن', MALE: 'ترجیح: مرد', NO_PREFERENCE: 'بدون ترجیح' };
const LOAD_FAILED = 'فهرست درخواست‌ها دریافت نشد. اتصال را بررسی کنید.';
const ACCEPT_FAILED = 'پذیرش انجام نشد. دوباره تلاش کنید.';

function titleOf(serviceId: string): string {
  return SERVICES_CATALOG.find((service) => service.id === serviceId)?.title || serviceId;
}

function windowLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const hours = Math.max(1, Math.round((end.getTime() - start.getTime()) / 3600000));
  const day = buildJalaliDateOptions(start, 1)[0];
  const dayText = day ? `${day.dayOfWeek} ${toPersianDigits(day.dayOfMonth)} ${day.monthName}` : '';
  const hourText = toPersianDigits(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
  return `${dayText} · ${hourText} · ${toPersianDigits(hours)} ساعت`;
}

function errorText(result: unknown, fallback: string): string {
  if (result && typeof result === 'object') {
    const message = (result as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/** درخواست‌های باز مشتری‌ها برای متخصص آماده؛ آدرس تا پیش از پذیرش نشان داده نمی‌شود. */
export function WorkerCustomerRequests() {
  const [requests, setRequests] = useState<WorkerCustomerRequest[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      const result: unknown = await apiFetch('/workers/me/customer-requests');
      const list = result && typeof result === 'object' ? (result as { requests?: WorkerCustomerRequest[] }).requests : undefined;
      if (!mounted.current) return;
      if (Array.isArray(list)) { setRequests(list); setMessage(null); } else { setMessage(errorText(result, LOAD_FAILED)); }
    } catch {
      if (mounted.current) setMessage(LOAD_FAILED);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const accept = async (id: string) => {
    setBusyId(id); setMessage(null);
    try {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      const result: unknown = await apiFetch(`/workers/me/customer-requests/${encodeURIComponent(id)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const ok = result && typeof result === 'object' && (result as { success?: unknown }).success === true;
      setMessage(ok ? 'درخواست پذیرفته شد و سفارش ساخته شد.' : errorText(result, ACCEPT_FAILED));
    } catch {
      setMessage(ACCEPT_FAILED);
    } finally {
      if (mounted.current) setBusyId(null);
      await load();
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>درخواست‌های باز مشتری‌ها</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {requests.length === 0 ? <Text style={styles.note}>فعلاً درخواست بازی برای شما نیست.</Text> : null}
      {requests.map((request) => (
        <View key={request.id} style={styles.card}>
          <Text style={styles.cardTitle}>{titleOf(request.serviceId)}</Text>
          <Text style={styles.note}>{windowLabel(request.startAt, request.endAt)}</Text>
          <Text style={styles.note}>{GENDER_LABEL[request.genderPreference] ?? 'بدون ترجیح'}{request.total != null ? ` · ${toPersianDigits(request.total)} تومان` : ''}</Text>
          <Pressable accessibilityRole="button" disabled={busyId === request.id} onPress={() => void accept(request.id)} style={[styles.accept, busyId === request.id && styles.disabled]}>
            <Text style={styles.acceptText}>{busyId === request.id ? 'در حال پذیرش…' : 'پذیرش درخواست'}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginBottom: 12 },
  title: { fontWeight: '700', color: colors.text, textAlign: 'right', fontSize: 16 },
  note: { color: colors.muted, textAlign: 'right', lineHeight: 22 },
  message: { color: colors.teal, textAlign: 'right' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, gap: 6, backgroundColor: colors.white },
  cardTitle: { fontWeight: '700', color: colors.text, textAlign: 'right' },
  accept: { backgroundColor: colors.teal, borderRadius: 14, padding: 12, alignItems: 'center', marginTop: 4 },
  acceptText: { color: colors.white, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
