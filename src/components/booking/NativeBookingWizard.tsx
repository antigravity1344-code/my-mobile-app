import { useEffect, useMemo, useRef, useState } from 'react';
import { STAIR_SERVICE, BASE_BUILDING } from '../../../server/pricing/staircase';
import { StaircaseForm } from './StaircaseForm';
import { SOFA_SERVICE_ID, sofaInputsFor } from '../../config/sofaPricingMode';
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
import { Check, MapPin, Sparkles, X } from 'lucide-react-native';
import { useBooking } from '../../context/BookingContext';
import { AddressCityPicker } from './AddressCityPicker';
import { addressCityFields } from '../../api/serviceAreas';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { getStaircaseRates, hourlyDurationChoices, isDetergentBookable, isServiceEnabled, serviceMinimumHours, servicePricingMode, useServiceAvailability } from '../../config/serviceAvailability';
import { quoteLineLabel } from '../../features/orders/services/quoteLineLabel';
import { buildJalaliDateOptions, toPersianDigits } from '../../utils/jalaliDateOptions';
import { getCurrentPosition } from '../../services/location';
import type { JalaliDateOption } from '../../types/booking';
import { CleaningService } from '../../types/service';
import { normalizePersianDigits, getAddressValidationErrors } from '../../utils/bookingValidation';
import { refreshServiceAvailability } from '../../config/serviceAvailabilityApi';
import { BOOKING_START_SLOTS } from './bookingStartSlots';
import { submittedTimeText } from '../../features/orders/services/orderPayload';
import { getBookingTimingErrors, type BookingTimingErrors } from './bookingTimingValidation';
import { useOrders, type OrderItem } from '../../features/orders';
import { getDirectRequestDraft, setDirectRequestDraft } from '../../features/orders/services/directRequestDraft';
import { useProfile, type SavedAddress } from '../../features/profile';
import { getWizardBackAction, getWizardCloseAction, type WizardBackAction } from './wizardBackNavigation';
import { createScrollToEndOnce, rtlOrder } from './rtlHorizontalList';
import { bookingReview, bookingSubmitEnabled, quoteForSubmittedAttempt } from './bookingRecoveryReview';
import { createSubmitGuard } from './submitGuard';
import { computeRevealDelta } from './keyboardReveal';
import { addressFieldTone, firstAddressHint } from './addressFieldTone';
import { messageForGpsResult } from './gpsFeedback';
import { RTL_SINGLE_LINE_INPUT } from '../native/rtlInput';
import {
  attemptAfterSubmit,
  bookingSelectionFingerprint,
  resolveBookingSubmission,
  type StoredBookingAttempt,
} from '../../features/orders/services/clientRequestId';
import {
  QUOTE_STALE_MESSAGE,
  buildQuoteRequest,
  tierLockApplies,
  type CustomerWorkerTier,
  confirmableServerQuote,
  formatServerAmount,
  requestServerQuote,
  isQuoteRefreshCode,
  serverQuoteAsFinalPrice,
} from '../../features/orders/services/serverQuote';
import { useCustomerPriceQuote } from '../../features/orders/services/useCustomerPriceQuote';
import { getOfferBookingDraft, offerDurationChoices } from '../../features/offers/offerBookingDraft';
import { colors, fontFamily, radius, shadowSm, ui, TOUCH_MIN } from '../../theme';

const makeDates = (): JalaliDateOption[] => buildJalaliDateOptions();

function ServiceStartingPrice({ service }: { service: CleaningService }) {
  const hourly = service.pricingType === 'hourly';
  const quantity = hourly ? serviceMinimumHours(service.id) : 1;
  const stairs = service.id === STAIR_SERVICE;
  const stairRates = stairs ? getStaircaseRates() : null;
  const sofa = service.id === SOFA_SERVICE_ID;
  const mode = sofa ? servicePricingMode(service.id) : null;
  const tiered = tierLockApplies(service.id, false);
  const [label, setLabel] = useState('در حال دریافت قیمت…');

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (stairs && !stairRates) {
        setLabel('در انتظار انتشار تعرفهٔ محاسباتی');
        return;
      }
      if (sofa && !mode) {
        setLabel('قیمت فعلاً در دسترس نیست');
        return;
      }
      setLabel('در حال دریافت قیمت…');
      const options: Record<string, string | number>[] = stairs && stairRates ? [{ ...BASE_BUILDING, floors: 1 }] : mode === 'mattress_seat'
        ? [{ seatSize: '7' }, { seatSize: '9' }] : [{}];
      const results = await Promise.all(options.map(option => requestServerQuote({
        serviceId: service.id, quantity, options: option, ...(tiered ? { workerTier: 'gray' } : {}),
      })));
      if (!active) return;
      const quotes = results.flatMap(result => result.status === 'ready' ? [result.quote] : []);
      const expiry = Math.min(...quotes.map(quote => Date.parse(quote.expiresAt)));
      if (quotes.length !== results.length || !Number.isFinite(expiry) || expiry <= Date.now()) {
        setLabel('قیمت فعلاً در دسترس نیست');
        return;
      }
      const lowest = quotes.reduce((a, b) => a.total <= b.total ? a : b);
      const basis = hourly ? ' برای ' + toPersianDigits(quantity) + ' ساعت'
        : service.pricingType === 'per_sqm' ? ' برای ۱ متر مربع' : sofa ? ' برای ۱ واحد' : '';
      setLabel('از ' + formatServerAmount(lowest.total, lowest.currencyUnit) + basis);
      timer = setTimeout(() => { void refresh(); }, Math.max(1, expiry - Date.now()));
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [service.id, service.pricingType, hourly, quantity, sofa, mode, tiered, stairs, stairRates]);

  return <Text style={styles.price}>{label}</Text>;
}

function FieldFeedback({ message }: { message?: string | null }) {
  return message ? <Text style={styles.fieldFeedback} accessibilityLiveRegion="polite">{message}</Text> : null;
}

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
  useServiceAvailability();
  const booking = useBooking();
  useEffect(() => {
    if (booking.step === 2) void refreshServiceAvailability();
  }, [booking.step]);
  const canBookDetergent = isDetergentBookable(booking.selectedService?.id);
  const offerDraft = getOfferBookingDraft();
  const offerMode = !!offerDraft && booking.serviceOptions.offerId === offerDraft.offerId;
  const [workerTier, setWorkerTier] = useState<CustomerWorkerTier>('gray');
  const directDraft = !offerMode ? getDirectRequestDraft() : null;
  const tierLock = tierLockApplies(booking.selectedService?.id, offerMode) && !directDraft;
  const { addNewOrder } = useOrders();
  const dates = useMemo(makeDates, []);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const submitGuard = useRef(createSubmitGuard());
  // کلید فقط تا وقتی محتوای سفارش و قیمت عوض نشده بماند تا خطای نامشخص شبکه سفارش دوم نسازد.
  const clientRequestKey = useRef<StoredBookingAttempt | null>(null);
  const quoteSelection = booking.selectedService
    ? {
      serviceId: booking.selectedService.id,
      pricingType: booking.selectedService.pricingType,
      durationHours: booking.durationHours,
      serviceOptions: booking.selectedService.id !== STAIR_SERVICE && booking.serviceOptions.detergent && !canBookDetergent
        ? { ...booking.serviceOptions, detergent: false } : booking.serviceOptions,
      ...(tierLock ? { workerTier } : {}),
      ...(directDraft ? { directRequestWorkerId: directDraft.workerId } : {}),
    }
    : null;
  const { view: quoteView, confirmable, refreshQuote } = useCustomerPriceQuote(quoteSelection);
  const scrollRef = useRef<ScrollView>(null);
  const dateStripRef = useRef<ScrollView>(null);
  const savedAddressStripRef = useRef<ScrollView>(null);
  const [dateStripScroll] = useState(() => createScrollToEndOnce(() => dateStripRef.current));
  const [savedAddressStripScroll] = useState(() => createScrollToEndOnce(() => savedAddressStripRef.current));
  // Strips remount when the step changes; let each open at its right edge (first item) again.
  useEffect(() => {
    dateStripScroll.reset();
    savedAddressStripScroll.reset();
  }, [booking.step, dateStripScroll, savedAddressStripScroll]);
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
  const { profile, addSavedAddress } = useProfile();
  const savedAddresses = profile.savedAddresses ?? [];
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);
  const defaultSavedAddressAppliedRef = useRef(false);
  const profileContactPrefillRef = useRef(false);

  const applySavedAddressToWizard = (address: SavedAddress) => {
    booking.setAddressDetails((prev) => ({
      ...prev,
      cityId: address.cityId,
      city: address.city,
      district: address.district,
      fullAddress: address.fullAddress,
      plaque: address.plaque,
      unit: address.unit || '',
      recipientName: address.recipientName,
      contactPhone: address.contactPhone,
      isSaved: true,
    }));
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
      ...addressCityFields(details),
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

  const selectService = (service: CleaningService, options: Record<string, string | number | boolean> = {}) => {
    if (booking.selectedService?.id !== service.id) setWorkerTier('gray');
    booking.setSelectedService(service);
    Object.entries(options).forEach(([id, value]) => booking.setServiceOption(id, value));
    if (typeof options.durationHours === 'number') booking.setDurationHours(options.durationHours);
    else if (service.pricingType === 'hourly') booking.setDurationHours(serviceMinimumHours(service.id));
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
  const builtSelection = quoteSelection ? buildQuoteRequest(quoteSelection) : null;
  const selectionFingerprint = quoteSelection && booking.selectedDate && booking.selectedTimeSlot
    ? bookingSelectionFingerprint({
      serviceId: quoteSelection.serviceId,
      options: builtSelection?.ok ? builtSelection.body.options : {},
      quantity: builtSelection?.ok ? builtSelection.body.quantity : undefined,
      durationHours: booking.durationHours,
      date: booking.selectedDate.dateString,
      time: booking.selectedTimeSlot.id,
      address: {
        ...addressCityFields(booking.addressDetails),
        district: booking.addressDetails.district,
        fullAddress: booking.addressDetails.fullAddress,
        plaque: normalizePersianDigits(booking.addressDetails.plaque),
        unit: normalizePersianDigits(booking.addressDetails.unit),
        floor: booking.addressDetails.floor ?? '',
        recipientName: booking.addressDetails.recipientName,
        contactPhone: normalizePersianDigits(booking.addressDetails.contactPhone),
        addressNotes: booking.addressDetails.addressNotes ?? '',
      },
      genderPreference: booking.genderPreference,
      recurringFrequency: booking.recurringFrequency,
      notes: booking.notes,
      ...(tierLock ? { workerTier } : {}),
      ...(directDraft ? { directRequestWorkerId: directDraft.workerId } : {}),
    })
    : '';
  const recovering = Boolean(selectionFingerprint && clientRequestKey.current?.selectionFingerprint === selectionFingerprint);
  const freshQuote = quoteView.status === 'ready' ? quoteView.quote : null;
  const review = bookingReview({ recovering, held: clientRequestKey.current, confirmable, fresh: freshQuote });
  const confirmEnabled = bookingSubmitEnabled({
    recovering,
    confirmable,
    submitting: submissionState === 'submitting',
  });
  const submitCurrentBooking = async () => {
    // دو لمس سریع قبل از رندر بعدی هر دو از disabled رد می‌شوند؛ این قفل همزمان فقط یکی را می‌فرستد.
    if (!submitGuard.current.tryBegin()) return;
    if (!booking.selectedService || !booking.selectedDate || !booking.selectedTimeSlot || !quoteSelection) {
      submitGuard.current.finish(false);
      return;
    }
    if (!selectionFingerprint) {
      submitGuard.current.finish(false);
      return;
    }
    if (!recovering && !confirmableServerQuote(quoteView, quoteSelection, Date.now())) {
      submitGuard.current.finish(false);
      refreshQuote();
      setSubmissionState('error');
      setSubmissionMessage(QUOTE_STALE_MESSAGE);
      return;
    }
    setSubmissionState('submitting');
    setSubmissionMessage(null);
    const freshRequest = quoteView.status === 'ready' ? quoteView.request : null;
    const sent = resolveBookingSubmission(clientRequestKey.current, selectionFingerprint, {
      quoteToken: freshQuote?.quoteToken ?? '',
      confirmedTotal: freshQuote?.total ?? 0,
      currencyUnit: freshQuote?.currencyUnit ?? '',
      quantity: freshRequest?.quantity,
      serviceId: freshRequest?.serviceId ?? quoteSelection.serviceId,
      options: freshRequest?.options ?? (builtSelection?.ok ? builtSelection.body.options : {}),
    });
    clientRequestKey.current = sent;

    const now = new Date().toISOString();
    const addressDetails = {
      ...booking.addressDetails,
      plaque: normalizePersianDigits(booking.addressDetails.plaque),
      unit: normalizePersianDigits(booking.addressDetails.unit),
      contactPhone: normalizePersianDigits(booking.addressDetails.contactPhone),
    };
    const heldQuote = quoteForSubmittedAttempt(sent, freshQuote, recovering);
    const newOrder: OrderItem = {
      id: `TEMP-${Date.now()}`,
      orderNumber: `TEMP-${Date.now()}`,
      serviceId: sent.serviceId,
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
      serviceOptions: sent.options,
      recurringFrequency: booking.recurringFrequency,
      customerTier: booking.customerTier,
      address: addressDetails,
      pricing: serverQuoteAsFinalPrice(heldQuote),
      quoteToken: sent.quoteToken,
      confirmedTotal: sent.confirmedTotal,
      quoteCurrencyUnit: sent.currencyUnit,
      quoteQuantity: sent.quantity,
      ...(tierLock ? { workerTier } : {}),
      ...(directDraft ? { directRequestWorkerId: directDraft.workerId } : {}),
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
      clientRequestId: sent.id,
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
    clientRequestKey.current = attemptAfterSubmit(sent, result);
    if (result.success) {
      const orderId = result.order?.id || result.order?.orderNumber || newOrder.id;
      setCreatedOrderId(orderId);
      setSubmissionState('success');
      if (directDraft) setDirectRequestDraft(null);
      setSubmissionMessage(offerMode
        ? `درخواست «${newOrder.serviceTitle}» برای ${offerDraft?.workerName || 'متخصص'} ثبت و رزرو شد.`
        : directDraft
          ? `درخواست طلایی «${newOrder.serviceTitle}» فقط برای ${directDraft.workerName || 'این متخصص'} ثبت شد.`
          : `درخواست «${newOrder.serviceTitle}» ثبت شد و در انتظار متخصص است.`);
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
    setDirectRequestDraft(null);
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
        'از ثبت سفارش خارج می‌شوید؟',
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

  const timingErrors = getBookingTimingErrors({
    serviceId: booking.selectedService?.id,
    pricingType: booking.selectedService?.pricingType,
    hasDate: Boolean(booking.selectedDate),
    hasTime: Boolean(booking.selectedTimeSlot),
    durationHours: booking.durationHours,
    minimumHours: offerMode && offerDraft ? offerDraft.minHours : serviceMinimumHours(booking.selectedService?.id ?? ''),
    options: booking.serviceOptions,
    sofaMode: servicePricingMode(SOFA_SERVICE_ID),
  });
  const timingHint = Object.values(timingErrors)[0];
  const canContinue = booking.step === 1 ? Boolean(booking.selectedService)
    : booking.step === 2 ? !timingHint : booking.step === 3 ? !addressHint : true;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, booking.step === 1 && styles.servicesContent]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}><Sparkles size={22} color={colors.white} /></View>
          <View><Text style={styles.title}>پاکشو</Text><Text style={styles.subtitle}>رزرو خدمات</Text></View>
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
          <Text style={styles.heading}>خدمت را انتخاب کنید</Text>
          {!booking.selectedService && <FieldFeedback message="برای ادامه یکی از خدمات را انتخاب کنید." />}
          <View style={styles.serviceGrid}>
            {SERVICES_CATALOG.filter((service) => service.isVisible && isServiceEnabled(service.id)).map((service) => (
              <Pressable
                key={service.id}
                accessibilityRole="button"
                accessibilityState={{ selected: booking.selectedService?.id === service.id }}
                onPress={() => selectService(service)}
                style={[styles.card, booking.selectedService?.id === service.id && styles.cardSelected]}
              >
                <Text style={styles.cardTitle}>{service.title}</Text>
                <ServiceStartingPrice service={service} />
              </Pressable>
            ))}
          </View>
        </View>}

        {booking.step === 2 && <View style={styles.section}>
          <Text style={styles.heading}>تاریخ و ساعت</Text>
          <Text style={styles.earlyBirdHint}>مبلغ نهایی را سرور از تعرفه شرکت محاسبه می‌کند و قبل از ثبت نشان می‌دهد.</Text>
          {offerMode && offerDraft && <View style={styles.optionBlock}>
            <Text style={styles.label}>ساعت پیشنهادی {offerDraft.workerName}</Text>
            <Text style={styles.muted}>{booking.selectedDate?.dayOfWeek} {toPersianDigits(booking.selectedDate?.dayOfMonth ?? '')} {booking.selectedDate?.monthName} · از ساعت {toPersianDigits(booking.selectedTimeSlot?.startTime ?? '')}</Text>
            <Text style={styles.muted}>زمان و تکرار سفارش در این حالت ثابت است. برای زمان دیگر، سفارش عادی ثبت کنید.</Text>
          </View>}
          {!offerMode && <>
          <Text style={styles.label}>تاریخ اعزام</Text>
          <FieldFeedback message={timingErrors.date} />
          <ScrollView ref={dateStripRef} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={dateStripScroll.onContentSizeChange} contentContainerStyle={[styles.horizontalList, styles.rtlStrip]}>
            {rtlOrder(dates).map((date) => <Pressable key={date.dateString} onPress={() => { booking.setSelectedDate(date); booking.setSelectedTimeSlot(null); }} style={[styles.dateCard, booking.selectedDate?.dateString === date.dateString && styles.dateSelected]}><Text style={styles.dateDay}>{date.dayOfWeek}</Text><Text style={styles.dateNumber}>{toPersianDigits(date.dayOfMonth)}</Text><Text style={styles.muted}>{date.monthName}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.label}>ساعت شروع کار</Text>
          <FieldFeedback message={timingErrors.time} />
          <View style={styles.slotGrid}>
            {BOOKING_START_SLOTS.map(slot => {
              const selected = booking.selectedTimeSlot?.id === slot.id;
              const disabled = !booking.selectedDate;
              return <Pressable
                key={slot.id}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => booking.setSelectedTimeSlot(slot)}
                style={[styles.slot, selected && styles.cardSelected, disabled && styles.disabled]}
              >
                <Text style={styles.slotText}>{toPersianDigits(slot.startTime)}</Text>
              </Pressable>;
            })}
          </View>
          </>}
          {booking.selectedService?.pricingType === 'hourly' && <><Text style={styles.label}>مدت زمان</Text><View style={styles.durationGrid}>{(offerMode && offerDraft ? offerDurationChoices(offerDraft.startAt, offerDraft.endAt, offerDraft.minHours) : hourlyDurationChoices(booking.selectedService.id)).map((hours) => <Pressable key={hours} onPress={() => booking.setDurationHours(hours)} style={[styles.durationChoice, booking.durationHours === hours && styles.choiceSelected]}><Text style={booking.durationHours === hours ? styles.choiceTextSelected : styles.choiceText}>{toPersianDigits(hours)} ساعت</Text></Pressable>)}</View></>}
          <FieldFeedback message={timingErrors.duration} />
          {directDraft && <Text style={styles.muted}>درخواست طلایی برای {directDraft.workerName || 'این متخصص'}. قیمتش جدا از سطح متخصص است و فقط همان متخصص آن را می‌بیند.</Text>}
          {tierLock && <View style={styles.optionBlock}>
            <Text style={styles.label}>متخصص طلایی (اختیاری)</Text>
            <Text style={[styles.muted, styles.centeredText]}>برای کارهای حساس و دقیق می‌توانید متخصص طلایی انتخاب کنید. تعرفهٔ طلایی بالاتر است.</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: workerTier === 'gold' }}
              onPress={() => setWorkerTier(workerTier === 'gold' ? 'gray' : 'gold')}
              style={[styles.slot, styles.goldenOption, workerTier === 'gold' && styles.cardSelected]}
            >
              <Text style={styles.slotText}>{workerTier === 'gold' ? '☑ ' : '☐ '}انتخاب متخصص طلایی</Text>
            </Pressable>
            <Text style={[styles.muted, styles.centeredText]} accessibilityLiveRegion="polite">
              {workerTier === 'gold' ? 'تعرفهٔ طلایی' : 'تعرفهٔ عادی'}
              {quoteView.status === 'ready' ? ' · ' + formatServerAmount(quoteView.quote.total, quoteView.quote.currencyUnit) : ''}
            </Text>
          </View>}
          {!offerMode && <>
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
          </>}
          <Text style={styles.label}>یادداشت سفارش (اختیاری)</Text>
          <TextInput
            multiline
            value={booking.notes}
            onChangeText={booking.setNotes}
            placeholder="مثال: لطفاً قبل از ورود تماس بگیرید"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.textArea]}
          />
          {booking.selectedService?.id === STAIR_SERVICE && <StaircaseForm confirmedTotal={quoteView.status === 'ready' ? quoteView.quote.total : undefined} rates={getStaircaseRates()} values={booking.serviceOptions} change={booking.setServiceOption} errors={timingErrors} />}
          {(booking.selectedService?.id === STAIR_SERVICE ? [] : booking.selectedService?.id === SOFA_SERVICE_ID
            ? sofaInputsFor(servicePricingMode(SOFA_SERVICE_ID))
            : booking.selectedService?.configuration.inputs
          )?.map((input) => (
            <View key={input.id} style={styles.optionBlock}>
              <Text style={styles.label}>{input.label}</Text>
              {input.type === 'number' && <TextInput keyboardType="numeric" placeholder={input.id === 'floors' ? 'مثال: ۴' : 'مثال: ۰'} placeholderTextColor="#94a3b8" value={String(booking.serviceOptions[input.id] ?? '')} onChangeText={(value) => { const digits = normalizePersianDigits(value).replace(/\D/g, ''); booking.setServiceOption(input.id, digits ? Number(digits) : ''); }} style={styles.input} />}
              {input.type === 'select' && <View style={styles.choiceRow}>{input.options?.map((option) => <Pressable key={option} onPress={() => booking.setServiceOption(input.id, option)} style={[styles.choice, booking.serviceOptions[input.id] === option && styles.choiceSelected]}><Text style={booking.serviceOptions[input.id] === option ? styles.choiceTextSelected : styles.choiceText}>{option}</Text></Pressable>)}</View>}
              {input.type === 'boolean' && (
                <View style={styles.choiceRow} accessibilityRole="radiogroup" accessibilityLabel={input.label}>
                  {[true, false].map((value) => {
                    const label = value ? "بله" : "خیر";
                    const unavailable = input.id === "detergent" && !canBookDetergent;
                    const disabled = unavailable && value;
                    const selected = (!unavailable && booking.serviceOptions[input.id] === true) === value;
                    return (
                      <Pressable
                        key={label}
                        accessibilityRole="radio"
                        accessibilityLabel={label}
                        accessibilityState={{ checked: selected, disabled }}
                        disabled={disabled}
                        onPress={() => booking.setServiceOption(input.id, value)}
                        style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}
                      >
                        <Text style={selected ? styles.choiceTextSelected : styles.choiceText}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {input.id === "detergent" && !canBookDetergent ? (
                <>
                  <Text style={styles.muted}>پک مواد شوینده فعلاً برای این خدمت قابل سفارش نیست.</Text>
                  <Pressable accessibilityRole="button" style={styles.back} onPress={() => void refreshServiceAvailability()}>
                    <Text style={styles.backText}>بازخوانی وضعیت پک</Text>
                  </Pressable>
                </>
              ) : null}
              <FieldFeedback message={timingErrors[input.id as keyof BookingTimingErrors]} />
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
                        {address.city ? `${address.city}، ` : ''}{address.district}، {address.fullAddress}
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
          <AddressCityPicker value={booking.addressDetails} onSelectCity={city => {
            setSelectedSavedAddressId(null);
            booking.setAddressDetails(prev => ({ ...prev, cityId: city.id, city: city.name,
              ...(prev.cityId !== city.id ? { district: '', coordinates: { latitude: 0, longitude: 0 } } : {}) }));
          }} onSelectDistrict={district => { setSelectedSavedAddressId(null); booking.updateAddressField('district', district); }} />
          <TextInput value={booking.addressDetails.district} onChangeText={district => { setSelectedSavedAddressId(null); booking.updateAddressField('district', district); }} onFocus={scrollFocusedFieldIntoView} placeholder="نام محله" placeholderTextColor="#94a3b8" style={[styles.input, getInputStyle('district')]} />
          <FieldFeedback message={addressErrors.district && 'نام محله را وارد یا انتخاب کنید.'} />
          <Text style={styles.label}>نشانی دقیق</Text><TextInput multiline value={booking.addressDetails.fullAddress} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('fullAddress', value); }} onFocus={scrollFocusedFieldIntoView} placeholder="مثلاً خیابان آزادی، کوچه ۵" placeholderTextColor="#94a3b8" style={[styles.input, styles.textArea, getInputStyle('fullAddress')]} />
          <FieldFeedback message={addressErrors.fullAddress} />
          <View style={styles.addressNumbers}>
            <View style={styles.addressNumberField}><Text style={[styles.inputLabel, styles.centeredText]}>پلاک</Text><TextInput textAlign="center" value={booking.addressDetails.plaque} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('plaque', value); }} onFocus={scrollFocusedFieldIntoView} placeholder="مثلاً ۱۲" placeholderTextColor="#94a3b8" keyboardType="number-pad" style={[styles.input, styles.addressNumberInput, getInputStyle('plaque'), shadowSm]} /><FieldFeedback message={addressErrors.plaque} /></View>
            <View style={styles.addressNumberField}><Text style={[styles.inputLabel, styles.centeredText]}>واحد (اختیاری)</Text><TextInput textAlign="center" value={booking.addressDetails.unit} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('unit', value); }} onFocus={scrollFocusedFieldIntoView} placeholder="مثلاً ۳" placeholderTextColor="#94a3b8" keyboardType="number-pad" style={[styles.input, styles.addressNumberInput, getInputStyle('unit'), shadowSm]} /></View>
          </View>
          <Text style={[styles.label, styles.centeredText]}>نام مشتری</Text>
          <TextInput
            {...RTL_SINGLE_LINE_INPUT}
            value={booking.addressDetails.recipientName}
            onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('recipientName', value); }}
            onFocus={scrollFocusedFieldIntoView}
            placeholder="مثلاً علی رضایی"
            placeholderTextColor="#94a3b8"
            style={[styles.input, getInputStyle('recipientName'), shadowSm, styles.centeredText]}
          />
          <FieldFeedback message={addressErrors.recipientName} />
          <Text style={[styles.label, styles.centeredText]}>موبایل مشتری</Text>
          <TextInput
            {...RTL_SINGLE_LINE_INPUT}
            value={booking.addressDetails.contactPhone}
            onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('contactPhone', value); }}
            onFocus={scrollFocusedFieldIntoView}
            placeholder="مثلاً ۰۹۱۲۳۴۵۶۷۸۹"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            style={[styles.input, getInputStyle('contactPhone'), shadowSm, styles.centeredText]}
          />
          <FieldFeedback message={addressErrors.contactPhone} />
          <Pressable onPress={saveCurrentAddressToProfile} style={styles.saveAddressButton}>
            <Text style={styles.saveAddressButtonText}>ذخیره این آدرس در پروفایل</Text>
          </Pressable>
          {addressSaveMessage ? <Text style={styles.saveAddressMessage}>{addressSaveMessage}</Text> : null}
        </View>}

        {booking.step === 4 && <View style={styles.section}>
          <Text style={[styles.heading, styles.centeredText]}>بازبینی و ثبت سفارش</Text>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>{booking.selectedService?.title}</Text>
            {tierLock && workerTier === 'gold' && <Text style={[styles.summaryLine, styles.centeredText]}>متخصص طلایی · تعرفهٔ طلایی</Text>}
            <Text style={styles.summaryLine}>روز رزرو: {booking.selectedDate?.dayOfWeek} {toPersianDigits(booking.selectedDate?.dayOfMonth ?? '')} {booking.selectedDate?.monthName}</Text>
            <Text style={styles.summaryLine}>زمان مراجعه: {submittedTimeText(booking.selectedTimeSlot)}</Text>
            <Text style={styles.summaryLine}>آدرس: {booking.addressDetails.city ? `${booking.addressDetails.city}، ` : ''}{booking.addressDetails.district}، {booking.addressDetails.fullAddress}</Text>
            {booking.notes.trim() ? <Text style={styles.summaryLine}>یادداشت سفارش: {booking.notes.trim()}</Text> : null}
            {review.kind === 'none' && (quoteView.status === 'loading' || quoteView.status === 'idle') ? <Text style={styles.summaryLine}>در حال دریافت قیمت از سرور...</Text> : null}
            {review.kind === 'recovery' ? (
              <View style={styles.totalLine}><Text style={styles.totalLabel}>{review.title}</Text><Text style={styles.total}>{formatServerAmount(review.amount, review.currencyUnit)}</Text></View>
            ) : null}
            {review.kind === 'fresh' ? (
              <>
                <View style={styles.invoiceLine}><Text style={styles.summaryLine}>مبلغ جزء</Text><Text style={styles.summaryLine}>{formatServerAmount(review.subtotal, review.currencyUnit)}</Text></View>
                {review.surcharges.map((line) => <View key={line.id} style={styles.invoiceLine}><Text style={styles.summaryLine}>{quoteLineLabel(line.id, 'surcharge', booking.selectedService?.id)}</Text><Text style={styles.summaryLine}>{formatServerAmount(line.amount, review.currencyUnit)}</Text></View>)}
                {review.discounts.map((line) => <View key={line.id} style={styles.discountLine}><Text style={styles.discountLabel}>{quoteLineLabel(line.id, 'discount')}</Text><Text style={styles.discountAmount}>{`-${formatServerAmount(line.amount, review.currencyUnit)}`}</Text></View>)}
                {freshQuote?.extraHourlyRate ? <Text style={styles.summaryLine}>هر ساعت اضافه با تأیید شما: {formatServerAmount(freshQuote.extraHourlyRate, freshQuote.currencyUnit)}</Text> : null}
                <View style={styles.totalLine}><Text style={styles.totalLabel}>مبلغ قابل تأیید</Text><Text style={styles.total}>{formatServerAmount(review.total, review.currencyUnit)}</Text></View>
              </>
            ) : null}
            {review.kind !== 'recovery' && (quoteView.status === 'unavailable' || quoteView.status === 'network') ? (
              <>
                <Text accessibilityLiveRegion="polite" style={styles.errorMessage}>{quoteView.message}</Text>
                {builtSelection?.ok && <Pressable accessibilityRole="button" onPress={refreshQuote} style={styles.back}>
                  <Text style={styles.gpsText}>دریافت دوبارهٔ قیمت</Text>
                </Pressable>}
              </>
            ) : null}
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
                disabled={!confirmEnabled}
                onPress={submitCurrentBooking}
                accessibilityRole="button"
                accessibilityState={{ disabled: !confirmEnabled, busy: isSubmitting }}
                style={[styles.primary, styles.confirmButton, !confirmEnabled && styles.disabled]}
              >
                {submissionState === 'submitting' && <ActivityIndicator color={colors.white} />}
                <Text style={styles.primaryText}>{submissionState === 'submitting' ? 'در حال ثبت سفارش...' : 'تأیید و ثبت سفارش'}</Text>
              </Pressable>
            </>
          )}
        </View>}

        {booking.step === 2 && timingHint ? <FieldFeedback message={timingHint} /> : null}
        {booking.step === 3 && !canContinue && addressHint ? <FieldFeedback message={addressHint} /> : null}
        {booking.step < 4 && <View style={styles.navigation}><Pressable onPress={booking.prevStep} disabled={booking.step === 1} accessibilityRole="button" accessibilityState={{ disabled: booking.step === 1 }} style={[styles.back, booking.step === 1 && styles.backDisabled]}><Text style={styles.backText}>مرحله قبل</Text></Pressable><Pressable onPress={booking.nextStep} accessibilityRole="button" accessibilityState={{ disabled: !canContinue }} disabled={!canContinue} style={[styles.primary, !canContinue && styles.disabled]}><Text style={styles.primaryText}>ادامه</Text></Pressable></View>}
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
  durationGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  durationChoice: {
    width: '31%', minHeight: TOUCH_MIN, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1,
    borderColor: ui.divider, backgroundColor: '#fff',
  },
  slotGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  slotText: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.text, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: 20, paddingTop: 16, paddingBottom: 160 },
  servicesContent: { paddingBottom: 24 },
  centeredText: { textAlign: 'center' },
  goldenOption: { alignSelf: 'center', width: '76%', maxWidth: 300 },
  confirmButton: { alignSelf: 'center', minHeight: TOUCH_MIN, maxWidth: '90%', paddingHorizontal: 20, paddingVertical: 9 },
  addressNumbers: { flexDirection: 'row-reverse', justifyContent: 'center', gap: 12 },
  addressNumberField: { width: '30%', maxWidth: 104, minWidth: 72, gap: 5 },
  addressNumberInput: { minHeight: TOUCH_MIN, paddingVertical: 5, paddingHorizontal: 0, textAlign: 'center', textAlignVertical: 'center' },
  brandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 24 }, brandIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal }, title: { textAlign: 'right', color: colors.text, fontSize: 22, fontFamily: fontFamily.bold }, subtitle: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.muted, fontSize: 13 }, stepRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 26 }, stepItem: { alignItems: 'center', gap: 5 }, stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: ui.neutralBg, alignItems: 'center', justifyContent: 'center' }, stepCircleActive: { backgroundColor: colors.teal }, stepNumber: { color: colors.muted, fontFamily: fontFamily.bold }, stepNumberActive: { color: colors.white }, stepLabel: { fontFamily: fontFamily.regular, color: colors.mutedLight, fontSize: 12 }, stepLabelActive: { color: colors.teal, fontFamily: fontFamily.bold }, section: { gap: 12 }, optionBlock: { gap: 8 }, heading: { textAlign: 'right', color: colors.text, fontSize: 20, fontFamily: fontFamily.bold, marginBottom: 6 }, label: { textAlign: 'center', color: colors.text, fontSize: 13, fontFamily: fontFamily.bold, marginTop: 8 }, inputLabel: { textAlign: 'center', color: colors.text, fontSize: 12, fontFamily: fontFamily.bold }, serviceGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  card: {
    width: '48.5%', minHeight: 64, justifyContent: 'center', gap: 3,
    backgroundColor: '#fff', borderColor: colors.border, borderWidth: 1, borderRadius: radius.card,
    paddingHorizontal: 10, paddingVertical: 8,
    ...shadowSm,
  }, cardSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, flex: { flex: 1 }, cardTitle: { textAlign: 'right', color: colors.text, fontFamily: fontFamily.bold, fontSize: 14 }, muted: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12, textAlign: 'right' }, price: { color: colors.teal, fontSize: 12, fontFamily: fontFamily.bold, textAlign: 'right' }, horizontalList: { gap: 8, paddingVertical: 4 }, rtlStrip: { flexGrow: 1, flexDirection: 'row', justifyContent: 'flex-end' }, dateCard: { width: 82, padding: 10, borderWidth: 1, borderColor: ui.divider, backgroundColor: '#fff', borderRadius: 14, alignItems: 'center', gap: 3 }, dateSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, dateDay: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12 }, dateNumber: { color: colors.text, fontFamily: fontFamily.bold }, slot: { width: '48.5%', minHeight: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 8, borderWidth: 1, borderColor: ui.divider, borderRadius: 14, backgroundColor: '#fff' }, choiceRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }, choice: { justifyContent: 'center', minHeight: TOUCH_MIN, flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: ui.divider, alignItems: 'center', backgroundColor: '#fff' }, choiceSelected: { backgroundColor: colors.teal, borderColor: colors.teal }, choiceText: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12 }, choiceTextSelected: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 12 }, gpsButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, backgroundColor: colors.tealSoft }, gpsText: { color: colors.tealDark, fontFamily: fontFamily.bold }, inputError: { borderColor: '#ef4444', borderWidth: 1 }, inputSuccess: { borderColor: '#10b981', borderWidth: 1 }, input: { fontFamily: fontFamily.regular, backgroundColor: '#fff', borderWidth: 1, borderColor: ui.inputBorder, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, color: colors.text, textAlign: 'right' }, textArea: { minHeight: 80, textAlignVertical: 'top' }, chip: { justifyContent: 'center', minHeight: TOUCH_MIN, paddingHorizontal: 13, paddingVertical: 8, marginRight: 6, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: ui.divider }, chipSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
  savedAddressBlock: { gap: 8 },
  savedAddressEmpty: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.muted, fontSize: 12, lineHeight: 19, backgroundColor: ui.neutralBg, padding: 12, borderRadius: 12 },
  savedAddressCard: { minHeight: TOUCH_MIN, width: 200, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: ui.divider, backgroundColor: '#fff', gap: 4 },
  savedAddressCardSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  savedAddressTitle: { textAlign: 'right', color: colors.text, fontFamily: fontFamily.bold, fontSize: 13 },
  savedAddressTitleSelected: { color: colors.tealDark },
  savedAddressMeta: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.muted, fontSize: 12, lineHeight: 16 },
  saveAddressButton: { minHeight: TOUCH_MIN, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: ui.tealBorder, backgroundColor: colors.tealSoft },
  saveAddressButtonText: { color: colors.tealDark, fontFamily: fontFamily.bold, fontSize: 13 },
  saveAddressMessage: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.tealDark, fontSize: 12 }, fieldFeedback: { fontFamily: fontFamily.regular, color: ui.dangerText, fontSize: 12, lineHeight: 18, textAlign: 'right' }, chipText: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12 }, summary: { backgroundColor: '#fff', borderRadius: radius.card, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border }, summaryTitle: { textAlign: 'center', color: colors.text, fontFamily: fontFamily.bold, fontSize: 16 }, summaryLine: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.muted, fontSize: 13 }, invoiceLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: ui.divider, paddingTop: 10 }, totalLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: ui.inputBorder, paddingTop: 10 }, totalLabel: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 14 }, total: { textAlign: 'right', color: colors.teal, fontFamily: fontFamily.bold, fontSize: 22, marginTop: 8 }, paymentBox: { backgroundColor: ui.surfaceMuted, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: ui.divider }, paymentMethods: { gap: 8 }, paymentMethod: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: ui.divider, borderRadius: 13, padding: 13 }, paymentMethodSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, mockHint: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.tealDark, fontSize: 12, lineHeight: 18 }, pendingMessage: { color: colors.amberText, backgroundColor: colors.amberBg, padding: 12, borderRadius: 12, textAlign: 'right' }, errorMessage: { color: ui.dangerText, backgroundColor: ui.dangerBg, padding: 12, borderRadius: 12, textAlign: 'right' }, navigation: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }, primary: { minHeight: TOUCH_MIN + 4, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 13, backgroundColor: colors.teal }, primaryText: { color: colors.white, fontFamily: fontFamily.bold }, disabled: { opacity: 0.45 }, back: { justifyContent: 'center', minHeight: TOUCH_MIN, padding: 13 }, backText: { color: colors.muted, fontFamily: fontFamily.bold },
});
