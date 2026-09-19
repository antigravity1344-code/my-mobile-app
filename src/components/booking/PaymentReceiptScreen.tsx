import { CheckCircle2, Home, ReceiptText, RotateCcw, XCircle } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBooking } from '../../context/BookingContext';
import { useOrders, type OrderItem } from '../../features/orders';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export const PaymentReceiptScreen = () => {
  const booking = useBooking();
  const { addNewOrder } = useOrders();
  const receipt = booking.paymentReceipt;

  if (!receipt) return null;

  const isPaid = receipt.status === 'PAID';

  // ثبت سفارش جدید در ماژول مدیریت سفارش‌ها پس از تایید موفقیت در پرداخت
  const handleReturnHome = async () => {
    if (isPaid && receipt) {
      const newOrder: OrderItem = {
        id: receipt.orderId,
        orderNumber: receipt.orderId,
        serviceId: booking.selectedService?.id || 'standard_home_cleaning',
        serviceTitle: booking.selectedService?.title || 'نظافت منزل',
        pricingType: booking.selectedService?.pricingType || 'hourly',
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        paymentMethod: 'ONLINE',
        date: booking.selectedDate || {
          dateString: '1403-06-26',
          dayOfWeek: 'چهارشنبه',
          dayOfMonth: 26,
          monthName: 'شهریور',
          isToday: true,
          isTomorrow: false,
        },
        timeSlot: booking.selectedTimeSlot || {
          id: 'slot_1',
          startTime: '09:00',
          endTime: '13:00',
          label: '۰۹:۰۰ - ۱۳:۰۰',
          period: 'MORNING',
          isAvailable: true,
        },
        durationHours: booking.durationHours || 4,
        genderPreference: booking.genderPreference || 'NO_PREFERENCE',
        serviceOptions: booking.serviceOptions || {},
        recurringFrequency: booking.recurringFrequency || 'ONE_TIME',
        customerTier: booking.customerTier || 'NEW',
        address: booking.addressDetails,
        pricing: {
          subtotal: receipt.amountInRials / 10,
          earlyBirdDiscountRate: 0,
          earlyBirdDiscountAmount: 0,
          tierDiscountRate: 0,
          tierDiscountAmount: 0,
          recurringDiscountRate: 0,
          recurringDiscountAmount: 0,
          discountRate: 0,
          discountAmount: 0,
          recurringDiscountDeferred: false,
          total: receipt.amountInRials / 10,
        },
        cleaner: {
          id: 'cln_auto',
          name: 'مریم حسینی',
          phone: '09129990000',
          rating: 4.9,
          completedJobsCount: 142,
        },
        timeline: [
          { step: 'SUBMITTED', title: 'ثبت رزرو اوليه', timestamp: receipt.paidAt, isCompleted: true, isCurrent: false },
          { step: 'CONFIRMED', title: 'تایید پرداخت و ثبت نهایی', timestamp: receipt.paidAt, isCompleted: true, isCurrent: true },
        ],
        createdAt: receipt.paidAt,
        updatedAt: receipt.paidAt,
      };

      await addNewOrder(newOrder);
    }
    booking.resetBooking();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={[styles.statusIcon, isPaid ? styles.successIcon : styles.failureIcon]}>
          {isPaid ? <CheckCircle2 size={42} color="#15803d" /> : <XCircle size={42} color="#b91c1c" />}
        </View>
        <Text style={styles.heading}>{isPaid ? 'پرداخت با موفقیت انجام شد' : 'پرداخت ناموفق بود'}</Text>
        <Text style={styles.subtitle}>
          {isPaid ? 'سفارش شما ثبت شد و در لیست سفارش‌های فعال قرار گرفت.' : receipt.error || 'تراکنش تایید نشد.'}
        </Text>

        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.label}>وضعیت سفارش</Text>
            <Text style={[styles.value, isPaid ? styles.successText : styles.failureText]}>
              {isPaid ? 'PAID / پرداخت‌شده' : 'FAILED / ناموفق'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>شماره سفارش</Text>
            <Text style={styles.value}>{receipt.orderId}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>مبلغ پرداختی</Text>
            <Text style={styles.value}>{(receipt.amountInRials / 10).toLocaleString('fa-IR')} تومان</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>کد پیگیری</Text>
            <Text style={styles.value}>{receipt.refId || 'ثبت نشده'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>تاریخ تراکنش</Text>
            <Text style={styles.value}>{formatDate(receipt.paidAt)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={handleReturnHome} style={styles.primary}>
            <Home size={18} color="#fff" />
            <Text style={styles.primaryText}>ثبت و بازگشت به صفحه اصلی</Text>
          </Pressable>
          {!isPaid && (
            <Pressable
              onPress={() => {
                booking.clearPaymentReceipt();
                booking.setStep(4);
              }}
              style={styles.secondary}
            >
              <RotateCcw size={18} color="#0369a1" />
              <Text style={styles.secondaryText}>تلاش دوباره</Text>
            </Pressable>
          )}
        </View>
      </View>
      <ReceiptText size={22} color="#94a3b8" style={{ marginTop: 12 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#e2e8f0', gap: 14 },
  statusIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  successIcon: { backgroundColor: '#dcfce7' },
  failureIcon: { backgroundColor: '#fee2e2' },
  heading: { color: '#0f172a', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#64748b', fontSize: 13, lineHeight: 21, textAlign: 'center' },
  details: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 14, gap: 12 },
  detailRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { color: '#64748b', fontSize: 12 },
  value: { color: '#0f172a', fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  successText: { color: '#15803d' },
  failureText: { color: '#b91c1c' },
  actions: { gap: 9, marginTop: 4 },
  primary: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 13, backgroundColor: '#0284c7' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondary: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 13, backgroundColor: '#e0f2fe' },
  secondaryText: { color: '#0369a1', fontWeight: '800' },
});
