import React, { useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import { CleaningService } from '../../types/service';
import { ServiceSelector } from './ServiceSelector';
import { DateTimeSelector } from './DateTimeSelector';
import { AddressLocationSelector } from './AddressLocationSelector';
import { requestPayment, verifyPayment, type PaymentRequest } from '../../api/payment';
import { calculateFinalPrice, type RecurringFrequency } from '../../utils/pricing';
import { Sparkles, Calendar, MapPin, CreditCard, Check, Clock, ShieldCheck, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const STEPS = [
  { id: 1, title: 'نوع سرویس', icon: Sparkles },
  { id: 2, title: 'زمان و تاریخ', icon: Calendar },
  { id: 3, title: 'آدرس و نقشه', icon: MapPin },
  { id: 4, title: 'تایید و فاکتور', icon: CreditCard },
];

export const BookingWizardContainer: React.FC = () => {
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
  const formattedTotalPrice = totalPrice.toLocaleString('fa-IR');

  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'requesting' | 'success' | 'failed'>('idle');
  const [paymentMsg, setPaymentMsg] = useState<string | null>(null);
  const [paymentAuthority, setPaymentAuthority] = useState<string | null>(null);

  const handlePayment = async () => {
    if (!selectedService || !addressDetails.contactPhone) return;
    setPaymentStatus('requesting');
    setPaymentMsg(null);
    setPaymentAuthority(null);

    const orderId = `ORDER-${Date.now()}`;
    const req: PaymentRequest = {
      orderId,
      amount: totalPrice,
      description: `${selectedService.title} — ${addressDetails.district}، پلاک ${addressDetails.plaque}`,
      mobile: addressDetails.contactPhone,
    };

    try {
      const payResult = await requestPayment(req);
      if (payResult.success && payResult.authority) {
        setPaymentAuthority(payResult.authority);
        setPaymentMsg(`کد تأیید: ${payResult.authority} — برای تأیید نهایی به درگاه مراجعه کنید.`);
        setPaymentStatus('success');
      } else {
        setPaymentMsg(payResult.error || 'خطا در درخواست پرداخت.');
        setPaymentStatus('failed');
      }
    } catch {
      setPaymentMsg('خطا در ارتباط با درگاه پرداخت.');
      setPaymentStatus('failed');
    }
  };

  const handleVerifyPayment = async () => {
    if (!paymentAuthority) return;
    setPaymentStatus('requesting');
    setPaymentMsg(null);
    try {
      const verifyResult = await verifyPayment(paymentAuthority, totalPrice);
      if (verifyResult.success) {
        setPaymentMsg(`پرداخت تایید شد! شناسه: ${verifyResult.refId}`);
        setPaymentStatus('success');
      } else {
        setPaymentMsg(verifyResult.error || 'پرداخت تایید نشد.');
        setPaymentStatus('failed');
      }
    } catch {
      setPaymentMsg('خطا در تایید پرداخت.');
      setPaymentStatus('failed');
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
              nextStep();
            }}
            onNext={nextStep}
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
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <span>۴. پیش‌فاکتور و بازبینی نهایی سفارش</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                اطلاعات ثبت‌شده را بررسی نموده و شیوه پرداخت را انتخاب کنید.
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
                  {selectedService?.pricingType === 'per_sqm'
                    ? `متراژ تخمینی: ${serviceOptions['area'] || '۵۰'} متر مربع`
                    : selectedService?.id === 'hourly_labor'
                    ? `${serviceOptions['workerCount'] || '۱ نفر'} کارگر ساعتی — ${serviceOptions['hours'] || durationHours} ساعت`
                    : `${durationHours} ساعت (متخصص ${genderPreference === 'FEMALE' ? 'خانم' : genderPreference === 'MALE' ? 'آقا' : 'بدون ترجیح'})`
                  }
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
                <span className="text-sm font-extrabold text-slate-900">مبلغ نهایی قابل پرداخت:</span>
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

            {/* Payment Status Panel */}
            {(paymentStatus === 'requesting' || paymentStatus === 'success' || paymentStatus === 'failed') && (
              <div className={`rounded-2xl border p-4 space-y-2 text-sm ${
                paymentStatus === 'requesting' ? 'bg-slate-50 border-slate-200' :
                paymentStatus === 'success' ? 'bg-emerald-50 border-emerald-200' :
                'bg-red-50 border-red-200'
              }`}>
                {paymentStatus === 'requesting' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 text-sky-600 animate-spin shrink-0" />
                      <span className="text-slate-700 font-medium">در حال اتصال به درگاه پرداخت...</span>
                    </div>
                    <div className="text-xs text-slate-500">لطفاً صبور باشید (شبیه‌سازی تأخیر شبکه)</div>
                  </>
                )}
                {paymentStatus === 'success' && (
                  <>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="text-emerald-800 font-bold">پرداخت با موفقیت انجام شد</span>
                    </div>
                    {paymentMsg && (
                      <div className="text-xs text-emerald-700 bg-emerald-100/50 rounded-lg p-2">{paymentMsg}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setPaymentStatus('idle'); setPaymentMsg(null); setPaymentAuthority(null); }}
                      className="text-xs text-slate-500 hover:text-slate-700 underline mt-1"
                    >
                      بازگشت
                    </button>
                  </>
                )}
                {paymentStatus === 'failed' && (
                  <>
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                      <span className="text-red-700 font-bold">پرداخت ناموفق</span>
                    </div>
                    {paymentMsg && (
                      <div className="text-xs text-red-600 bg-red-100/50 rounded-lg p-2">{paymentMsg}</div>
                    )}
                    {paymentStatus === 'failed' && paymentAuthority && (
                      <button
                        type="button"
                        onClick={handleVerifyPayment}
                        className="mt-2 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer"
                      >
                        تلاش برای تایید مجدد
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setPaymentStatus('idle'); setPaymentMsg(null); setPaymentAuthority(null); }}
                      className="text-xs text-slate-500 hover:text-slate-700 underline mt-2"
                    >
                      رها کردن و بازگشت
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                <span>مرحله قبل (اصلاح آدرس)</span>
              </button>

              {paymentStatus === 'idle' ? (
                <button
                  type="button"
                  onClick={handlePayment}
                  disabled={!selectedService || !addressDetails.contactPhone}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>اتصال به درگاه و پرداخت آنلاین</span>
                </button>
              ) : paymentStatus === 'requesting' ? (
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white cursor-not-allowed"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در انتظار...</span>
                </button>
              ) : paymentStatus === 'success' ? (
                <button
                  type="button"
                  onClick={() => { setPaymentStatus('idle'); setPaymentMsg(null); setPaymentAuthority(null); }}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 transition shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>پرداخت انجام شد — بازگشت</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setPaymentStatus('idle'); setPaymentMsg(null); setPaymentAuthority(null); }}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-red-700 transition shadow-md shadow-red-600/20 cursor-pointer"
                >
                  <AlertCircle className="w-4 h-4" />
                  <span>خطا — مجدداً تلاش</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
