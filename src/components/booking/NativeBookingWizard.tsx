import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, Clock, MapPin, Sparkles } from 'lucide-react-native';
import { useBooking } from '../../context/BookingContext';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { calculatePrice, submitBooking } from '../../api/booking';
import { requestPayment, verifyPayment } from '../../api/payment';
import { getCurrentPosition } from '../../services/location';
import { JalaliDateOption, TimeSlot } from '../../types/booking';
import { CleaningService } from '../../types/service';
import { isValidAddress, normalizePersianDigits } from '../../utils/bookingValidation';

const TIME_SLOTS: TimeSlot[] = [
  { id: 'morning-1', startTime: '08:00', endTime: '10:00', label: 'صبح زود', period: 'MORNING', isAvailable: true },
  { id: 'morning-2', startTime: '10:00', endTime: '12:00', label: 'صبح', period: 'MORNING', isAvailable: true },
  { id: 'afternoon-1', startTime: '14:00', endTime: '16:00', label: 'ظهر', period: 'AFTERNOON', isAvailable: true },
  { id: 'afternoon-2', startTime: '16:00', endTime: '18:00', label: 'عصر', period: 'AFTERNOON', isAvailable: true },
];

const makeDates = (): JalaliDateOption[] => {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });
  const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const parts = formatter.formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return {
      dateString: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      dayOfWeek: days[date.getDay()],
      dayOfMonth: Number(value('day').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))),
      monthName: `${value('month')} ${value('year')}`,
      isToday: index === 0,
      isTomorrow: index === 1,
    };
  });
};

const StepHeader = ({ step }: { step: number }) => (
  <View style={styles.stepRow}>
    {['سرویس', 'زمان', 'آدرس', 'بازبینی'].map((label, index) => {
      const number = index + 1;
      return (
        <View key={label} style={styles.stepItem}>
          <View style={[styles.stepCircle, number <= step && styles.stepCircleActive]}>
            {number < step ? <Check size={16} color="#fff" /> : <Text style={[styles.stepNumber, number <= step && styles.stepNumberActive]}>{number}</Text>}
          </View>
          <Text style={[styles.stepLabel, number === step && styles.stepLabelActive]}>{label}</Text>
        </View>
      );
    })}
  </View>
);

export const NativeBookingWizard = () => {
  const booking = useBooking();
  const dates = useMemo(makeDates, []);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'pending' | 'success' | 'error'>('idle');
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [districtSearch, setDistrictSearch] = useState('');
  const districts = ['سعادت‌آباد', 'شهرک غرب', 'پونک', 'نیاوران', 'ونک', 'تهران‌پارس', 'صادقیه'];
  const filteredDistricts = districts.filter((district) => district.includes(districtSearch.trim()));
  const total = booking.selectedService ? calculatePrice(booking.selectedService, booking.durationHours) + (booking.selectedTimeSlot?.extraFee ?? 0) : 0;
  const totalInRials = total * 10;

  useEffect(() => {
    const handlePaymentCallback = async (url: string) => {
      if (!url.startsWith('paksho://payment-result')) return;
      const authorityMatch = url.match(/[?&]authority=([^&]+)/);
      const authority = authorityMatch ? decodeURIComponent(authorityMatch[1]) : null;
      if (!authority) {
        setSubmissionState('error');
        setSubmissionMessage('پاسخ درگاه فاقد کد پیگیری است.');
        return;
      }
      setSubmissionState('submitting');
      const result = await verifyPayment(authority, totalInRials);
      setSubmissionState(result.success ? 'success' : 'error');
      setSubmissionMessage(result.success ? `پرداخت تایید شد. شناسه پیگیری: ${result.refId || 'نامشخص'}` : result.error || 'پرداخت تایید نشد.');
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handlePaymentCallback(url);
    });
    void Linking.getInitialURL().then((url) => {
      if (url) void handlePaymentCallback(url);
    });
    return () => subscription.remove();
  }, [totalInRials]);

  const selectService = (service: CleaningService) => {
    booking.setSelectedService(service);
    booking.setStep(2);
  };

  const useGps = async () => {
    setGpsLoading(true);
    const coordinates = await getCurrentPosition();
    if (coordinates) booking.updateAddressField('coordinates', coordinates);
    setGpsLoading(false);
  };

  const submitCurrentBooking = async () => {
    if (!booking.selectedService || !booking.selectedDate || !booking.selectedTimeSlot) return;
    setSubmissionState('submitting');
    setSubmissionMessage(null);
    const result = await submitBooking({
      selectedService: booking.selectedService,
      selectedDate: booking.selectedDate,
      selectedTimeSlot: booking.selectedTimeSlot,
      durationHours: booking.durationHours,
      genderPreference: booking.genderPreference,
      notes: booking.notes,
      addressDetails: {
        ...booking.addressDetails,
        plaque: normalizePersianDigits(booking.addressDetails.plaque),
        unit: normalizePersianDigits(booking.addressDetails.unit),
        contactPhone: normalizePersianDigits(booking.addressDetails.contactPhone),
      },
    });
    if (result.success) {
      if (!result.orderId || !booking.selectedService) {
        setSubmissionState('error');
        setSubmissionMessage('سفارش ثبت شد اما شناسه سفارش برای پرداخت دریافت نشد.');
        return;
      }
      const payment = await requestPayment({
        orderId: result.orderId,
        amount: totalInRials,
        description: `رزرو ${booking.selectedService.title}`,
        mobile: booking.addressDetails.contactPhone,
        callbackUrl: 'paksho://payment-result',
      });
      if (!payment.success || !payment.payUrl) {
        setSubmissionState('error');
        setSubmissionMessage(payment.error || 'لینک پرداخت دریافت نشد.');
        return;
      }
      await Linking.openURL(payment.payUrl);
      setSubmissionState('pending');
      setSubmissionMessage(`سفارش ${result.orderId} ثبت شد. پرداخت در درگاه بازشده در انتظار تأیید است.`);
    } else {
      setSubmissionState('error');
      setSubmissionMessage(result.error || 'ثبت سفارش انجام نشد.');
    }
  };

  const canContinue = booking.step === 1 ? Boolean(booking.selectedService) : booking.step === 2 ? Boolean(booking.selectedDate && booking.selectedTimeSlot) : booking.step === 3 ? isValidAddress(booking.addressDetails) : true;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}><Sparkles size={22} color="#fff" /></View>
          <View><Text style={styles.title}>پاکشو</Text><Text style={styles.subtitle}>رزرو سرویس نظافت</Text></View>
        </View>
        <StepHeader step={booking.step} />

        {booking.step === 1 && <View style={styles.section}>
          <Text style={styles.heading}>نوع سرویس را انتخاب کنید</Text>
          {SERVICES_CATALOG.filter((service) => service.isVisible).map((service) => (
            <Pressable key={service.id} onPress={() => selectService(service)} style={[styles.card, booking.selectedService?.id === service.id && styles.cardSelected]}>
              <View style={styles.cardIcon}><Sparkles size={20} color="#0284c7" /></View>
              <View style={styles.flex}><Text style={styles.cardTitle}>{service.title}</Text><Text style={styles.muted}>{service.subtitle}</Text></View>
              <Text style={styles.price}>{service.basePrice.toLocaleString('fa-IR')} تومان{service.pricingType === 'hourly' ? '/ساعت' : ''}</Text>
            </Pressable>
          ))}
        </View>}

        {booking.step === 2 && <View style={styles.section}>
          <Text style={styles.heading}>تاریخ و ساعت</Text>
          <Text style={styles.label}>تاریخ اعزام</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
            {dates.map((date) => <Pressable key={date.dateString} onPress={() => { booking.setSelectedDate(date); booking.setSelectedTimeSlot(null); }} style={[styles.dateCard, booking.selectedDate?.dateString === date.dateString && styles.dateSelected]}><Text style={styles.dateDay}>{date.isToday ? 'امروز' : date.dayOfWeek}</Text><Text style={styles.dateNumber}>{date.dayOfMonth}</Text><Text style={styles.muted}>{date.monthName}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.label}>بازه زمانی</Text>
          {TIME_SLOTS.map((slot) => <Pressable key={slot.id} disabled={!booking.selectedDate} onPress={() => booking.setSelectedTimeSlot(slot)} style={[styles.slot, booking.selectedTimeSlot?.id === slot.id && styles.cardSelected]}><Clock size={18} color="#0284c7" /><Text style={styles.flex}>{slot.label} ({slot.startTime} تا {slot.endTime})</Text>{booking.selectedTimeSlot?.id === slot.id && <Check size={18} color="#059669" />}</Pressable>)}
          <Text style={styles.label}>مدت زمان</Text><View style={styles.choiceRow}>{[2, 3, 4, 5, 6, 8].map((hours) => <Pressable key={hours} onPress={() => booking.setDurationHours(hours)} style={[styles.choice, booking.durationHours === hours && styles.choiceSelected]}><Text style={booking.durationHours === hours ? styles.choiceTextSelected : styles.choiceText}>{hours} ساعت</Text></Pressable>)}</View>
        </View>}

        {booking.step === 3 && <View style={styles.section}>
          <Text style={styles.heading}>آدرس و تحویل‌گیرنده</Text>
          <Pressable onPress={useGps} style={styles.gpsButton}><MapPin size={18} color="#0284c7" /><Text style={styles.gpsText}>{gpsLoading ? 'در حال دریافت موقعیت...' : 'استفاده از موقعیت فعلی'}</Text>{gpsLoading && <ActivityIndicator color="#0284c7" />}</Pressable>
          <TextInput value={districtSearch} onChangeText={setDistrictSearch} placeholder="جستجوی محله" style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false}>{filteredDistricts.map((district) => <Pressable key={district} onPress={() => booking.updateAddressField('district', district)} style={[styles.chip, booking.addressDetails.district === district && styles.chipSelected]}><Text style={styles.chipText}>{district}</Text></Pressable>)}</ScrollView>
          <Text style={styles.label}>نشانی دقیق</Text><TextInput multiline value={booking.addressDetails.fullAddress} onChangeText={(value) => booking.updateAddressField('fullAddress', value)} placeholder="خیابان، کوچه، بن‌بست" style={[styles.input, styles.textArea]} />
          <View style={styles.choiceRow}><TextInput value={booking.addressDetails.plaque} onChangeText={(value) => booking.updateAddressField('plaque', value)} placeholder="پلاک" style={[styles.input, styles.smallInput]} /><TextInput value={booking.addressDetails.unit} onChangeText={(value) => booking.updateAddressField('unit', value)} placeholder="واحد" style={[styles.input, styles.smallInput]} /></View>
          <TextInput value={booking.addressDetails.recipientName} onChangeText={(value) => booking.updateAddressField('recipientName', value)} placeholder="نام تحویل‌گیرنده" style={styles.input} /><TextInput value={booking.addressDetails.contactPhone} onChangeText={(value) => booking.updateAddressField('contactPhone', value)} placeholder="09123456789" keyboardType="phone-pad" style={styles.input} />
        </View>}

        {booking.step === 4 && <View style={styles.section}><Text style={styles.heading}>بازبینی سفارش</Text><View style={styles.summary}><Text style={styles.summaryTitle}>{booking.selectedService?.title}</Text><Text style={styles.summaryLine}>زمان: {booking.selectedDate?.dayOfWeek} {booking.selectedDate?.dayOfMonth} {booking.selectedTimeSlot?.label}</Text><Text style={styles.summaryLine}>آدرس: {booking.addressDetails.district}، {booking.addressDetails.fullAddress}</Text><Text style={styles.total}>{total.toLocaleString('fa-IR')} تومان</Text></View>{submissionMessage && <Text style={submissionState === 'pending' ? styles.pendingMessage : submissionState === 'success' ? styles.successMessage : styles.errorMessage}>{submissionMessage}</Text>}{submissionState === 'pending' || submissionState === 'success' ? <Pressable onPress={() => { booking.resetBooking(); setSubmissionState('idle'); setSubmissionMessage(null); }} style={styles.primary}><Text style={styles.primaryText}>بازگشت به شروع</Text></Pressable> : <Pressable disabled={submissionState === 'submitting'} onPress={submitCurrentBooking} style={[styles.primary, submissionState === 'submitting' && styles.disabled]}>{submissionState === 'submitting' && <ActivityIndicator color="#fff" />}<Text style={styles.primaryText}>{submissionState === 'submitting' ? 'در حال ثبت سفارش...' : 'ثبت سفارش'}</Text></Pressable>}</View>}

        {booking.step < 4 && <View style={styles.navigation}><Pressable onPress={booking.prevStep} disabled={booking.step === 1} style={styles.back}><Text style={styles.backText}>مرحله قبل</Text></Pressable><Pressable onPress={booking.nextStep} disabled={!canContinue} style={[styles.primary, !canContinue && styles.disabled]}><Text style={styles.primaryText}>ادامه</Text></Pressable></View>}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  successMessage: { color: '#166534', backgroundColor: '#dcfce7', padding: 12, borderRadius: 12, textAlign: 'right' },
  screen: { flex: 1, backgroundColor: '#f8fafc' }, content: { padding: 20, paddingTop: 56, paddingBottom: 40 }, brandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 24 }, brandIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0284c7' }, title: { textAlign: 'right', color: '#0f172a', fontSize: 22, fontWeight: '800' }, subtitle: { textAlign: 'right', color: '#64748b', fontSize: 13 }, stepRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 26 }, stepItem: { alignItems: 'center', gap: 5 }, stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }, stepCircleActive: { backgroundColor: '#0284c7' }, stepNumber: { color: '#64748b', fontWeight: '700' }, stepNumberActive: { color: '#fff' }, stepLabel: { color: '#94a3b8', fontSize: 11 }, stepLabelActive: { color: '#0284c7', fontWeight: '700' }, section: { gap: 12 }, heading: { textAlign: 'right', color: '#0f172a', fontSize: 20, fontWeight: '800', marginBottom: 6 }, label: { textAlign: 'right', color: '#334155', fontSize: 13, fontWeight: '700', marginTop: 8 }, card: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 16, padding: 15 }, cardSelected: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' }, cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, cardTitle: { textAlign: 'right', color: '#0f172a', fontWeight: '700', fontSize: 14 }, muted: { color: '#64748b', fontSize: 11, textAlign: 'right' }, price: { color: '#059669', fontSize: 11, fontWeight: '700', textAlign: 'right' }, horizontalList: { gap: 8, paddingVertical: 4 }, dateCard: { width: 82, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', borderRadius: 14, alignItems: 'center', gap: 3 }, dateSelected: { borderColor: '#0284c7', backgroundColor: '#e0f2fe' }, dateDay: { color: '#475569', fontSize: 11 }, dateNumber: { color: '#0f172a', fontSize: 20, fontWeight: '800' }, slot: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, backgroundColor: '#fff' }, choiceRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }, choice: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#fff' }, choiceSelected: { backgroundColor: '#0284c7', borderColor: '#0284c7' }, choiceText: { color: '#475569', fontSize: 12 }, choiceTextSelected: { color: '#fff', fontWeight: '700', fontSize: 12 }, gpsButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, backgroundColor: '#e0f2fe' }, gpsText: { color: '#0369a1', fontWeight: '700' }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, color: '#0f172a', textAlign: 'right' }, textArea: { minHeight: 80, textAlignVertical: 'top' }, smallInput: { flex: 1 }, chip: { paddingHorizontal: 13, paddingVertical: 8, marginRight: 6, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' }, chipSelected: { backgroundColor: '#0284c7', borderColor: '#0284c7' }, chipText: { color: '#475569', fontSize: 12 }, summary: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 12, borderWidth: 1, borderColor: '#e2e8f0' }, summaryTitle: { textAlign: 'right', color: '#0f172a', fontWeight: '800', fontSize: 16 }, summaryLine: { textAlign: 'right', color: '#475569', fontSize: 13 }, total: { textAlign: 'right', color: '#059669', fontWeight: '900', fontSize: 22, marginTop: 8 }, pendingMessage: { color: '#92400e', backgroundColor: '#fef3c7', padding: 12, borderRadius: 12, textAlign: 'right' }, errorMessage: { color: '#b91c1c', backgroundColor: '#fee2e2', padding: 12, borderRadius: 12, textAlign: 'right' }, navigation: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }, primary: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 13, backgroundColor: '#0284c7' }, primaryText: { color: '#fff', fontWeight: '800' }, disabled: { opacity: 0.45 }, back: { padding: 13 }, backText: { color: '#475569', fontWeight: '700' },
});
