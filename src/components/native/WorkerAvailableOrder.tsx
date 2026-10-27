import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, shadowSm, type } from '../../theme/customerHome';
import { toPersianDigits } from '../../utils/jalaliDateOptions';
import { formatStoredAmount } from '../../features/orders/services/money';
import { workerPriceLine } from './workerHomeModel';
import { canAcceptWorkerOrder, workerStatusLabel } from './workerOrderStatus';
import type { NativeOrder } from './workerOrderMapper';

function availableOrderText(order: NativeOrder) {
  return {
    service: order.serviceTitle,
    district: order.district || 'محدوده نامشخص',
    time: toPersianDigits(`${order.date} | ${order.timeSlot}`),
    price: workerPriceLine(order.serviceId, order.rawPrice, (amount) => formatStoredAmount(amount, order.currencyUnit)),
  };
}

export function WorkerAvailableOrderCard({ order, onOpen }: {
  order: NativeOrder;
  onOpen: (id: string) => void;
}) {
  const text = availableOrderText(order);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text.service}، ${text.district}، ${text.time}، ${text.price}`}
      accessibilityHint="نمایش جزئیات سفارش"
      onPress={() => onOpen(order.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.summaryRow}>
        <Text style={styles.summaryTitle} numberOfLines={1}>{text.service}</Text>
        <Text style={styles.summaryDistrict} numberOfLines={1}>{text.district}</Text>
      </View>
      <Text style={styles.summaryTime} numberOfLines={1}>{text.time}</Text>
      <Text style={styles.summaryPrice} numberOfLines={1} ellipsizeMode="tail">{text.price}</Text>
    </Pressable>
  );
}

export function WorkerAvailableOrderDetails({ order, busy, loading, notice, onBack, onAccept }: {
  order: NativeOrder | undefined;
  busy: boolean;
  loading: boolean;
  notice?: ReactNode;
  onBack: () => void;
  onAccept: (order: NativeOrder) => void;
}) {
  const text = order ? availableOrderText(order) : null;
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="بازگشت به سفارش‌های جدید" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>بازگشت</Text>
        </Pressable>
        <Text style={styles.heading}>جزئیات سفارش</Text>
      </View>
      {notice}
      <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={colors.teal} /> : null}
        {order && text ? (
          <View style={styles.detailCard}>
            <Text style={styles.title}>{text.service}</Text>
            {order.badge ? <Text style={styles.meta}>{order.badge}</Text> : null}
            <Text style={styles.meta}>محله: {text.district}</Text>
            <Text style={styles.meta}>{text.time}</Text>
            <Text style={styles.price}>{text.price}</Text>
            {order.detailsNote ? <Text style={styles.meta}>{toPersianDigits(order.detailsNote)}</Text> : null}
            <Text style={styles.note}>آدرس دقیق و تماس پس از پذیرش نمایش داده می‌شود.</Text>
            {canAcceptWorkerOrder(order.status) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="پذیرش سفارش"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => onAccept(order)}
                style={[styles.acceptButton, busy && styles.disabled]}
              >
                <Text style={styles.acceptText}>{busy ? 'در حال پذیرش...' : 'پذیرش سفارش'}</Text>
              </Pressable>
            ) : <Text style={styles.meta}>{workerStatusLabel(order.status)}</Text>}
          </View>
        ) : <Text style={styles.meta}>این سفارش دیگر در فهرست سفارش‌های جدید نیست. به فهرست برگردید.</Text>}
      </ScrollView>
    </View>
  );
}

const fa = { writingDirection: 'rtl' as const, includeFontPadding: false, textAlign: 'right' as const };
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, gap: 4, ...shadowSm },
  pressed: { backgroundColor: colors.tealSoft },
  summaryRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  summaryTitle: { ...type.bold, ...fa, flex: 3, fontSize: 14, lineHeight: 20, color: colors.text },
  summaryDistrict: { ...type.regular, ...fa, flex: 2, fontSize: 12, lineHeight: 20, color: colors.muted },
  summaryTime: { ...type.regular, ...fa, fontSize: 12, lineHeight: 18, color: colors.muted },
  summaryPrice: { ...type.medium, ...fa, fontSize: 12, lineHeight: 18, color: colors.teal },
  header: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 16 },
  back: { minHeight: 44, minWidth: 48, justifyContent: 'center' },
  backText: { ...type.semibold, ...fa, fontSize: 14, color: colors.teal },
  heading: { ...type.bold, ...fa, flex: 1, fontSize: 17, lineHeight: 26, color: colors.text },
  detailContent: { padding: 16, paddingBottom: 32, gap: 12 },
  detailCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14, ...shadowSm },
  title: { ...type.bold, ...fa, fontSize: 17, lineHeight: 26, color: colors.text },
  meta: { ...type.regular, ...fa, fontSize: 14, lineHeight: 24, color: colors.text },
  price: { ...type.bold, ...fa, fontSize: 14, lineHeight: 24, color: colors.teal },
  note: { ...type.regular, ...fa, fontSize: 12, lineHeight: 22, color: colors.muted },
  acceptButton: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  acceptText: { ...type.bold, ...fa, fontSize: 14, color: colors.white },
  disabled: { opacity: 0.6 },
});
