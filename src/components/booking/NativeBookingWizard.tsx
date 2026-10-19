import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, Clock, MapPin, Sparkles, X } from 'lucide-react-native';
import { useBooking } from '../../context/BookingContext';
import { PricingTable } from './PricingTable';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { buildJalaliDateOptions, toPersianDigits } from '../../utils/jalaliDateOptions';
import { getCurrentPosition } from '../../services/location';
import { JalaliDateOption, TimeSlot } from '../../types/booking';
import { CleaningService } from '../../types/service';
import { isValidAddress, normalizePersianDigits, getAddressValidationErrors } from '../../utils/bookingValidation';
import { useOrders, type OrderItem } from '../../features/orders';
import { useProfile, type SavedAddress } from '../../features/profile';
import { getWizardBackAction, getWizardCloseAction, type WizardBackAction } from './wizardBackNavigation';
import { createScrollToEndOnce, rtlOrder } from './rtlHorizontalList';
import { createSubmitGuard } from './submitGuard';
import { computeRevealDelta } from './keyboardReveal';
import { addressFieldTone, firstAddressHint } from './addressFieldTone';
import { messageForGpsResult } from './gpsFeedback';
import { RTL_SINGLE_LINE_INPUT } from '../native/rtlInput';
import { bookingRequestFingerprint, clientRequestIdForAttempt, type HeldClientRequest } from '../../features/orders/services/clientRequestId';
import {
  QUOTE_STALE_MESSAGE,
  confirmableServerQuote,
  formatServerAmount,
  isQuoteRefreshCode,
  serverQuoteAsFinalPrice,
} from '../../features/orders/services/serverQuote';
import { useCustomerPriceQuote } from '../../features/orders/services/useCustomerPriceQuote';
import { colors, fontFamily, radius, ui, TOUCH_MIN } from '../../theme';

const TIME_SLOTS: TimeSlot[] = [
  { id: 'morning-1', startTime: '08:00', endTime: '10:00', label: 'صبح زود', period: 'MORNING', isAvailable: true },
  { id: 'morning-2', startTime: '10:00', endTime: '12:00', label: 'صبح', period: 'MORNING', isAvailable: true },
  { id: 'afternoon-1', startTime: '14:00', endTime: '16:00', label: 'ظهر', period: 'AFTERNOON', isAvailable: true },
  { id: 'afternoon-2', startTime: '16:00', endTime: '18:00', label: 'عصر', period: 'AFTERNOON', isAvailable: true },
];

const makeDates = (): JalaliDateOption[] => buildJalaliDateOptions();

const StepHeader = ({ step }: { step: number }) => (
  <View style={styles.stepRow}>
    {['سرویس', 'زمان', 'آدرس', 'بازبینی'].map((label, index) => {
      const number = index + 1;
      return (
        <View key={label} style={styles.stepItem}>
          <View style={[styles.stepCircle, number <= step && styles.stepCircleActive]}>
            {number < step ? <Check size={16} color={colors.white} /> : <Text style={[styles.stepNumber, number <= step && styles.stepNumberActive]}>{toPersianDigits(number)}</Text>}
          </View>
          <Text style={[styles.stepLabel, number === step && styles.stepLabelActive]}>{label}</Text>
        </View>
      );
    })}
  </View>
);

interface NativeBookingWizardProps {
  onOrderCreated?: (orderId: string) => void;
  /** Leave the wizard (e.g. back to the home tab). The booking draft is reset before this is called. */
  onExit?: () => void;
}

export const NativeBookingWizard = ({ onOrderCreated, onExit }: NativeBookingWizardProps) => {
  const booking = useBooking();
  const { addNewOrder } = useOrders();
  const dates = useMemo(makeDates, []);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const submitGuard = useRef(createSubmitGuard());
  // کلید فقط تا وقتی محتوای سفارش و قیمت عوض نشده بماند تا خطای نامشخص شبکه سفارش دوم نسازد.
  const clientRequestKey = useRef<HeldClientRequest | null>(null);
  const quoteSelection = booking.selectedService
    ? {
      serviceId: booking.selectedService.id,
      pricingType: booking.selectedService.pricingType,
      durationHours: booking.durationHours,
      serviceOptions: booking.serviceOptions,
    }
    : null;
  const { view: quoteView, confirmable, refreshQuote } = useCustomerPriceQuote(quoteSelection);
  const [districtSearch, setDistrictSearch] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const dateStripRef = useRef<ScrollView>(null);
  const savedAddressStripRef = useRef<ScrollView>(null);
  const districtStripRef = useRef<ScrollView>(null);
  const [dateStripScroll] = useState(() => createScrollToEndOnce(() => dateStripRef.current));
  const [savedAddressStripScroll] = useState(() => createScrollToEndOnce(() => savedAddressStripRef.current));
  const [districtStripScroll] = useState(() => createScrollToEndOnce(() => districtStripRef.current));
  // Strips remount when the step changes; let each open at its right edge (first item) again.
  useEffect(() => {
    dateStripScroll.reset();
    savedAddressStripScroll.reset();
    districtStripScroll.reset();
  }, [booking.step, dateStripScroll, savedAddressStripScroll, districtStripScroll]);
  useEffect(() => {
    districtStripScroll.reset();
  }, [districtSearch, districtStripScroll]);
  // Keep the focused address field (plak/unit/name/phone…) above the Android keyboard.
  // RN's built-in scroll-to-keyboard helper (ScrollView responder) assumes a full-screen ScrollView and, before
  // keyboardDidShow arrives, uses the window height as keyboard top — so fields in the middle of the
  // form (plak/unit) were scrolled to the top or left behind the keyboard. We measure in window
  // coordinates instead and re-check once the keyboard is really shown (and the view has resized).
  const scrollYRef = useRef(0);
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealFocusedField = () => {
    const input = TextInput.State.currentlyFocusedInput?.() as unknown as
      | { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }
      | null;
    const scroll = scrollRef.current;
    if (!input?.measureInWindow || !scroll) return;
    const host = (scroll as unknown as { getNativeScrollRef?: () => unknown }).getNativeScrollRef?.() as
      | { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }
      | null
      | undefined;
    if (!host?.measureInWindow) return;
    host.measureInWindow((_sx, sy, _sw, sh) => {
      input.measureInWindow?.((_ix, iy, _iw, ih) => {
        const kb = Keyboard.metrics();
        const delta = computeRevealDelta({
          fieldTop: iy,
          fieldBottom: iy + ih,
          viewportTop: sy,
          viewportBottom: sy + sh,
          keyboardTop: kb && kb.height > 0 ? kb.screenY : undefined,
        });
        if (delta !== 0) {
          scrollRef.current?.scrollTo({ y: Math.max(0, scrollYRef.current + delta), animated: true });
        }
      });
    });
  };
  const scheduleReveal = (delays: number[]) => {
    revealTimersRef.current.forEach(clearTimeout);
    revealTimersRef.current = delays.map((ms) => setTimeout(revealFocusedField, ms));
  };
  const scrollFocusedFieldIntoView = () => {
    // Keyboard already open (moving between fields, e.g. پلاک → واحد): reveal now and once more after
    // a possible keyboard type change (text ↔ number-pad). Otherwise keyboardDidShow triggers it;
    // the late timer is only a fallback for devices that never send that event.
    scheduleReveal(Keyboard.isVisible() ? [120, 400] : [700]);
  };
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      if (TextInput.State.currentlyFocusedInput?.()) scheduleReveal([60, 350]);
    });
    return () => {
      show.remove();
      revealTimersRef.current.forEach(clearTimeout);
      revealTimersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pricingVisible, setPricingVisible] = useState(false);
  const { profile, addSavedAddress } = useProfile();
  const savedAddresses = profile.savedAddresses ?? [];
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);
  const defaultSavedAddressAppliedRef = useRef(false);
  const profileContactPrefillRef = useRef(false);

  const applySavedAddressToWizard = (address: SavedAddress) => {
    booking.setAddressDetails((prev) => ({
      ...prev,
      district: address.district,
      fullAddress: address.fullAddress,
      plaque: address.plaque,
      unit: address.unit || '',
      recipientName: address.recipientName,
      contactPhone: address.contactPhone,
      isSaved: true,
    }));
    setDistrictSearch('');
    setSelectedSavedAddressId(address.id);
  };

  useEffect(() => {
    if (booking.step !== 3) {
      if (booking.step < 3) {
        defaultSavedAddressAppliedRef.current = false;
        profileContactPrefillRef.current = false;
      }
      return;
    }
    if (defaultSavedAddressAppliedRef.current || selectedSavedAddressId) return;

    const defaultAddress = savedAddresses.find((addr) => addr.isDefault) ?? null;
    const details = booking.addressDetails;
    const formLooksEmpty =
      !details.fullAddress?.trim() &&
      !details.plaque?.trim() &&
      !details.recipientName?.trim() &&
      !details.contactPhone?.trim();

    if (defaultAddress && formLooksEmpty) {
      applySavedAddressToWizard(defaultAddress);
      defaultSavedAddressAppliedRef.current = true;
      return;
    }

    // Soft prefill contact fields from the real logged-in profile only (once per step-3 entry).
    if (!profileContactPrefillRef.current && profile.id && profile.isLoggedIn) {
      profileContactPrefillRef.current = true;
      if (!details.recipientName?.trim() && profile.fullName?.trim()) {
        booking.updateAddressField('recipientName', profile.fullName.trim());
      }
      if (!details.contactPhone?.trim() && profile.phoneNumber?.trim()) {
        booking.updateAddressField('contactPhone', profile.phoneNumber.trim());
      }
    }
  }, [booking.step, savedAddresses, selectedSavedAddressId, booking.addressDetails, profile.id, profile.isLoggedIn, profile.fullName, profile.phoneNumber]);

  const [addressSaveMessage, setAddressSaveMessage] = useState<string | null>(null);

  const saveCurrentAddressToProfile = () => {
    const details = booking.addressDetails;
    if (!profile.id || !profile.isLoggedIn) {
      setAddressSaveMessage('برای ذخیره آدرس باید وارد حساب شده باشید.');
      return;
    }
    if (!details.district?.trim() || !details.fullAddress?.trim() || !details.plaque?.trim() || !details.recipientName?.trim() || !details.contactPhone?.trim()) {
      setAddressSaveMessage('برای ذخیره، محله، نشانی، پلاک، نام و موبایل را کامل کنید.');
      return;
    }
    const title = details.district.trim();
    addSavedAddress({
      title,
      district: details.district.trim(),
      fullAddress: details.fullAddress.trim(),
      plaque: details.plaque.trim(),
      unit: details.unit || '',
      recipientName: details.recipientName.trim(),
      contactPhone: details.contactPhone.trim(),
      isDefault: savedAddresses.length === 0,
    });
    setAddressSaveMessage('آدرس در پروفایل ذخیره شد.');
    setSelectedSavedAddressId(null);
  };


  useEffect(() => {
    if (submissionState === 'success') {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [submissionState]);
  const districts = ['سعادت‌آباد', 'شهرک غرب', 'پونک', 'نیاوران', 'ونک', 'تهران‌پارس', 'صادقیه'];
  const filteredDistricts = districts.filter((district) => district.includes(districtSearch.trim()));

  const selectService = (service: CleaningService, options: Record<string, string | number | boolean> = {}) => {
    booking.setSelectedService(service);
    Object.entries(options).forEach(([id, value]) => booking.setServiceOption(id, value));
    if (typeof options.durationHours === 'number') booking.setDurationHours(options.durationHours);
    booking.setStep(2);
  };

  const useGps = async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const coordinates = await getCurrentPosition();
      if (coordinates) booking.updateAddressField('coordinates', coordinates);
      setGpsError(messageForGpsResult(Boolean(coordinates)));
    } catch {
      setGpsError(messageForGpsResult(false));
    } finally {
      setGpsLoading(false);
    }
  };

  const addressErrors = getAddressValidationErrors(booking.addressDetails);
  const getInputStyle = (field: keyof typeof booking.addressDetails) => {
    const hasError = !!(addressErrors as Partial<Record<keyof typeof booking.addressDetails, unknown>>)[field];
    const tone = addressFieldTone(booking.addressDetails[field], hasError);
    return tone === 'error' ? styles.inputError : tone === 'ok' ? styles.inputSuccess : null;
  };
  const addressHint = firstAddressHint(addressErrors);
  const submitCurrentBooking = async () => {
    // دو لمس سریع قبل از رندر بعدی هر دو از disabled رد می‌شوند؛ این قفل همزمان فقط یکی را می‌فرستد.
    if (!submitGuard.current.tryBegin()) return;
    if (!booking.selectedService || !booking.selectedDate || !booking.selectedTimeSlot || !quoteSelection) {
      submitGuard.current.finish(false);
      return;
    }
    if (!confirmableServerQuote(quoteView, quoteSelection, Date.now())) {
      submitGuard.current.finish(false);
      refreshQuote();
      setSubmissionState('error');
      setSubmissionMessage(QUOTE_STALE_MESSAGE);
      return;
    }
    setSubmissionState('submitting');
    setSubmissionMessage(null);
    const confirmedQuote = quoteView.quote;
    const confirmedRequest = quoteView.request;

    const now = new Date().toISOString();
    const addressDetails = {
      ...booking.addressDetails,
      plaque: normalizePersianDigits(booking.addressDetails.plaque),
      unit: normalizePersianDigits(booking.addressDetails.unit),
      contactPhone: normalizePersianDigits(booking.addressDetails.contactPhone),
    };

    const fingerprint = bookingRequestFingerprint({
      serviceId: confirmedRequest.serviceId,
      options: confirmedRequest.options,
      quantity: confirmedRequest.quantity,
      durationHours: booking.durationHours,
      confirmedTotal: confirmedQuote.total,
      currencyUnit: confirmedQuote.currencyUnit,
      date: booking.selectedDate.dateString,
      time: booking.selectedTimeSlot.id,
      address: {
        district: addressDetails.district,
        fullAddress: addressDetails.fullAddress,
        plaque: addressDetails.plaque,
        unit: addressDetails.unit,
        floor: addressDetails.floor ?? '',
        recipientName: addressDetails.recipientName,
        contactPhone: addressDetails.contactPhone,
        addressNotes: addressDetails.addressNotes ?? '',
      },
      genderPreference: booking.genderPreference,
      recurringFrequency: booking.recurringFrequency,
      notes: booking.notes,
    });
    const held = clientRequestIdForAttempt(clientRequestKey.current, fingerprint);
    clientRequestKey.current = held;
    const newOrder: OrderItem = {
      id: `TEMP-${Date.now()}`,
      orderNumber: `TEMP-${Date.now()}`,
      serviceId: confirmedRequest.serviceId,
      serviceTitle: booking.selectedService.title,
      serviceSubtitle: booking.selectedService.subtitle,
      pricingType: booking.selectedService.pricingType,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      paymentMethod: 'CASH',
      date: booking.selectedDate,
      timeSlot: booking.selectedTimeSlot,
      durationHours: booking.durationHours,
      genderPreference: booking.genderPreference,
      serviceOptions: confirmedRequest.options,
      recurringFrequency: booking.recurringFrequency,
      customerTier: booking.customerTier,
      address: addressDetails,
      pricing: serverQuoteAsFinalPrice(confirmedQuote),
      quoteToken: confirmedQuote.quoteToken,
      confirmedTotal: confirmedQuote.total,
      quoteCurrencyUnit: confirmedQuote.currencyUnit,
      quoteQuantity: confirmedRequest.quantity,
      timeline: [
        {
          step: 'SUBMITTED',
          title: 'ثبت درخواست',
          timestamp: now,
          description: 'درخواست شما ثبت شد و در انتظار متخصص است.',
          isCompleted: true,
          isCurrent: true,
        },
      ],
      notes: booking.notes,
      clientRequestId: held.id,
      createdAt: now,
      updatedAt: now,
    };

    let result: { success: boolean; error?: string; code?: string; order?: OrderItem };
    try {
      result = await addNewOrder(newOrder);
    } catch {
      result = { success: false };
    }
    submitGuard.current.finish(result.success);
    if (result.success) clientRequestKey.current = null;
    if (result.success) {
      const orderId = result.order?.id || result.order?.orderNumber || newOrder.id;
      setCreatedOrderId(orderId);
      setSubmissionState('success');
      setSubmissionMessage(`درخواست «${newOrder.serviceTitle}» ثبت شد و در انتظار متخصص است.`);
    } else if (isQuoteRefreshCode(result.code)) {
      refreshQuote();
      setSubmissionState('error');
      setSubmissionMessage('قیمت تغییر کرده است. مبلغ جدید را ببینید و دوباره تأیید کنید.');
    } else {
      setSubmissionState('error');
      setSubmissionMessage(result.error || 'ثبت سفارش انجام نشد.');
    }
  };

  const isSubmitting = submissionState === 'submitting';
  const isSubmitted = submissionState === 'success';
  const exitWizard = () => {
    // Nothing is sent to the server here; just drop the half-filled draft and leave.
    booking.resetBooking();
    onExit?.();
  };
  const runWizardNavigation = (action: WizardBackAction) => {
    if (action === 'previous') {
      booking.prevStep();
    } else if (action === 'exitToHome') {
      exitWizard();
    } else if (action === 'confirmExit') {
      Alert.alert(
        'از ثبت سفارش خارج شوید؟',
        'اطلاعاتی که وارد کرده‌اید پاک می‌شود.',
        [
          { text: 'ادامه ثبت سفارش', style: 'cancel' },
          { text: 'خروج', style: 'destructive', onPress: exitWizard },
        ],
        { cancelable: true },
      );
    }
  };
  const navigationState = { step: booking.step, submitting: isSubmitting, submitted: isSubmitted };
  const handleClosePress = () => runWizardNavigation(getWizardCloseAction(navigationState));
  const hardwareBackRef = useRef<() => void>(() => {});
  hardwareBackRef.current = () => runWizardNavigation(getWizardBackAction(navigationState));
  useEffect(() => {
    // Registered only while the wizard is mounted, so Android back never closes the app from here.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      hardwareBackRef.current();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const canContinue = booking.step === 1 ? Boolean(booking.selectedService) : booking.step === 2 ? Boolean(booking.selectedDate && booking.selectedTimeSlot) : booking.step === 3 ? isValidAddress(booking.addressDetails) : true;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}><Sparkles size={22} color={colors.white} /></View>
          <View><Text style={styles.title}>پاکشو</Text><Text style={styles.subtitle}>رزرو سرویس نظافت</Text></View>
          <View style={styles.flex} />
          <Pressable
            onPress={handleClosePress}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="بستن ثبت سفارش"
            accessibilityState={{ disabled: isSubmitting }}
            hitSlop={8}
            style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed, isSubmitting && styles.disabled]}
          >
            <X size={20} color={colors.muted} />
          </Pressable>
        </View>
        <StepHeader step={booking.step} />

        {booking.step === 1 && <View style={styles.section}>
          <Text style={styles.heading}>نوع سرویس را انتخاب کنید</Text>
          <Pressable onPress={() => setPricingVisible(true)} style={styles.pricingButton}><Text style={styles.pricingButtonText}>مشاهده جدول شفاف تعرفه‌ها</Text></Pressable>
          {SERVICES_CATALOG.filter((service) => service.isVisible).map((service) => (
            <Pressable key={service.id} onPress={() => selectService(service)} style={[styles.card, booking.selectedService?.id === service.id && styles.cardSelected]}>
              <View style={styles.cardIcon}><Sparkles size={20} color={colors.teal} /></View>
              <View style={styles.flex}><Text style={styles.cardTitle}>{service.title}</Text><Text style={styles.muted}>{service.subtitle}</Text><Text style={styles.configuration}>{service.configuration.pricingLabel}</Text></View>
              <Text style={styles.price}>قیمت را سرور اعلام می‌کند</Text>
            </Pressable>
          ))}
          <PricingTable visible={pricingVisible} onClose={() => setPricingVisible(false)} onSelect={selectService} />
        </View>}

        {booking.step === 2 && <View style={styles.section}>
          <Text style={styles.heading}>تاریخ و ساعت</Text>
          <Text style={styles.earlyBirdHint}>مبلغ نهایی را سرور از تعرفه شرکت محاسبه می‌کند و قبل از ثبت نشان می‌دهد.</Text>
          <Text style={styles.label}>تاریخ اعزام</Text>
          <ScrollView ref={dateStripRef} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={dateStripScroll.onContentSizeChange} contentContainerStyle={[styles.horizontalList, styles.rtlStrip]}>
            {rtlOrder(dates).map((date) => <Pressable key={date.dateString} onPress={() => { booking.setSelectedDate(date); booking.setSelectedTimeSlot(null); }} style={[styles.dateCard, booking.selectedDate?.dateString === date.dateString && styles.dateSelected]}><Text style={styles.dateDay}>{date.isToday ? 'امروز' : date.dayOfWeek}</Text><Text style={styles.dateNumber}>{toPersianDigits(date.dayOfMonth)}</Text><Text style={styles.muted}>{date.monthName}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.label}>بازه زمانی</Text>
          {TIME_SLOTS.map((slot) => <Pressable key={slot.id} disabled={!booking.selectedDate} onPress={() => booking.setSelectedTimeSlot(slot)} style={[styles.slot, booking.selectedTimeSlot?.id === slot.id && styles.cardSelected]}><Clock size={18} color={colors.teal} /><Text style={[styles.flex, styles.slotText]}>{slot.label} ({toPersianDigits(slot.startTime)} تا {toPersianDigits(slot.endTime)})</Text>{booking.selectedTimeSlot?.id === slot.id && <Check size={18} color={colors.teal} />}</Pressable>)}
          {booking.selectedService?.pricingType === 'hourly' && <><Text style={styles.label}>مدت زمان</Text><View style={styles.choiceRow}>{[4, 5, 6, 8].map((hours) => <Pressable key={hours} onPress={() => booking.setDurationHours(hours)} style={[styles.choice, booking.durationHours === hours && styles.choiceSelected]}><Text style={booking.durationHours === hours ? styles.choiceTextSelected : styles.choiceText}>{toPersianDigits(hours)} ساعت</Text></Pressable>)}</View></>}
          <Text style={styles.label}>تکرار سفارش</Text>
          <View style={styles.choiceRow}>
            {[
              ['ONE_TIME', 'یک‌باره'],
              ['WEEKLY', 'هفتگی'],
              ['BIWEEKLY', 'چندهفته‌ای'],
              ['MONTHLY', 'ماهانه'],
            ].map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => booking.setRecurringFrequency(value as typeof booking.recurringFrequency)}
                style={[styles.choice, booking.recurringFrequency === value && styles.choiceSelected]}
              >
                <Text style={booking.recurringFrequency === value ? styles.choiceTextSelected : styles.choiceText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {booking.recurringFrequency !== 'ONE_TIME' && (
            <Text style={styles.recurringHint}>
              تکرار سفارش همراه درخواست فرستاده می‌شود. مبلغ همین سفارش را فقط سرور محاسبه می‌کند.
            </Text>
          )}
          <Text style={styles.label}>یادداشت سفارش (اختیاری)</Text>
          <TextInput
            multiline
            value={booking.notes}
            onChangeText={booking.setNotes}
            placeholder="مثال: لطفاً قبل از ورود تماس بگیرید"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.textArea]}
          />
          {booking.selectedService?.configuration.inputs?.map((input) => (
            <View key={input.id} style={styles.optionBlock}>
              <Text style={styles.label}>{input.label}</Text>
              {input.type === 'number' && <TextInput keyboardType="numeric" placeholder={input.id === 'floors' ? 'مثال: ۴' : 'مثال: ۰'} placeholderTextColor="#94a3b8" value={String(booking.serviceOptions[input.id] ?? '')} onChangeText={(value) => booking.setServiceOption(input.id, Number(value.replace(/[^0-9]/g, '')) || 0)} style={styles.input} />}
              {input.type === 'select' && <View style={styles.choiceRow}>{input.options?.map((option) => <Pressable key={option} onPress={() => booking.setServiceOption(input.id, option)} style={[styles.choice, booking.serviceOptions[input.id] === option && styles.choiceSelected]}><Text style={booking.serviceOptions[input.id] === option ? styles.choiceTextSelected : styles.choiceText}>{option}</Text></Pressable>)}</View>}
              {input.type === 'boolean' && <Pressable onPress={() => booking.setServiceOption(input.id, !booking.serviceOptions[input.id])} style={[styles.toggle, booking.serviceOptions[input.id] === true && styles.toggleSelected]}><Text style={booking.serviceOptions[input.id] === true ? styles.choiceTextSelected : styles.choiceText}>{booking.serviceOptions[input.id] === true ? 'بله' : 'خیر'}</Text></Pressable>}
            </View>
          ))}
        </View>}

        {booking.step === 3 && <View style={styles.section}>
          <Text style={styles.heading}>آدرس و مشخصات مشتری</Text>
          {savedAddresses.length > 0 ? (
            <View style={styles.savedAddressBlock}>
              <Text style={styles.label}>آدرس‌های ذخیره‌شده</Text>
              <ScrollView
                ref={savedAddressStripRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                onContentSizeChange={savedAddressStripScroll.onContentSizeChange}
                contentContainerStyle={[styles.horizontalList, styles.rtlStrip]}
              >
                {rtlOrder(savedAddresses).map((address) => {
                  const selected = selectedSavedAddressId === address.id;
                  return (
                    <Pressable
                      key={address.id}
                      onPress={() => applySavedAddressToWizard(address)}
                      style={[styles.savedAddressCard, selected && styles.savedAddressCardSelected]}
                    >
                      <Text style={[styles.savedAddressTitle, selected && styles.savedAddressTitleSelected]}>
                        {address.title}
                        {address.isDefault ? ' · پیش‌فرض' : ''}
                      </Text>
                      <Text style={styles.savedAddressMeta} numberOfLines={2}>
                        {address.district}، {address.fullAddress}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <Text style={styles.savedAddressEmpty}>
              هنوز آدرس ذخیره‌شده‌ای ندارید. می‌توانید از پروفایل اضافه کنید یا همین‌جا وارد کنید.
            </Text>
          )}
          <Pressable onPress={useGps} style={styles.gpsButton}><MapPin size={18} color={colors.teal} /><Text style={styles.gpsText}>{gpsLoading ? 'در حال دریافت موقعیت...' : 'استفاده از موقعیت فعلی'}</Text>{gpsLoading && <ActivityIndicator color={colors.teal} />}</Pressable>
          {gpsError ? <Text style={styles.errorMessage}>{gpsError}</Text> : null}
          <TextInput value={districtSearch} onChangeText={setDistrictSearch} onFocus={scrollFocusedFieldIntoView} placeholder="جستجوی محله" placeholderTextColor="#94a3b8" style={[styles.input, getInputStyle('district')]} /><ScrollView ref={districtStripRef} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} onContentSizeChange={districtStripScroll.onContentSizeChange} contentContainerStyle={[{ paddingHorizontal: 16 }, styles.rtlStrip]}>{rtlOrder(filteredDistricts).map((district) => <Pressable key={district} onPress={() => { setSelectedSavedAddressId(null); setDistrictSearch(district); booking.updateAddressField('district', district); }} style={[styles.chip, booking.addressDetails.district === district && styles.chipSelected]}><Text style={[styles.chipText, booking.addressDetails.district === district && styles.choiceTextSelected]}>{district}</Text></Pressable>)}</ScrollView>
          <Text style={styles.label}>نشانی دقیق</Text><TextInput multiline value={booking.addressDetails.fullAddress} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('fullAddress', value); }} onFocus={scrollFocusedFieldIntoView} placeholder="مثلاً خیابان آزادی، کوچه ۵" placeholderTextColor="#94a3b8" style={[styles.input, styles.textArea, getInputStyle('fullAddress')]} />
          <View style={styles.choiceRow}>
            <View style={styles.labeledInput}><Text style={styles.inputLabel}>پلاک</Text><TextInput {...RTL_SINGLE_LINE_INPUT} value={booking.addressDetails.plaque} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('plaque', value); }} onFocus={scrollFocusedFieldIntoView} placeholder="مثلاً ۱۲" placeholderTextColor="#94a3b8" keyboardType="number-pad" style={[styles.input, styles.smallInput, getInputStyle('plaque')]} /></View>
            <View style={styles.labeledInput}><Text style={styles.inputLabel}>واحد</Text><TextInput {...RTL_SINGLE_LINE_INPUT} value={booking.addressDetails.unit} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('unit', value); }} onFocus={scrollFocusedFieldIntoView} placeholder="مثلاً ۳" placeholderTextColor="#94a3b8" keyboardType="number-pad" style={[styles.input, styles.smallInput, getInputStyle('unit')]} /></View>
          </View>
          <Text style={styles.label}>نام مشتری</Text>
          <TextInput
            {...RTL_SINGLE_LINE_INPUT}
            value={booking.addressDetails.recipientName}
            onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('recipientName', value); }}
            onFocus={scrollFocusedFieldIntoView}
            placeholder="مثلاً علی رضایی"
            placeholderTextColor="#94a3b8"
            style={[styles.input, getInputStyle('recipientName')]}
          />
          <Text style={styles.label}>موبایل مشتری</Text>
          <TextInput
            {...RTL_SINGLE_LINE_INPUT}
            value={booking.addressDetails.contactPhone}
            onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('contactPhone', value); }}
            onFocus={scrollFocusedFieldIntoView}
            placeholder="مثلاً ۰۹۱۲۳۴۵۶۷۸۹"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            style={[styles.input, getInputStyle('contactPhone')]}
          />
          <Pressable onPress={saveCurrentAddressToProfile} style={styles.saveAddressButton}>
            <Text style={styles.saveAddressButtonText}>ذخیره این آدرس در پروفایل</Text>
          </Pressable>
          {addressSaveMessage ? <Text style={styles.saveAddressMessage}>{addressSaveMessage}</Text> : null}
        </View>}

        {booking.step === 4 && <View style={styles.section}>
          <Text style={styles.heading}>بازبینی و ثبت سفارش</Text>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>{booking.selectedService?.title}</Text>
            <Text style={styles.summaryLine}>زمان: {booking.selectedDate?.dayOfWeek} {toPersianDigits(booking.selectedDate?.dayOfMonth ?? '')} {booking.selectedTimeSlot?.label}</Text>
            <Text style={styles.summaryLine}>آدرس: {booking.addressDetails.district}، {booking.addressDetails.fullAddress}</Text>
            {booking.notes.trim() ? <Text style={styles.summaryLine}>یادداشت سفارش: {booking.notes.trim()}</Text> : null}
            {quoteView.status === 'loading' || quoteView.status === 'idle' ? <Text style={styles.summaryLine}>در حال دریافت قیمت از سرور...</Text> : null}
            {confirmable && quoteView.status === 'ready' ? (
              <>
                <View style={styles.invoiceLine}><Text style={styles.summaryLine}>مبلغ جزء</Text><Text style={styles.summaryLine}>{formatServerAmount(quoteView.quote.subtotal, quoteView.quote.currencyUnit)}</Text></View>
                {quoteView.quote.surcharges.map((line) => <View key={line.id} style={styles.invoiceLine}><Text style={styles.summaryLine}>{line.id}</Text><Text style={styles.summaryLine}>{formatServerAmount(line.amount, quoteView.quote.currencyUnit)}</Text></View>)}
                {quoteView.quote.discounts.map((line) => <View key={line.id} style={styles.discountLine}><Text style={styles.discountLabel}>{line.id}</Text><Text style={styles.discountAmount}>{`-${formatServerAmount(line.amount, quoteView.quote.currencyUnit)}`}</Text></View>)}
                <View style={styles.totalLine}><Text style={styles.totalLabel}>مبلغ قابل تأیید</Text><Text style={styles.total}>{formatServerAmount(quoteView.quote.total, quoteView.quote.currencyUnit)}</Text></View>
              </>
            ) : null}
            {quoteView.status === 'unavailable' || quoteView.status === 'network' ? <Text style={styles.errorMessage}>{quoteView.message}</Text> : null}
          </View>
          <Text style={styles.mockHint}>پرداخت بعد از انجام کار انجام می‌شود. الان فقط درخواست ثبت می‌شود.</Text>
          {submissionState === 'success' ? (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>سفارش ثبت شد</Text>
              {submissionMessage ? <Text style={styles.successMessage}>{submissionMessage}</Text> : null}
              <Text style={styles.successHint}>پرداخت بعد از انجام کار است. جزئیات را در فهرست سفارش‌ها ببینید.</Text>
              <Pressable
                onPress={() => {
                  const orderId = createdOrderId;
                  booking.resetBooking();
                  submitGuard.current = createSubmitGuard();
                  setSubmissionState('idle');
                  setSubmissionMessage(null);
                  setCreatedOrderId(null);
                  if (orderId) onOrderCreated?.(orderId);
                }}
                style={styles.successCta}
              >
                <Text style={styles.successCtaText}>مشاهده سفارش‌ها</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {submissionMessage ? <Text style={styles.errorMessage}>{submissionMessage}</Text> : null}
              <Pressable
                disabled={submissionState === 'submitting' || !confirmable}
                onPress={submitCurrentBooking}
                style={[styles.primary, (submissionState === 'submitting' || !confirmable) && styles.disabled]}
              >
                {submissionState === 'submitting' && <ActivityIndicator color={colors.white} />}
                <Text style={styles.primaryText}>{submissionState === 'submitting' ? 'در حال ثبت سفارش...' : 'تأیید و ثبت سفارش'}</Text>
              </Pressable>
            </>
          )}
        </View>}

        {booking.step === 3 && !canContinue && addressHint ? <Text style={[styles.muted, styles.addressHint]}>{addressHint}</Text> : null}
        {booking.step < 4 && <View style={styles.navigation}><Pressable onPress={booking.prevStep} disabled={booking.step === 1} accessibilityRole="button" accessibilityState={{ disabled: booking.step === 1 }} style={[styles.back, booking.step === 1 && styles.backDisabled]}><Text style={styles.backText}>مرحله قبل</Text></Pressable><Pressable onPress={booking.nextStep} disabled={!canContinue} style={[styles.primary, !canContinue && styles.disabled]}><Text style={styles.primaryText}>ادامه</Text></Pressable></View>}
        {booking.step === 4 && !isSubmitted && <View style={styles.navigation}><Pressable onPress={booking.prevStep} disabled={isSubmitting} accessibilityRole="button" accessibilityState={{ disabled: isSubmitting }} style={[styles.back, isSubmitting && styles.backDisabled]}><Text style={styles.backText}>مرحله قبل</Text></Pressable></View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.neutralBg, borderWidth: 1, borderColor: ui.divider },
  closeButtonPressed: { backgroundColor: ui.neutralBg },
  backDisabled: { opacity: 0.35 },
  successMessage: { color: '#166534', backgroundColor: '#dcfce7', padding: 12, borderRadius: 12, textAlign: 'right' },
  successCard: { backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: '#86efac', borderRadius: 16, padding: 16, gap: 10 },
  successTitle: { textAlign: 'right', color: '#166534', fontFamily: fontFamily.bold, fontSize: 18 },
  successOrderId: { textAlign: 'right', color: '#15803d', fontFamily: fontFamily.bold, fontSize: 13 },
  successHint: { fontFamily: fontFamily.regular, textAlign: 'right', color: '#166534', fontSize: 12, lineHeight: 19 },
  successCta: { minHeight: TOUCH_MIN, marginTop: 4, backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  successCtaText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 15 },
  earlyBirdHint: { fontFamily: fontFamily.regular, color: colors.tealDark, backgroundColor: colors.tealSoft, padding: 11, borderRadius: 12, textAlign: 'right', fontSize: 12, lineHeight: 19 },
  recurringHint: { fontFamily: fontFamily.regular, color: colors.tealDark, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1, padding: 11, borderRadius: 12, textAlign: 'right', fontSize: 12, lineHeight: 19 },
  discountLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.tealSoft, borderRadius: 10, padding: 10 },
  discountLabel: { color: colors.tealDark, fontSize: 12, fontFamily: fontFamily.bold, textAlign: 'right' },
  discountAmount: { color: colors.teal, fontSize: 13, fontFamily: fontFamily.bold },
  slotText: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.text, textAlign: 'right' },
  screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: 20, paddingTop: 16, paddingBottom: 160 }, brandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 24 }, brandIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal }, title: { textAlign: 'right', color: colors.text, fontSize: 22, fontFamily: fontFamily.bold }, subtitle: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.muted, fontSize: 13 }, stepRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 26 }, stepItem: { alignItems: 'center', gap: 5 }, stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: ui.neutralBg, alignItems: 'center', justifyContent: 'center' }, stepCircleActive: { backgroundColor: colors.teal }, stepNumber: { color: colors.muted, fontFamily: fontFamily.bold }, stepNumberActive: { color: colors.white }, stepLabel: { fontFamily: fontFamily.regular, color: colors.mutedLight, fontSize: 12 }, stepLabelActive: { color: colors.teal, fontFamily: fontFamily.bold }, section: { gap: 12 }, pricingButton: { alignItems: 'center', padding: 13, borderRadius: 13, backgroundColor: colors.tealSoft }, pricingButtonText: { color: colors.tealDark, fontFamily: fontFamily.bold }, optionBlock: { gap: 8 }, toggle: { justifyContent: 'center', minHeight: TOUCH_MIN, alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: ui.divider, backgroundColor: '#fff' }, toggleSelected: { backgroundColor: colors.teal, borderColor: colors.teal }, heading: { textAlign: 'right', color: colors.text, fontSize: 20, fontFamily: fontFamily.bold, marginBottom: 6 }, label: { textAlign: 'right', color: colors.text, fontSize: 13, fontFamily: fontFamily.bold, marginTop: 8 }, labeledInput: { fontFamily: fontFamily.regular, flex: 1, gap: 6 }, inputLabel: { textAlign: 'right', color: colors.text, fontSize: 12, fontFamily: fontFamily.bold }, card: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: 15 }, cardSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, cardTitle: { textAlign: 'right', color: colors.text, fontFamily: fontFamily.bold, fontSize: 14 }, muted: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12, textAlign: 'right' }, configuration: { fontFamily: fontFamily.regular, color: colors.tealDark, fontSize: 12, textAlign: 'right', marginTop: 3 }, price: { color: colors.teal, fontSize: 12, fontFamily: fontFamily.bold, textAlign: 'right' }, horizontalList: { gap: 8, paddingVertical: 4 }, rtlStrip: { flexGrow: 1, flexDirection: 'row', justifyContent: 'flex-end' }, dateCard: { width: 82, padding: 10, borderWidth: 1, borderColor: ui.divider, backgroundColor: '#fff', borderRadius: 14, alignItems: 'center', gap: 3 }, dateSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, dateDay: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12 }, dateNumber: { color: colors.text, fontFamily: fontFamily.bold }, slot: { minHeight: TOUCH_MIN, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderColor: ui.divider, borderRadius: 14, backgroundColor: '#fff' }, choiceRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }, choice: { justifyContent: 'center', minHeight: TOUCH_MIN, flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: ui.divider, alignItems: 'center', backgroundColor: '#fff' }, choiceSelected: { backgroundColor: colors.teal, borderColor: colors.teal }, choiceText: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12 }, choiceTextSelected: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 12 }, gpsButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, backgroundColor: colors.tealSoft }, gpsText: { color: colors.tealDark, fontFamily: fontFamily.bold }, inputError: { borderColor: '#ef4444', borderWidth: 1 }, inputSuccess: { borderColor: '#10b981', borderWidth: 1 }, input: { fontFamily: fontFamily.regular, backgroundColor: '#fff', borderWidth: 1, borderColor: ui.inputBorder, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, color: colors.text, textAlign: 'right' }, textArea: { minHeight: 80, textAlignVertical: 'top' }, smallInput: { fontFamily: fontFamily.regular, flex: 1 }, chip: { justifyContent: 'center', minHeight: TOUCH_MIN, paddingHorizontal: 13, paddingVertical: 8, marginRight: 6, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: ui.divider }, chipSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
  savedAddressBlock: { gap: 8 },
  savedAddressEmpty: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.muted, fontSize: 12, lineHeight: 19, backgroundColor: ui.neutralBg, padding: 12, borderRadius: 12 },
  savedAddressCard: { minHeight: TOUCH_MIN, width: 200, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: ui.divider, backgroundColor: '#fff', gap: 4 },
  savedAddressCardSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  savedAddressTitle: { textAlign: 'right', color: colors.text, fontFamily: fontFamily.bold, fontSize: 13 },
  savedAddressTitleSelected: { color: colors.tealDark },
  savedAddressMeta: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.muted, fontSize: 12, lineHeight: 16 },
  saveAddressButton: { minHeight: TOUCH_MIN, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: ui.tealBorder, backgroundColor: colors.tealSoft },
  saveAddressButtonText: { color: colors.tealDark, fontFamily: fontFamily.bold, fontSize: 13 },
  saveAddressMessage: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.tealDark, fontSize: 12 }, addressHint: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 16 }, chipText: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12 }, summary: { backgroundColor: '#fff', borderRadius: radius.card, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border }, summaryTitle: { textAlign: 'right', color: colors.text, fontFamily: fontFamily.bold, fontSize: 16 }, summaryLine: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.muted, fontSize: 13 }, invoiceLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: ui.divider, paddingTop: 10 }, totalLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: ui.inputBorder, paddingTop: 10 }, totalLabel: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 14 }, total: { textAlign: 'right', color: colors.teal, fontFamily: fontFamily.bold, fontSize: 22, marginTop: 8 }, paymentBox: { backgroundColor: ui.surfaceMuted, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: ui.divider }, paymentMethods: { gap: 8 }, paymentMethod: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: ui.divider, borderRadius: 13, padding: 13 }, paymentMethodSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, mockHint: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.tealDark, fontSize: 12, lineHeight: 18 }, pendingMessage: { color: colors.amberText, backgroundColor: colors.amberBg, padding: 12, borderRadius: 12, textAlign: 'right' }, errorMessage: { color: ui.dangerText, backgroundColor: ui.dangerBg, padding: 12, borderRadius: 12, textAlign: 'right' }, navigation: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }, primary: { minHeight: TOUCH_MIN + 4, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 13, backgroundColor: colors.teal }, primaryText: { color: colors.white, fontFamily: fontFamily.bold }, disabled: { opacity: 0.45 }, back: { justifyContent: 'center', minHeight: TOUCH_MIN, padding: 13 }, backText: { color: colors.muted, fontFamily: fontFamily.bold },
});
