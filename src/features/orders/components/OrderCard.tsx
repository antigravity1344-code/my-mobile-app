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
import { formatOrderAmount, isOrderCancellable } from '../services/orderService';
import { OrderStatusBadge } from './OrderStatusBadge';
import { toPersianDigits } from '../../../utils/jalaliDateOptions';
import { orderAmountLabel } from '../orderStatusLabels';
import { displayServiceTitle } from '../serviceTitleDisplay';
import { colors, fontFamily, ui, TOUCH_MIN } from '../../../theme';

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
      {/* Top Bar: Status Badge + Recurring Tag */}
      <View style={styles.headerRow}>
        <OrderStatusBadge status={order.status} size="sm" />
        <View style={styles.orderNumberWrap}>
          {isRecurring && (
            <View style={styles.recurringTag}>
              <Repeat size={10} color={colors.teal} />
              <Text style={styles.recurringText}>
                {RECURRING_LABELS[order.recurringFrequency] || 'دوره‌ای'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Service Title */}
      <View style={styles.serviceRow}>
        <Text style={styles.serviceTitle}>{displayServiceTitle(order.serviceTitle)}</Text>
        {Boolean(order.serviceSubtitle) && (
          <Text style={styles.serviceSubtitle}>{order.serviceSubtitle}</Text>
        )}
      </View>

      {/* Meta Specs: Date, Time Slot, Location */}
      <View style={styles.specsContainer}>
        <View style={styles.specItem}>
          <Calendar size={13} color={colors.muted} />
          <Text style={styles.specText}>
            {[
              order.date?.dayOfWeek,
              order.date?.dayOfMonth,
              order.date?.monthName?.split(' ')[0] || '',
            ]
              .filter((part) => part !== undefined && part !== null && part !== 0 && String(part).trim() !== '' && String(part).trim() !== '—')
              .join(' ') || '—'}
          </Text>
        </View>

        <View style={styles.specItem}>
          <Clock size={13} color={colors.muted} />
          <Text style={styles.specText}>
            {order.timeSlot?.label ||
              [order.timeSlot?.startTime, order.timeSlot?.endTime].filter(Boolean).join(' تا ') ||
              '—'}
            {order.durationHours ? ` (${toPersianDigits(order.durationHours)} ساعت)` : ''}
          </Text>
        </View>

        <View style={styles.specItem}>
          <MapPin size={13} color={colors.muted} />
          <Text style={styles.specText} numberOfLines={1}>
            {order.address?.district || order.address?.fullAddress || '—'}
          </Text>
        </View>
      </View>

      {/* Cleaner Info Strip if available */}
      {Boolean(order.cleaner) && (
        <View style={styles.cleanerStrip}>
          <View style={styles.cleanerDetails}>
            <View style={styles.cleanerAvatar}>
              <User size={13} color={colors.teal} />
            </View>
            <Text style={styles.cleanerName}>
              {order.cleaner?.name || 'اطلاعات متخصص ثبت نشده'}
            </Text>
            {typeof order.cleaner?.rating === 'number' ? (
              <View style={styles.ratingBadge}>
                <Star size={11} color="#f59e0b" fill="#f59e0b" />
                <Text style={styles.ratingText}>
                  {order.cleaner.rating.toLocaleString('fa-IR')}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cleanerRole}>متخصص اعزامی</Text>
        </View>
      )}

      {/* Price & Actions Row */}
      <View style={styles.footerRow}>
        <View style={styles.priceWrap}>
          <Text style={styles.priceLabel}>{orderAmountLabel(order.status, order.paymentStatus)}</Text>
          <Text style={styles.priceValue}>
            {formatOrderAmount(order.pricing?.total)} تومان
          </Text>
        </View>

        <View style={styles.actionsWrap}>
          {isCompleted && (
            <Pressable
              disabled={hasRated}
              onPress={(e) => {
                e.stopPropagation();
                if (hasRated) return;
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
                {hasRated ? `امتیاز: ${toPersianDigits(order.ratings?.customerRating ?? '')}` : 'ثبت امتیاز'}
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
            <ChevronLeft size={14} color={colors.teal} />
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
    borderColor: ui.divider,
    shadowColor: '#000000',
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
    justifyContent: 'center',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  orderNumberWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  recurringTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.tealSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  recurringText: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: colors.tealDark,
  },
  serviceRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'center',
  },
  serviceSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 2,
  },
  specsContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: ui.surfaceMuted,
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
    fontSize: 12,
    fontFamily: fontFamily.semibold,
    color: colors.muted,
    textAlign: 'center',
  },
  cleanerStrip: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 10,
    alignItems: 'center',
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: ui.tealBorder,
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
    backgroundColor: ui.tealBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanerName: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: colors.tealDark,
    textAlign: 'center',
  },
  ratingBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.amberBg,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: colors.amberText,
  },
  cleanerRole: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: ui.divider,
    paddingTop: 12,
  },
  priceWrap: {
    alignItems: 'center',
  },
  priceLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  priceValue: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
    color: colors.teal,
    textAlign: 'center',
  },
  actionsWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    minHeight: TOUCH_MIN,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  detailsBtn: {
    backgroundColor: colors.tealSoft,
  },
  detailsBtnText: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: colors.teal,
  },
  rateBtn: {
    backgroundColor: colors.amberBg,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  rateBtnText: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: colors.amberText,
  },
  cancelBtn: {
    backgroundColor: ui.dangerBg,
  },
  cancelBtnText: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: ui.dangerText,
  },
});
