import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { Check, Clock, MapPin, Sparkles } from 'lucide-react-native';
import { useBooking } from '../../context/BookingContext';
import { PricingTable } from './PricingTable';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { calculateFinalPrice, type FinalPrice } from '../../utils/pricing';
import { getCurrentPosition } from '../../services/location';
import { JalaliDateOption, TimeSlot } from '../../types/booking';
import { CleaningService } from '../../types/service';
import { isValidAddress, normalizePersianDigits, getAddressValidationErrors } from '../../utils/bookingValidation';
import { useOrders, type OrderItem } from '../../features/orders';
import { useProfile, type SavedAddress } from '../../features/profile';

const TIME_SLOTS: TimeSlot[] = [
  { id: 'morning-1', startTime: '08:00', endTime: '10:00', label: 'صبح زود', period: 'MORNING', isAvailable: true },
  { id: 'morning-2', startTime: '10:00', endTime: '12:00', label: 'صبح', period: 'MORNING', isAvailable: true },
  { id: 'afternoon-1', startTime: '14:00', endTime: '16:00', label: 'ظهر', period: 'AFTERNOON', isAvailable: true },
  { id: 'afternoon-2', startTime: '16:00', endTime: '18:00', label: 'عصر', period: 'AFTERNOON', isAvailable: true },
];

const makeDates = (): JalaliDateOption[] => {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });
  const keyFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const parts = formatter.formatToParts(date);
    const keyParts = keyFormatter.formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const keyValue = (type: string) => keyParts.find((part) => part.type === type)?.value ?? '';
    return {
      dateString: `${keyValue('year')}-${keyValue('month')}-${keyValue('day')}`.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))),
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

interface NativeBookingWizardProps {
  onOrderCreated?: (orderId: string) => void;
}

export const NativeBookingWizard = ({ onOrderCreated }: NativeBookingWizardProps) => {
  const booking = useBooking();
  const { addNewOrder } = useOrders();
  const dates = useMemo(makeDates, []);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [districtSearch, setDistrictSearch] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const scrollFocusedFieldIntoView = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };
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
  const pricing: FinalPrice = booking.selectedService && booking.selectedDate
    ? calculateFinalPrice(
      booking.selectedService,
      booking.durationHours,
      booking.serviceOptions,
      booking.selectedDate.dateString,
      booking.selectedTimeSlot?.extraFee ?? 0,
      {
        recurringFrequency: booking.recurringFrequency,
        isFirstRecurringInvoice: true,
        customerTier: booking.customerTier,
      },
    )
    : {
      subtotal: 0,
      earlyBirdDiscountRate: 0,
      earlyBirdDiscountAmount: 0,
      tierDiscountRate: 0,
      tierDiscountAmount: 0,
      recurringDiscountRate: 0,
      recurringDiscountAmount: 0,
      discountRate: 0,
      discountAmount: 0,
      recurringDiscountDeferred: false,
      total: 0,
    };
  const total = pricing.total;

  const selectService = (service: CleaningService, options: Record<string, string | number | boolean> = {}) => {
    booking.setSelectedService(service);
    Object.entries(options).forEach(([id, value]) => booking.setServiceOption(id, value));
    if (typeof options.durationHours === 'number') booking.setDurationHours(options.durationHours);
    booking.setStep(2);
  };

  const useGps = async () => {
    setGpsLoading(true);
    try {
      const coordinates = await getCurrentPosition();
      if (coordinates) booking.updateAddressField('coordinates', coordinates);
    } finally {
      setGpsLoading(false);
    }
  };

  const addressErrors = getAddressValidationErrors(booking.addressDetails);
  const getInputStyle = (field: keyof typeof booking.addressDetails) => {
    const hasError = !!(addressErrors as any)[field];
    const value = (booking.addressDetails as any)[field];
    if (!value) return styles.inputError;
    if (hasError) return styles.inputError;
    return styles.inputSuccess;
  };
  const submitCurrentBooking = async () => {
    if (!booking.selectedService || !booking.selectedDate || !booking.selectedTimeSlot) return;
    setSubmissionState('submitting');
    setSubmissionMessage(null);

    const now = new Date().toISOString();
    const addressDetails = {
      ...booking.addressDetails,
      plaque: normalizePersianDigits(booking.addressDetails.plaque),
      unit: normalizePersianDigits(booking.addressDetails.unit),
      contactPhone: normalizePersianDigits(booking.addressDetails.contactPhone),
    };

    const newOrder: OrderItem = {
      id: `TEMP-${Date.now()}`,
      orderNumber: `TEMP-${Date.now()}`,
      serviceId: booking.selectedService.id,
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
      serviceOptions: booking.serviceOptions,
      recurringFrequency: booking.recurringFrequency,
      customerTier: booking.customerTier,
      address: addressDetails,
      pricing,
      timeline: [
        {
          step: 'SUBMITTED',
          title: 'ثبت درخواست',
          timestamp: now,
          description: 'درخواست شما ثبت شد و در انتظار تأیید است.',
          isCompleted: true,
          isCurrent: true,
        },
      ],
      notes: booking.notes,
      createdAt: now,
      updatedAt: now,
    };

    const result = await addNewOrder(newOrder);
    if (result.success) {
      const orderId = result.order?.id || result.order?.orderNumber || newOrder.id;
      setCreatedOrderId(orderId);
      setSubmissionState('success');
      setSubmissionMessage(`درخواست شما ثبت شد. شماره سفارش: ${orderId}`);
    } else {
      setSubmissionState('error');
      setSubmissionMessage(result.error || 'ثبت سفارش انجام نشد.');
    }
  };

  const canContinue = booking.step === 1 ? Boolean(booking.selectedService) : booking.step === 2 ? Boolean(booking.selectedDate && booking.selectedTimeSlot) : booking.step === 3 ? isValidAddress(booking.addressDetails) : true;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}><Sparkles size={22} color="#fff" /></View>
          <View><Text style={styles.title}>پاکشو</Text><Text style={styles.subtitle}>رزرو سرویس نظافت</Text></View>
        </View>
        <StepHeader step={booking.step} />

        {booking.step === 1 && <View style={styles.section}>
          <Text style={styles.heading}>نوع سرویس را انتخاب کنید</Text>
          <Pressable onPress={() => setPricingVisible(true)} style={styles.pricingButton}><Text style={styles.pricingButtonText}>مشاهده جدول شفاف تعرفه‌ها</Text></Pressable>
          {SERVICES_CATALOG.filter((service) => service.isVisible).map((service) => (
            <Pressable key={service.id} onPress={() => selectService(service)} style={[styles.card, booking.selectedService?.id === service.id && styles.cardSelected]}>
              <View style={styles.cardIcon}><Sparkles size={20} color="#0284c7" /></View>
              <View style={styles.flex}><Text style={styles.cardTitle}>{service.title}</Text><Text style={styles.muted}>{service.subtitle}</Text><Text style={styles.configuration}>{service.configuration.pricingLabel}</Text></View>
              <Text style={styles.price}>{service.pricingType === 'hourly' ? `کف ۴ ساعت: ${(service.basePrice * 4).toLocaleString('fa-IR')} تومان` : service.basePrice ? `شروع از ${service.basePrice.toLocaleString('fa-IR')} تومان` : 'استعلام قیمت'}</Text>
            </Pressable>
          ))}
          <PricingTable visible={pricingVisible} onClose={() => setPricingVisible(false)} onSelect={selectService} />
        </View>}

        {booking.step === 2 && <View style={styles.section}>
          <Text style={styles.heading}>تاریخ و ساعت</Text>
          <Text style={styles.earlyBirdHint}>با رزرو برای ۷ روز آینده یا بیشتر، تا ۱۰٪ تخفیف برنامه‌ریزی زودهنگام بگیرید.</Text>
          <Text style={styles.label}>تاریخ اعزام</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontalList, { flexDirection: 'row-reverse' }]}>
            {dates.map((date) => <Pressable key={date.dateString} onPress={() => { booking.setSelectedDate(date); booking.setSelectedTimeSlot(null); }} style={[styles.dateCard, booking.selectedDate?.dateString === date.dateString && styles.dateSelected]}><Text style={styles.dateDay}>{date.isToday ? 'امروز' : date.dayOfWeek}</Text><Text style={styles.dateNumber}>{date.dayOfMonth}</Text><Text style={styles.muted}>{date.monthName}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.label}>بازه زمانی</Text>
          {TIME_SLOTS.map((slot) => <Pressable key={slot.id} disabled={!booking.selectedDate} onPress={() => booking.setSelectedTimeSlot(slot)} style={[styles.slot, booking.selectedTimeSlot?.id === slot.id && styles.cardSelected]}><Clock size={18} color="#0284c7" /><Text style={styles.flex}>{slot.label} ({slot.startTime} تا {slot.endTime})</Text>{booking.selectedTimeSlot?.id === slot.id && <Check size={18} color="#059669" />}</Pressable>)}
          {booking.selectedService?.pricingType === 'hourly' && <><Text style={styles.label}>مدت زمان (حداقل ۴ ساعت)</Text><View style={styles.choiceRow}>{[4, 5, 6, 8].map((hours) => <Pressable key={hours} onPress={() => booking.setDurationHours(hours)} style={[styles.choice, booking.durationHours === hours && styles.choiceSelected]}><Text style={booking.durationHours === hours ? styles.choiceTextSelected : styles.choiceText}>{hours} ساعت</Text></Pressable>)}</View></>}
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
              فاکتور جلسه اول عادی محاسبه شد؛ تخفیف دوره‌ای روی فاکتور جلسات بعدی اعمال می‌شود.
            </Text>
          )}
          {booking.selectedService?.configuration.inputs?.map((input) => (
            <View key={input.id} style={styles.optionBlock}>
              <Text style={styles.label}>{input.label}{input.price ? ` (+${input.price.toLocaleString('fa-IR')} تومان)` : ''}</Text>
              {input.type === 'number' && <TextInput keyboardType="numeric" placeholder={input.id === 'floors' ? 'مثال: ۴' : 'مثال: ۰'} placeholderTextColor="#94a3b8" value={String(booking.serviceOptions[input.id] ?? '')} onChangeText={(value) => booking.setServiceOption(input.id, Number(value.replace(/[^0-9]/g, '')) || 0)} style={styles.input} />}
              {input.type === 'select' && <View style={styles.choiceRow}>{input.options?.map((option) => <Pressable key={option} onPress={() => booking.setServiceOption(input.id, option)} style={[styles.choice, booking.serviceOptions[input.id] === option && styles.choiceSelected]}><Text style={booking.serviceOptions[input.id] === option ? styles.choiceTextSelected : styles.choiceText}>{option}</Text></Pressable>)}</View>}
              {input.type === 'boolean' && <Pressable onPress={() => booking.setServiceOption(input.id, !booking.serviceOptions[input.id])} style={[styles.toggle, booking.serviceOptions[input.id] === true && styles.toggleSelected]}><Text style={booking.serviceOptions[input.id] === true ? styles.choiceTextSelected : styles.choiceText}>{booking.serviceOptions[input.id] === true ? 'بله' : 'خیر'}</Text></Pressable>}
            </View>
          ))}
        </View>}

        {booking.step === 3 && <View style={styles.section}>
          <Text style={styles.heading}>آدرس و تحویل‌گیرنده</Text>
          {savedAddresses.length > 0 ? (
            <View style={styles.savedAddressBlock}>
              <Text style={styles.label}>آدرس‌های ذخیره‌شده</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.horizontalList, { flexDirection: 'row-reverse' }]}
              >
                {savedAddresses.map((address) => {
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
          <Pressable onPress={useGps} style={styles.gpsButton}><MapPin size={18} color="#0284c7" /><Text style={styles.gpsText}>{gpsLoading ? 'در حال دریافت موقعیت...' : 'استفاده از موقعیت فعلی'}</Text>{gpsLoading && <ActivityIndicator color="#0284c7" />}</Pressable>
          <TextInput value={districtSearch} onChangeText={setDistrictSearch} placeholder="جستجوی محله" placeholderTextColor="#94a3b8" style={[styles.input, getInputStyle('district')]} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row-reverse' }}>{filteredDistricts.map((district) => <Pressable key={district} onPress={() => { setSelectedSavedAddressId(null); booking.updateAddressField('district', district); }} style={[styles.chip, booking.addressDetails.district === district && styles.chipSelected]}><Text style={styles.chipText}>{district}</Text></Pressable>)}</ScrollView>
          <Text style={styles.label}>نشانی دقیق</Text><TextInput multiline value={booking.addressDetails.fullAddress} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('fullAddress', value); }} placeholder="مثال: خیابان، کوچه، بن‌بست" placeholderTextColor="#94a3b8" style={[styles.input, styles.textArea, getInputStyle('fullAddress')]} />
          <View style={styles.choiceRow}>
            <View style={styles.labeledInput}><Text style={styles.inputLabel}>پلاک</Text><TextInput value={booking.addressDetails.plaque} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('plaque', value); }} placeholder="مثال: ۱۲" placeholderTextColor="#94a3b8" style={[styles.input, styles.smallInput, getInputStyle('plaque')]} /></View>
            <View style={styles.labeledInput}><Text style={styles.inputLabel}>واحد</Text><TextInput value={booking.addressDetails.unit} onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('unit', value); }} placeholder="مثال: ۴" placeholderTextColor="#94a3b8" style={[styles.input, styles.smallInput, getInputStyle('unit')]} /></View>
          </View>
          <Text style={styles.label}>نام و نام خانوادگی</Text>
          <TextInput
            value={booking.addressDetails.recipientName}
            onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('recipientName', value); }}
            onFocus={scrollFocusedFieldIntoView}
            placeholder="مثال: علی احمدی"
            placeholderTextColor="#94a3b8"
            style={[styles.input, getInputStyle('recipientName')]}
          />
          <Text style={styles.label}>شماره موبایل</Text>
          <TextInput
            value={booking.addressDetails.contactPhone}
            onChangeText={(value) => { setSelectedSavedAddressId(null); booking.updateAddressField('contactPhone', value); }}
            onFocus={scrollFocusedFieldIntoView}
            placeholder="مثال: 09121111111"
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
            <Text style={styles.summaryLine}>زمان: {booking.selectedDate?.dayOfWeek} {booking.selectedDate?.dayOfMonth} {booking.selectedTimeSlot?.label}</Text>
            <Text style={styles.summaryLine}>آدرس: {booking.addressDetails.district}، {booking.addressDetails.fullAddress}</Text>
            <View style={styles.invoiceLine}><Text style={styles.summaryLine}>هزینه سرویس</Text><Text style={styles.summaryLine}>{(total - (booking.selectedTimeSlot?.extraFee ?? 0)).toLocaleString('fa-IR')} تومان</Text></View>
            {(booking.selectedTimeSlot?.extraFee ?? 0) > 0 && <View style={styles.invoiceLine}><Text style={styles.summaryLine}>هزینه بازه زمانی</Text><Text style={styles.summaryLine}>{booking.selectedTimeSlot?.extraFee?.toLocaleString('fa-IR')} تومان</Text></View>}
            {pricing.earlyBirdDiscountAmount > 0 && <View style={styles.discountLine}><Text style={styles.discountLabel}>تخفیف برنامه‌ریزی زودهنگام ({Math.round(pricing.earlyBirdDiscountRate * 100)}٪)</Text><Text style={styles.discountAmount}>-{pricing.earlyBirdDiscountAmount.toLocaleString('fa-IR')} تومان</Text></View>}
            {pricing.tierDiscountAmount > 0 && <View style={styles.discountLine}><Text style={styles.discountLabel}>تخفیف باشگاه مشتریان ({booking.customerTier})</Text><Text style={styles.discountAmount}>-{pricing.tierDiscountAmount.toLocaleString('fa-IR')} تومان</Text></View>}
            {pricing.recurringDiscountDeferred && <Text style={styles.recurringHint}>فاکتور جلسه اول عادی محاسبه شد؛ تخفیف دوره‌ای روی فاکتور جلسات بعدی اعمال می‌شود.</Text>}
            {pricing.recurringDiscountAmount > 0 && <View style={styles.discountLine}><Text style={styles.discountLabel}>تخفیف سفارش دوره‌ای</Text><Text style={styles.discountAmount}>-{pricing.recurringDiscountAmount.toLocaleString('fa-IR')} تومان</Text></View>}
            <View style={styles.totalLine}><Text style={styles.totalLabel}>مبلغ برآوردی</Text><Text style={styles.total}>{total.toLocaleString('fa-IR')} تومان</Text></View>
          </View>
          <Text style={styles.mockHint}>پرداخت بعد از انجام کار انجام می‌شود. الان فقط درخواست ثبت می‌شود.</Text>
          {submissionState === 'success' ? (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>سفارش ثبت شد</Text>
              {createdOrderId ? (
                <Text style={styles.successOrderId}>شماره سفارش: {createdOrderId}</Text>
              ) : null}
              {submissionMessage ? <Text style={styles.successMessage}>{submissionMessage}</Text> : null}
              <Text style={styles.successHint}>پرداخت بعد از انجام کار است. جزئیات را در فهرست سفارش‌ها ببینید.</Text>
              <Pressable
                onPress={() => {
                  const orderId = createdOrderId;
                  booking.resetBooking();
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
                disabled={submissionState === 'submitting'}
                onPress={submitCurrentBooking}
                style={[styles.primary, submissionState === 'submitting' && styles.disabled]}
              >
                {submissionState === 'submitting' && <ActivityIndicator color="#fff" />}
                <Text style={styles.primaryText}>{submissionState === 'submitting' ? 'در حال ثبت سفارش...' : 'ثبت سفارش'}</Text>
              </Pressable>
            </>
          )}
        </View>}

        {booking.step < 4 && <View style={styles.navigation}><Pressable onPress={booking.prevStep} disabled={booking.step === 1} style={styles.back}><Text style={styles.backText}>مرحله قبل</Text></Pressable><Pressable onPress={booking.nextStep} disabled={!canContinue} style={[styles.primary, !canContinue && styles.disabled]}><Text style={styles.primaryText}>ادامه</Text></Pressable></View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  successMessage: { color: '#166534', backgroundColor: '#dcfce7', padding: 12, borderRadius: 12, textAlign: 'right' },
  successCard: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#86efac', borderRadius: 16, padding: 16, gap: 10 },
  successTitle: { textAlign: 'right', color: '#166534', fontWeight: '900', fontSize: 18 },
  successOrderId: { textAlign: 'right', color: '#15803d', fontWeight: '700', fontSize: 13 },
  successHint: { textAlign: 'right', color: '#166534', fontSize: 12, lineHeight: 19 },
  successCta: { marginTop: 4, backgroundColor: '#059669', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  successCtaText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  earlyBirdHint: { color: '#047857', backgroundColor: '#ecfdf5', padding: 11, borderRadius: 12, textAlign: 'right', fontSize: 12, lineHeight: 19 },
  recurringHint: { color: '#047857', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1, padding: 11, borderRadius: 12, textAlign: 'right', fontSize: 12, lineHeight: 19 },
  discountLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ecfdf5', borderRadius: 10, padding: 10 },
  discountLabel: { color: '#047857', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  discountAmount: { color: '#059669', fontSize: 13, fontWeight: '800' },
  screen: { flex: 1, backgroundColor: '#f8fafc' }, content: { padding: 20, paddingTop: 56, paddingBottom: 160 }, brandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 24 }, brandIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0284c7' }, title: { textAlign: 'right', color: '#0f172a', fontSize: 22, fontWeight: '800' }, subtitle: { textAlign: 'right', color: '#64748b', fontSize: 13 }, stepRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 26 }, stepItem: { alignItems: 'center', gap: 5 }, stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }, stepCircleActive: { backgroundColor: '#0284c7' }, stepNumber: { color: '#64748b', fontWeight: '700' }, stepNumberActive: { color: '#fff' }, stepLabel: { color: '#94a3b8', fontSize: 11 }, stepLabelActive: { color: '#0284c7', fontWeight: '700' }, section: { gap: 12 }, pricingButton: { alignItems: 'center', padding: 13, borderRadius: 13, backgroundColor: '#e0f2fe' }, pricingButtonText: { color: '#0369a1', fontWeight: '800' }, optionBlock: { gap: 8 }, toggle: { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, toggleSelected: { backgroundColor: '#0284c7', borderColor: '#0284c7' }, heading: { textAlign: 'right', color: '#0f172a', fontSize: 20, fontWeight: '800', marginBottom: 6 }, label: { textAlign: 'right', color: '#334155', fontSize: 13, fontWeight: '700', marginTop: 8 }, labeledInput: { flex: 1, gap: 6 }, inputLabel: { textAlign: 'right', color: '#334155', fontSize: 12, fontWeight: '700' }, card: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 16, padding: 15 }, cardSelected: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' }, cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, cardTitle: { textAlign: 'right', color: '#0f172a', fontWeight: '700', fontSize: 14 }, muted: { color: '#64748b', fontSize: 11, textAlign: 'right' }, configuration: { color: '#0369a1', fontSize: 10, textAlign: 'right', marginTop: 3 }, price: { color: '#059669', fontSize: 11, fontWeight: '700', textAlign: 'right' }, horizontalList: { gap: 8, paddingVertical: 4 }, dateCard: { width: 82, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', borderRadius: 14, alignItems: 'center', gap: 3 }, dateSelected: { borderColor: '#0284c7', backgroundColor: '#e0f2fe' }, dateDay: { color: '#475569', fontSize: 11 }, dateNumber: { color: '#0f172a', fontWeight: '800' }, slot: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, backgroundColor: '#fff' }, choiceRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }, choice: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#fff' }, choiceSelected: { backgroundColor: '#0284c7', borderColor: '#0284c7' }, choiceText: { color: '#475569', fontSize: 12 }, choiceTextSelected: { color: '#fff', fontWeight: '700', fontSize: 12 }, gpsButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, backgroundColor: '#e0f2fe' }, gpsText: { color: '#0369a1', fontWeight: '700' }, inputError: { borderColor: '#ef4444', borderWidth: 1 }, inputSuccess: { borderColor: '#10b981', borderWidth: 1 }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, color: '#0f172a', textAlign: 'right' }, textArea: { minHeight: 80, textAlignVertical: 'top' }, smallInput: { flex: 1 }, chip: { paddingHorizontal: 13, paddingVertical: 8, marginRight: 6, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' }, chipSelected: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  savedAddressBlock: { gap: 8 },
  savedAddressEmpty: { textAlign: 'right', color: '#64748b', fontSize: 12, lineHeight: 19, backgroundColor: '#f1f5f9', padding: 12, borderRadius: 12 },
  savedAddressCard: { width: 200, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', gap: 4 },
  savedAddressCardSelected: { borderColor: '#0284c7', backgroundColor: '#e0f2fe' },
  savedAddressTitle: { textAlign: 'right', color: '#0f172a', fontWeight: '800', fontSize: 13 },
  savedAddressTitleSelected: { color: '#0369a1' },
  savedAddressMeta: { textAlign: 'right', color: '#64748b', fontSize: 11, lineHeight: 16 },
  saveAddressButton: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#bae6fd', backgroundColor: '#f0f9ff' },
  saveAddressButtonText: { color: '#0369a1', fontWeight: '800', fontSize: 13 },
  saveAddressMessage: { textAlign: 'right', color: '#0369a1', fontSize: 12 }, chipText: { color: '#475569', fontSize: 12 }, summary: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 12, borderWidth: 1, borderColor: '#e2e8f0' }, summaryTitle: { textAlign: 'right', color: '#0f172a', fontWeight: '800', fontSize: 16 }, summaryLine: { textAlign: 'right', color: '#475569', fontSize: 13 }, invoiceLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 }, totalLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#cbd5e1', paddingTop: 10 }, totalLabel: { color: '#0f172a', fontWeight: '800', fontSize: 14 }, total: { textAlign: 'right', color: '#059669', fontWeight: '900', fontSize: 22, marginTop: 8 }, paymentBox: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' }, paymentMethods: { gap: 8 }, paymentMethod: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 13, padding: 13 }, paymentMethodSelected: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' }, mockHint: { textAlign: 'right', color: '#0369a1', fontSize: 11, lineHeight: 18 }, pendingMessage: { color: '#92400e', backgroundColor: '#fef3c7', padding: 12, borderRadius: 12, textAlign: 'right' }, errorMessage: { color: '#b91c1c', backgroundColor: '#fee2e2', padding: 12, borderRadius: 12, textAlign: 'right' }, navigation: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }, primary: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 13, backgroundColor: '#0284c7' }, primaryText: { color: '#fff', fontWeight: '800' }, disabled: { opacity: 0.45 }, back: { padding: 13 }, backText: { color: '#475569', fontWeight: '700' },
});

