import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { apiFetch } from '../../api/apiClient';

type AppNotification = {
  id: string;
  orderId: string | null;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export const NativeNotificationsScreen: React.FC = () => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch('/notifications');
    if (!res.success || !Array.isArray(res.notifications)) {
      setError(res.message || 'خواندن اعلان‌ها ممکن نشد.');
      return;
    }
    setError(null);
    setItems(res.notifications);
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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>اعلان‌های سفارش</Text>
      <Text style={styles.hint}>این فهرست داخل اپ است و پیامک یا اعلان سیستمی نیست.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.length === 0 ? <Text style={styles.empty}>اعلانی ثبت نشده است.</Text> : null}
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => void markRead(item)} style={[styles.card, !item.readAt && styles.unread]}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString('fa-IR')}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  title: { textAlign: 'right', color: '#0f172a', fontWeight: '800', fontSize: 18 },
  hint: { textAlign: 'right', color: '#64748b', fontSize: 12 },
  error: { textAlign: 'right', color: '#b91c1c', backgroundColor: '#fee2e2', padding: 10, borderRadius: 10 },
  empty: { textAlign: 'right', color: '#64748b' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  unread: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' },
  cardTitle: { textAlign: 'right', color: '#0f172a', fontWeight: '800' },
  body: { textAlign: 'right', color: '#475569', fontSize: 13, lineHeight: 20 },
  meta: { textAlign: 'right', color: '#94a3b8', fontSize: 11 },
});
