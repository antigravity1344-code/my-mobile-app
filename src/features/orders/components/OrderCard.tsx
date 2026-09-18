import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  ChevronLeft,
  Star,
  Repeat,
} from 'lucide-react-native';
import type { OrderItem } from '../types/order';
import { isOrderCancellable } from '../services/orderService';
import { OrderStatusBadge } from './OrderStatusBadge';

interface OrderCardProps {
  order: OrderItem;
  onPressDetails: (order: OrderItem) => void;
  onPressRate?: (order: OrderItem) => void;
  onPressCancel?: (order: OrderItem) => void;
}

const RECURRING_LABELS: Record<string, string> = {
  WEEKLY: 'هفتگی',
  BIWEEKLY: 'دو هفته یک‌بار',
  MONTHLY: 'ماهانه',
};

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onPressDetails,
  onPressRate,
  onPressCancel,
}) => {
  const isCancellable = isOrderCancellable(order.status);
  const isCompleted = order.status === 'COMPLETED';
  const hasRated = Boolean(order.ratings?.customerRating);
  const isRecurring = order.recurringFrequency !== 'ONE_TIME';

  return (
    <Pressable
      onPress={() => onPressDetails(order)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Top Bar: Order Number + Status Badge */}
      <View style={styles.headerRow}>
        <OrderStatusBadge status={order.status} size="sm" />
        <View style={styles.orderNumberWrap}>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
          {isRecurring && (
            <View style={styles.recurringTag}>
              <Repeat size={10} color="#0284c7" />
              <Text style={styles.recurringText}>
                {RECURRING_LABELS[order.recurringFrequency] || 'دوره‌ای'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Service Title */}
      <View style={styles.serviceRow}>
        <Text style={styles.serviceTitle}>{order.serviceTitle}</Text>
        {Boolean(order.serviceSubtitle) && (
          <Text style={styles.serviceSubtitle}>{order.serviceSubtitle}</Text>
        )}
      </View>

      {/* Meta Specs: Date, Time Slot, Location */}
      <View style={styles.specsContainer}>
        <View style={styles.specItem}>
          <Calendar size={13} color="#64748b" />
          <Text style={styles.specText}>
            {order.date.dayOfWeek} {order.date.dayOfMonth} {order.date.monthName?.split(' ')[0] || ''}
          </Text>
        </View>

        <View style={styles.specItem}>
          <Clock size={13} color="#64748b" />
          <Text style={styles.specText}>
            {order.timeSlot.startTime} تا {order.timeSlot.endTime} ({order.durationHours} ساعت)
          </Text>
        </View>

        <View style={styles.specItem}>
          <MapPin size={13} color="#64748b" />
          <Text style={styles.specText} numberOfLines={1}>
            {order.address.district}
          </Text>
        </View>
      </View>

      {/* Cleaner Info Strip if available */}
      {Boolean(order.cleaner) && (
        <View style={styles.cleanerStrip}>
          <View style={styles.cleanerDetails}>
            <View style={styles.cleanerAvatar}>
              <User size={13} color="#0284c7" />
            </View>
            <Text style={styles.cleanerName}>{order.cleaner?.name}</Text>
            <View style={styles.ratingBadge}>
              <Star size={11} color="#f59e0b" fill="#f59e0b" />
              <Text style={styles.ratingText}>{order.cleaner?.rating}</Text>
            </View>
          </View>
          <Text style={styles.cleanerRole}>متخصص اعزامی</Text>
        </View>
      )}

      {/* Price & Actions Row */}
      <View style={styles.footerRow}>
        <View style={styles.priceWrap}>
          <Text style={styles.priceLabel}>مبلغ نهایی</Text>
          <Text style={styles.priceValue}>
            {order.pricing.total.toLocaleString('fa-IR')} تومان
          </Text>
        </View>

        <View style={styles.actionsWrap}>
          {isCompleted && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onPressRate?.(order);
              }}
              style={[styles.actionBtn, styles.rateBtn]}
            >
              <Star
                size={13}
                color={hasRated ? '#f59e0b' : '#d97706'}
                fill={hasRated ? '#f59e0b' : 'transparent'}
              />
              <Text style={styles.rateBtnText}>
                {hasRated ? `امتیاز: ${order.ratings?.customerRating}` : 'ثبت امتیاز'}
              </Text>
            </Pressable>
          )}

          {isCancellable && Boolean(onPressCancel) && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onPressCancel?.(order);
              }}
              style={[styles.actionBtn, styles.cancelBtn]}
            >
              <Text style={styles.cancelBtnText}>لغو</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => onPressDetails(order)}
            style={[styles.actionBtn, styles.detailsBtn]}
          >
            <Text style={styles.detailsBtnText}>جزئیات و پیگیری</Text>
            <ChevronLeft size={14} color="#0284c7" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderNumberWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  recurringTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  recurringText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369a1',
  },
  serviceRow: {
    marginBottom: 12,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },
  serviceSubtitle: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 2,
  },
  specsContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  specItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  specText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  cleanerStrip: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  cleanerDetails: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  cleanerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanerName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  ratingBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b45309',
  },
  cleanerRole: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  priceWrap: {
    alignItems: 'flex-start',
  },
  priceLabel: {
    fontSize: 10,
    color: '#64748b',
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
  },
  actionsWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  detailsBtn: {
    backgroundColor: '#e0f2fe',
  },
  detailsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  rateBtn: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  rateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
  },
  cancelBtn: {
    backgroundColor: '#fee2e2',
  },
  cancelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
});
