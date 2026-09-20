import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
  Alert,
  TextInput,
} from 'react-native';
import { SUPPORT_TEL_URL } from '../../support';
import {
  X,
  Phone,
  MapPin,
  Calendar,
  Clock,
  User,
  Star,
  Receipt,
  AlertTriangle,
  Headphones,
  CheckCircle2,
  Sparkles,
} from 'lucide-react-native';
import type { OrderItem } from '../types/order';
import { isOrderCancellable } from '../services/orderService';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderTrackingTimeline } from './OrderTrackingTimeline';

interface OrderDetailModalProps {
  order: OrderItem | undefined;
  visible: boolean;
  onClose: () => void;
  onOpenRating: (orderId: string) => void;
  onCancelOrder: (orderId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
}

const RECURRING_TITLES: Record<string, string> = {
  ONE_TIME: 'یک‌بار',
  WEEKLY: 'هفتگی',
  BIWEEKLY: 'هر دو هفته یک‌بار',
  MONTHLY: 'ماهانه',
};

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  visible,
  onClose,
  onOpenRating,
  onCancelOrder,
}) => {
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  if (!order) return null;

  const isCancellable = isOrderCancellable(order.status);
  const isCompleted = order.status === 'COMPLETED';

  const handleCallCleaner = () => {
    if (order.cleaner?.phone) {
      void Linking.openURL(`tel:${order.cleaner.phone}`);
    }
  };

  const handleCallSupport = () => {
    void Linking.openURL(SUPPORT_TEL_URL);
  };

  const handleConfirmCancel = async () => {
    setIsCancelling(true);
    try {
      const res = await onCancelOrder(order.id, cancelReason.trim() || undefined);
      if (res.success) {
        setShowCancelPrompt(false);
        setCancelReason('');
      } else {
        Alert.alert('خطا', res.error || 'امکان لغو سفارش وجود ندارد.');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#475569" />
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <View style={styles.headerTopRow}>
                <Text style={styles.headerTitle}>جزئیات سفارش</Text>
                <OrderStatusBadge status={order.status} size="sm" />
              </View>
              <Text style={styles.headerSubtitle}>{order.orderNumber}</Text>
            </View>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Service Title Box */}
            <View style={styles.serviceBox}>
              <View style={styles.serviceIconWrap}>
                <Sparkles size={20} color="#0284c7" />
              </View>
              <View style={styles.serviceTextWrap}>
                <Text style={styles.serviceTitle}>{order.serviceTitle}</Text>
                {Boolean(order.serviceSubtitle) && (
                  <Text style={styles.serviceSubtitle}>{order.serviceSubtitle}</Text>
                )}
              </View>
            </View>

            {/* Tracking Timeline */}
            <View style={styles.card}>
              <Text style={styles.cardHeading}>وضعیت و پیگیری زنده</Text>
              <OrderTrackingTimeline events={order.timeline} />
            </View>

            {/* Cleaner Card */}
            {Boolean(order.cleaner) && (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>اطلاعات متخصص نظافت</Text>
                <View style={styles.cleanerRow}>
                  <View style={styles.cleanerAvatar}>
                    <User size={26} color="#0284c7" />
                  </View>
                  <View style={styles.cleanerInfo}>
                    <Text style={styles.cleanerName}>{order.cleaner?.name}</Text>
                    <View style={styles.cleanerRatingRow}>
                      <Star size={13} color="#f59e0b" fill="#f59e0b" />
                      <Text style={styles.cleanerRatingText}>{order.cleaner?.rating}</Text>
                      <Text style={styles.cleanerJobsText}>
                        ({order.cleaner?.completedJobsCount} سفارش موفق)
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={handleCallCleaner} style={styles.callCleanerBtn}>
                    <Phone size={16} color="#fff" />
                    <Text style={styles.callCleanerText}>تماس</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Booking Details (Time & Address) */}
            <View style={styles.card}>
              <Text style={styles.cardHeading}>اطلاعات زمان و آدرس</Text>
              <View style={styles.infoRow}>
                <Calendar size={15} color="#0284c7" />
                <Text style={styles.infoLabel}>تاریخ رزرو:</Text>
                <Text style={styles.infoValue}>
                  {order.date.dayOfWeek} {order.date.dayOfMonth} {order.date.monthName}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Clock size={15} color="#0284c7" />
                <Text style={styles.infoLabel}>ساعت و مدت:</Text>
                <Text style={styles.infoValue}>
                  {order.timeSlot.startTime} الی {order.timeSlot.endTime} ({order.durationHours} ساعت)
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Sparkles size={15} color="#0284c7" />
                <Text style={styles.infoLabel}>تناوب سفارش:</Text>
                <Text style={styles.infoValue}>
                  {RECURRING_TITLES[order.recurringFrequency] || 'عادی'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <MapPin size={15} color="#0284c7" />
                <Text style={styles.infoLabel}>محله و نشانی:</Text>
                <Text style={styles.infoValue}>
                  {order.address.district}، {order.address.fullAddress}
                  {order.address.plaque ? `، پلاک ${order.address.plaque}` : ''}
                  {order.address.unit ? `، واحد ${order.address.unit}` : ''}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <User size={15} color="#0284c7" />
                <Text style={styles.infoLabel}>تحویل‌گیرنده:</Text>
                <Text style={styles.infoValue}>
                  {order.address.recipientName} ({order.address.contactPhone})
                </Text>
              </View>
            </View>

            {/* Financial Invoice Breakdown */}
            <View style={styles.card}>
              <View style={styles.cardHeadingRow}>
                <Receipt size={17} color="#059669" />
                <Text style={styles.cardHeading}>صورت‌حساب شفاف</Text>
              </View>
              <View style={styles.invoiceLine}>
                <Text style={styles.invoiceLabel}>مبلغ پایه سرویس</Text>
                <Text style={styles.invoiceValue}>
                  {order.pricing.subtotal.toLocaleString('fa-IR')} تومان
                </Text>
              </View>

              {order.pricing.earlyBirdDiscountAmount > 0 && (
                <View style={[styles.invoiceLine, styles.discountRow]}>
                  <Text style={styles.discountLabel}>
                    تخفیف رزرو زودهنگام ({Math.round(order.pricing.earlyBirdDiscountRate * 100)}٪)
                  </Text>
                  <Text style={styles.discountValue}>
                    -{order.pricing.earlyBirdDiscountAmount.toLocaleString('fa-IR')} تومان
                  </Text>
                </View>
              )}

              {order.pricing.tierDiscountAmount > 0 && (
                <View style={[styles.invoiceLine, styles.discountRow]}>
                  <Text style={styles.discountLabel}>
                    تخفیف باشگاه مشتریان (سطح {order.customerTier})
                  </Text>
                  <Text style={styles.discountValue}>
                    -{order.pricing.tierDiscountAmount.toLocaleString('fa-IR')} تومان
                  </Text>
                </View>
              )}

              {order.pricing.recurringDiscountDeferred && (
                <Text style={styles.deferredHint}>
                  💡 تخفیف سفارش دوره‌ای طبق استاندارد از جلسه دوم لحاظ خواهد شد.
                </Text>
              )}

              {order.pricing.recurringDiscountAmount > 0 && (
                <View style={[styles.invoiceLine, styles.discountRow]}>
                  <Text style={styles.discountLabel}>تخفیف سفارش دوره‌ای</Text>
                  <Text style={styles.discountValue}>
                    -{order.pricing.recurringDiscountAmount.toLocaleString('fa-IR')} تومان
                  </Text>
                </View>
              )}

              <View style={styles.totalDivider} />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>مبلغ نهایی پرداخت‌شده</Text>
                <Text style={styles.totalValue}>
                  {order.pricing.total.toLocaleString('fa-IR')} تومان
                </Text>
              </View>

              <View style={styles.paymentStatusBadge}>
                <CheckCircle2 size={13} color="#059669" />
                <Text style={styles.paymentStatusText}>
                  وضعیت پرداخت: {order.paymentStatus === 'PAID' ? 'موفق و تایید شده' : 'در انتظار / ناموفق'} • روش: {order.paymentMethod === 'ONLINE' ? 'اینترنتی' : 'نقدی'}
                </Text>
              </View>
            </View>

            {/* Ratings / Feedback Section */}
            {Boolean(order.ratings?.customerRating) && (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>نظر و امتیاز شما</Text>
                <View style={styles.ratingStarsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={18}
                      color={star <= (order.ratings?.customerRating || 0) ? '#f59e0b' : '#e2e8f0'}
                      fill={star <= (order.ratings?.customerRating || 0) ? '#f59e0b' : 'transparent'}
                    />
                  ))}
                  <Text style={styles.ratingScoreText}>
                    {order.ratings?.customerRating} از ۵
                  </Text>
                </View>
                {Boolean(order.ratings?.customerComment) && (
                  <Text style={styles.commentText}>
                    «{order.ratings?.customerComment}»
                  </Text>
                )}
                {Boolean(order.ratings?.customerTags?.length) && (
                  <View style={styles.tagsContainer}>
                    {order.ratings?.customerTags?.map((tag) => (
                      <View key={tag} style={styles.tagBadge}>
                        <Text style={styles.tagBadgeText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Cancel Prompt Inline */}
            {showCancelPrompt && (
              <View style={styles.cancelBox}>
                <View style={styles.cancelBoxTitleRow}>
                  <AlertTriangle size={18} color="#b91c1c" />
                  <Text style={styles.cancelBoxTitle}>تأیید لغو سفارش</Text>
                </View>
                <Text style={styles.cancelBoxDesc}>
                  آیا از لغو این سفارش اطمینان دارید؟ در صورت لغو، هماهنگی‌های انجام شده با کارشناس متوقف خواهد شد.
                </Text>
                <TextInput
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  placeholder="دلیل لغو (اختیاری)"
                  placeholderTextColor="#94a3b8"
                  style={styles.cancelInput}
                />
                <View style={styles.cancelActionsRow}>
                  <Pressable
                    disabled={isCancelling}
                    onPress={handleConfirmCancel}
                    style={styles.confirmCancelBtn}
                  >
                    <Text style={styles.confirmCancelText}>
                      {isCancelling ? 'در حال لغو...' : 'بله، سفارش لغو شود'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowCancelPrompt(false)}
                    style={styles.abortCancelBtn}
                  >
                    <Text style={styles.abortCancelText}>انصراف</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            {isCompleted && (
              <Pressable
                onPress={() => onOpenRating(order.id)}
                style={styles.footerRatingBtn}
              >
                <Star size={16} color="#fff" />
                <Text style={styles.footerRatingText}>
                  {order.ratings?.customerRating ? 'ویرایش امتیاز و نظر' : 'ثبت امتیاز برای متخصص'}
                </Text>
              </Pressable>
            )}

            {isCancellable && !showCancelPrompt && (
              <Pressable
                onPress={() => setShowCancelPrompt(true)}
                style={styles.footerCancelBtn}
              >
                <Text style={styles.footerCancelText}>لغو این سفارش</Text>
              </Pressable>
            )}

            <Pressable onPress={handleCallSupport} style={styles.footerSupportBtn}>
              <Headphones size={16} color="#0369a1" />
              <Text style={styles.footerSupportText}>پشتیبانی</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    height: '92%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitleWrap: {
    alignItems: 'flex-end',
  },
  headerTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    padding: 16,
  },
  serviceBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  serviceIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTextWrap: {
    flex: 1,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0369a1',
    textAlign: 'right',
  },
  serviceSubtitle: {
    fontSize: 11,
    color: '#0284c7',
    textAlign: 'right',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
    marginBottom: 10,
  },
  cardHeadingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  cleanerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  cleanerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanerInfo: {
    flex: 1,
  },
  cleanerName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },
  cleanerRatingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  cleanerRatingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309',
  },
  cleanerJobsText: {
    fontSize: 10,
    color: '#64748b',
  },
  callCleanerBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  callCleanerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  infoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  infoValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  invoiceLine: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  invoiceLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  invoiceValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  discountRow: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 2,
  },
  discountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  discountValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  deferredHint: {
    fontSize: 11,
    color: '#0369a1',
    backgroundColor: '#f0f9ff',
    padding: 8,
    borderRadius: 8,
    textAlign: 'right',
    marginVertical: 4,
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#cbd5e1',
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  paymentStatusBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  paymentStatusText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  ratingStarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  ratingScoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#d97706',
    marginRight: 8,
  },
  commentText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 20,
    textAlign: 'right',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369a1',
  },
  cancelBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cancelBoxTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cancelBoxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991b1b',
  },
  cancelBoxDesc: {
    fontSize: 11,
    color: '#7f1d1d',
    lineHeight: 18,
    textAlign: 'right',
    marginBottom: 10,
  },
  cancelInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    textAlign: 'right',
    color: '#0f172a',
    marginBottom: 10,
  },
  cancelActionsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: '#dc2626',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmCancelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  abortCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  abortCancelText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row-reverse',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8,
    backgroundColor: '#fff',
  },
  footerRatingBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f59e0b',
    paddingVertical: 12,
    borderRadius: 12,
  },
  footerRatingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  footerCancelBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCancelText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800',
  },
  footerSupportBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  footerSupportText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
  },
});
