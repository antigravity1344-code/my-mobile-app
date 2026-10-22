import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiFetch } from '../../api/apiClient';
import { type } from '../../theme';
import { formatJalaliDateTime } from '../../utils/jalaliDisplay';
import { CUSTOMER_ORDER_STATUS_LABELS } from '../orders/orderStatusLabels';
import { notificationOrderTarget } from './notificationsUnread';

type AppNotification = {
  id: string;
  orderId: string | null;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

const STATUS_TEXT: Record<string, string> = CUSTOMER_ORDER_STATUS_LABELS;

/**
 * فقط برای نمایش: کد فنی سفارش (ORD-…) را حذف و وضعیت انگلیسی را به فارسی تبدیل می‌کند.
 * داده، API و ذخیره‌سازی تغییری نمی‌کنند.
 */
function formatNotificationText(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\bORD-[A-Za-z0-9-]+/g, '')
    .replace(/\b(IN_PROGRESS|PENDING|ACCEPTED|CONFIRMED|ASSIGNED|COMPLETED|CANCELLED|CANCEL_REQUESTED)\b/g, (status) => `«${STATUS_TEXT[status]}»`)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.،,!؟])/g, '$1')
    .trim();
}

type NativeNotificationsScreenProps = {
  /** اگر داده شود، لمس اعلانِ مربوط به یک سفارش همان سفارش را باز می‌کند (اپ مشتری). */
  onOpenOrder?: (orderId: string) => void;
  appearance?: 'customer' | 'worker';
};

export const NativeNotificationsScreen: React.FC<NativeNotificationsScreenProps> = ({ onOpenOrder, appearance = 'customer' }) => {
  const workerAppearance = appearance === 'worker';
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/notifications');
    if (!res.success || !Array.isArray(res.notifications)) {
      setError(res.message || 'خواندن اعلان‌ها ممکن نشد.');
      setLoading(false);
      return;
    }
    setError(null);
    setItems(res.notifications);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (item: AppNotification) => {
    if (item.readAt) return;
    const res = await apiFetch('/notifications/' + encodeURIComponent(item.id) + '/read', { method: 'POST' });
    if (!res.success) return;
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)));
  };

  const openNotification = async (item: AppNotification) => {
    await markRead(item);
    const orderId = notificationOrderTarget(item);
    if (orderId && onOpenOrder) onOpenOrder(orderId);
  };

  return (
    <ScrollView style={workerAppearance && workerStyles.root} contentContainerStyle={[styles.content, workerAppearance && workerStyles.content]}>
      <Text style={[styles.title, workerAppearance && workerStyles.title]}>اعلان‌های سفارش</Text>
      <Text style={[styles.hint, workerAppearance && workerStyles.hint]}>اعلان‌های مربوط به سفارش‌های شما اینجا نمایش داده می‌شود.</Text>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#0f766e" />
          <Text style={[styles.hint, workerAppearance && workerStyles.hint]}>در حال خواندن اعلان‌ها...</Text>
        </View>
      ) : null}
      {error && !loading ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>تلاش دوباره</Text>
          </Pressable>
        </View>
      ) : null}
      {!loading && !error && items.length === 0 ? <Text style={[styles.empty, workerAppearance && workerStyles.empty]}>اعلانی ثبت نشده است.</Text> : null}
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => void openNotification(item)} style={[styles.card, workerAppearance && workerStyles.card, !item.readAt && styles.unread]}>
          <Text style={styles.cardTitle}>{formatNotificationText(item.title)}</Text>
          <Text style={styles.body}>{formatNotificationText(item.body)}</Text>
          <Text style={styles.meta}>{formatJalaliDateTime(item.createdAt, { withTime: true })}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const workerStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, gap: 12 },
  title: { color: '#ffffff' },
  hint: { color: '#cbd5e1' },
  empty: { backgroundColor: '#ffffff', borderRadius: 24, padding: 20, color: '#64748b' },
  card: { borderRadius: 24, padding: 20, minHeight: 44 },
});

const fa = {
  writingDirection: 'rtl' as const,
  includeFontPadding: false,
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  title: { ...type.bold, ...fa, fontWeight: '400', textAlign: 'right', color: '#0f172a', fontSize: 18 },
  hint: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#64748b', fontSize: 12 },
  loading: { alignItems: 'flex-end', gap: 8 },
  errorBox: { backgroundColor: '#fee2e2', padding: 10, borderRadius: 10, gap: 8 },
  error: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#b91c1c' },
  retry: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  retryText: { ...type.bold, ...fa, fontWeight: '400', textAlign: 'right', color: '#0f766e' },
  empty: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#64748b' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  unread: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' },
  cardTitle: { ...type.bold, ...fa, fontWeight: '400', textAlign: 'right', color: '#0f172a' },
  body: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#475569', fontSize: 13, lineHeight: 20 },
  meta: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#94a3b8', fontSize: 11 },
});
