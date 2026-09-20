import React, { useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import { CleaningService } from '../../types/service';
import { ServiceSelector } from './ServiceSelector';
import { DateTimeSelector } from './DateTimeSelector';
import { AddressLocationSelector } from './AddressLocationSelector';
import { calculateFinalPrice, type RecurringFrequency } from '../../utils/pricing';
import { useOrders, type OrderItem } from '../../features/orders';
import { normalizePersianDigits } from '../../utils/bookingValidation';
import { Sparkles, Calendar, MapPin, Check, Clock, ShieldCheck, Loader2, CheckCircle, AlertCircle, ClipboardList } from 'lucide-react';

const STEPS = [
  { id: 1, title: 'نوع سرویس', icon: Sparkles },
  { id: 2, title: 'زمان و تاریخ', icon: Calendar },
  { id: 3, title: 'آدرس و نقشه', icon: MapPin },
  { id: 4, title: 'تایید و ثبت', icon: ClipboardList },
];

export interface BookingWizardContainerProps {
  onNavigateHome?: () => void;
}

export const BookingWizardContainer: React.FC<BookingWizardContainerProps> = ({ onNavigateHome }) => {
  const {
    step,
    setStep,
    selectedService,
    setSelectedService,
    selectedDate,
    setSelectedDate,
    selectedTimeSlot,
    setSelectedTimeSlot,
    durationHours,
    setDurationHours,
    genderPreference,
    setGenderPreference,
    notes,
    setNotes,
    recurringFrequency,
    setRecurringFrequency,
    customerTier,
    addressDetails,
    serviceOptions,
    updateAddressField,
    resetBooking,
    nextStep,
    prevStep,
  } = useBooking();

  const pricing = selectedService && selectedDate
    ? calculateFinalPrice(
      selectedService,
      durationHours,
      serviceOptions,
      selectedDate.dateString,
      selectedTimeSlot?.extraFee ?? 0,
      { recurringFrequency, isFirstRecurringInvoice: true, customerTier },
    )
    : null;
  const totalPrice = pricing?.total ?? 0;
  const { addNewOrder } = useOrders();
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const canSubmit =
    Boolean(selectedService && selectedDate && selectedTimeSlot && addressDetails.contactPhone && addressDetails.fullAddress && addressDetails.plaque);

  const submitPendingOrder = async () => {
    if (!selectedService || !selectedDate || !selectedTimeSlot || !pricing) return;
    setSubmissionState('submitting');
    setSubmissionMessage(null);

    const now = new Date().toISOString();
    const normalizedAddress = {
      ...addressDetails,
      plaque: normalizePersianDigits(addressDetails.plaque),
      unit: normalizePersianDigits(addressDetails.unit),
      contactPhone: normalizePersianDigits(addressDetails.contactPhone),
    };

    const newOrder: OrderItem = {
      id: `TEMP-${Date.now()}`,
      orderNumber: `TEMP-${Date.now()}`,
      serviceId: selectedService.id,
      serviceTitle: selectedService.title,
      serviceSubtitle: selectedService.subtitle,
      pricingType: selectedService.pricingType,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      paymentMethod: 'CASH',
      date: selectedDate,
      timeSlot: selectedTimeSlot,
      durationHours,
      genderPreference,
      serviceOptions,
      recurringFrequency,
      customerTier,
      address: normalizedAddress,
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
      notes,
      createdAt: now,
      updatedAt: now,
    };

    const result = await addNewOrder(newOrder);
    if (result.success) {
      const orderId = result.order?.id || result.order?.orderNumber || newOrder.id;
      setCreatedOrderId(orderId);
      setSubmissionState('success');
      setSubmissionMessage('سفارش ثبت شد. پرداخت بعد از انجام کار انجام می‌شود.');
    } else {
      setSubmissionState('error');
      setSubmissionMessage(result.error || 'ثبت سفارش ناموفق بود.');
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 text-right" dir="rtl">
      <div className="border-b border-slate-100 pb-5 mb-6">
        <div className="flex items-center justify-between">
          {STEPS.map((s, index) => {
            const isCompleted = step > s.id;
            const isActive = step === s.id;
            const Icon = s.icon;

            return (
              <React.Fragment key={s.id}>
                <div
                  onClick={() => {
                    if (isCompleted) setStep(s.id);
                  }}
                  className={`flex flex-col items-center gap-1.5 ${
                    isCompleted ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                      isCompleted
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : isActive
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20 ring-4 ring-sky-100 scale-105'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isCompleted ? <Check className="w-5 h-5 stroke-[2.5]" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span
                    className={`text-[11px] font-bold ${
                      isActive ? 'text-sky-700' : isCompleted ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {s.title}
                  </span>
                </div>

                {index < STEPS.length - 1 && (
                  <div className="h-0.5 flex-1 mx-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        step > s.id ? 'bg-emerald-500 w-full' : 'w-0'
                      }`}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="min-h-[360px]">
        {step === 1 && (
          <ServiceSelector
            selectedService={selectedService}
            onSelectService={(svc: CleaningService) => {
              setSelectedService(svc);
            }}
            onNext={nextStep}
            onPrev={onNavigateHome || prevStep}
          />
        )}

        {step === 2 && (
          <>
            <DateTimeSelector
              selectedDate={selectedDate}
              selectedTimeSlot={selectedTimeSlot}
              durationHours={durationHours}
              genderPreference={genderPreference}
              notes={notes}
              onSelectDate={setSelectedDate}
              onSelectTimeSlot={setSelectedTimeSlot}
              onChangeDuration={setDurationHours}
              onChangeGender={setGenderPreference}
              onChangeNotes={setNotes}
              onNext={nextStep}
              onPrev={prevStep}
            />
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-right">
              <div className="mb-3 text-sm font-bold text-slate-700">تکرار سفارش</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  ['ONE_TIME', 'یک‌باره'],
                  ['WEEKLY', 'هفتگی'],
                  ['BIWEEKLY', 'چندهفته‌ای'],
                  ['MONTHLY', 'ماهانه'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRecurringFrequency(value as RecurringFrequency)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      recurringFrequency === value
                        ? 'border-sky-500 bg-sky-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {recurringFrequency !== 'ONE_TIME' && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
                  فاکتور جلسه اول عادی محاسبه شد، تخفیف دوره‌ای روی فاکتور جلسات بعدی اعمال می‌شود.
                </div>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <AddressLocationSelector
            addressDetails={addressDetails}
            onUpdateField={updateAddressField}
            onNext={nextStep}
            onPrev={prevStep}
          />
        )}

        {step === 4 && (
          <div className="space-y-6 text-right">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600" />
                <span>۴. بازبینی و ثبت سفارش</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                اطلاعات را بررسی کنید. پرداخت بعد از انجام کار است؛ الان فقط درخواست ثبت می‌شود.
              </p>
            </div>

            <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold text-slate-700">نوع خدمت:</span>
                </div>
                <span className="text-xs font-extrabold text-slate-900">
                  {selectedService?.title || 'نظافت عادی منزل'}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold text-slate-700">زمان اعزام:</span>
                </div>
                <span className="text-xs font-bold text-slate-900">
                  {selectedDate?.dayOfWeek} {selectedDate?.dayOfMonth} {selectedDate?.monthName} ({selectedTimeSlot?.label})
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold text-slate-700">مدت زمان و تخصص:</span>
                </div>
                <span className="text-xs font-bold text-slate-900">
                  {durationHours} ساعت نظافت (متخصص {genderPreference === 'FEMALE' ? 'خانم' : genderPreference === 'MALE' ? 'آقا' : 'بدون ترجیح'})
                </span>
              </div>

              <div className="flex justify-between items-start border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2 shrink-0">
                  <MapPin className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold text-slate-700">آدرس:</span>
                </div>
                <div className="text-left text-xs font-medium text-slate-800 max-w-xs leading-relaxed">
                  {addressDetails.district}، {addressDetails.fullAddress}، پلاک {addressDetails.plaque}
                  {addressDetails.unit ? `، واحد ${addressDetails.unit}` : ''}
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    تحویل‌گیرنده: {addressDetails.recipientName} ({addressDetails.contactPhone})
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-extrabold text-slate-900">مبلغ برآوردی:</span>
                <span className="text-base sm:text-lg font-black text-emerald-600">
                  {formattedTotalPrice} تومان
                </span>
              </div>
              {pricing && pricing.discountAmount > 0 && (
                <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-emerald-700">
                  {pricing.earlyBirdDiscountAmount > 0 && <span>تخفیف زودهنگام: {pricing.earlyBirdDiscountAmount.toLocaleString('fa-IR')} تومان</span>}
                  {pricing.tierDiscountAmount > 0 && <span>تخفیف باشگاه مشتریان: {pricing.tierDiscountAmount.toLocaleString('fa-IR')} تومان</span>}
                </div>
              )}
              {pricing?.recurringDiscountDeferred && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
                  فاکتور جلسه اول عادی محاسبه شد، تخفیف دوره‌ای روی فاکتور جلسات بعدی اعمال می‌شود.
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 bg-emerald-50/70 border border-emerald-200/70 p-3.5 rounded-2xl text-emerald-800 text-xs leading-relaxed">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                <strong>ضمانت رضایت ۱۰۰٪ پاکشو:</strong> تمامی نیروها دارای گواهی عدم سوء‌پیشینه، احراز هویت تاییدشده و بیمه حوادث معتبر هستند.
              </span>
            </div>

            {/* ثبت بدون پرداخت اولیه */}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3.5 text-xs leading-relaxed text-sky-900">
              پرداخت بعد از انجام کار انجام می‌شود. با ثبت سفارش، وضعیت پرداخت <strong>در انتظار</strong> خواهد بود.
            </div>

            {submissionMessage && (
              <div
                className={`rounded-2xl border p-4 text-sm ${
                  submissionState === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : submissionState === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {submissionState === 'success' && (
                  <div className="mb-2 flex items-center gap-2 font-bold">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                    <span>سفارش ثبت شد{createdOrderId ? ` · ${createdOrderId}` : ''}</span>
                  </div>
                )}
                {submissionState === 'error' && (
                  <div className="mb-2 flex items-center gap-2 font-bold">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span>خطا در ثبت</span>
                  </div>
                )}
                <div>{submissionMessage}</div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={prevStep}
                disabled={submissionState === 'submitting'}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <span>مرحله قبل (اصلاح آدرس)</span>
              </button>

              {submissionState === 'success' ? (
                <button
                  type="button"
                  onClick={() => {
                    resetBooking();
                    setSubmissionState('idle');
                    setSubmissionMessage(null);
                    setCreatedOrderId(null);
                    onNavigateHome?.();
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 cursor-pointer"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>مشاهده سفارش‌ها / بازگشت</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submitPendingOrder()}
                  disabled={!canSubmit || submissionState === 'submitting'}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-sky-600/20 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {submissionState === 'submitting' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>در حال ثبت سفارش...</span>
                    </>
                  ) : (
                    <>
                      <ClipboardList className="h-4 w-4" />
                      <span>ثبت سفارش</span>
                    </>
                  )}
                </button>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
