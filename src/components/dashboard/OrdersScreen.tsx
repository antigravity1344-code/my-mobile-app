import React from 'react';
import { PackageCheck, Clock, CheckCircle2, PlusCircle } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';

interface OrdersScreenProps {
  onStartBooking: () => void;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({ onStartBooking }) => {
  const { paymentReceipt, selectedService, selectedDate, selectedTimeSlot } = useBooking();

  return (
    <div className="space-y-4 text-right pb-6">
      <div className="flex justify-between items-center border-b border-slate-200 pb-3">
        <h3 className="text-base font-bold text-slate-800">سفارش‌های من</h3>
        <button
          onClick={onStartBooking}
          className="inline-flex items-center gap-1 bg-sky-600 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-sky-700 transition cursor-pointer"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>سفارش جدید</span>
        </button>
      </div>

      {paymentReceipt ? (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono text-slate-500">{paymentReceipt.orderId}</span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                  paymentReceipt.status === 'PAID'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {paymentReceipt.status === 'PAID' ? 'پرداخت شده' : 'پرداخت ناموفق'}
              </span>
            </div>

            <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">{selectedService?.title || 'سرویس نظافت'}</p>
                <p className="text-[10px] text-slate-500">تاریخ پرداخت: {paymentReceipt.paidAt}</p>
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-900">{(paymentReceipt.amountInRials / 10).toLocaleString('fa-IR')} تومان</p>
                {paymentReceipt.refId && (
                  <p className="text-[9px] text-slate-400">کد پیگیری: {paymentReceipt.refId}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : selectedService ? (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-sky-800 font-bold text-xs">
            <Clock className="w-4 h-4 text-sky-600" />
            <span>سفارش در حال تکمیل (پیش‌نویس)</span>
          </div>
          <p className="text-xs text-slate-700">سرویس انتخاب شده: {selectedService.title}</p>
          {selectedDate && <p className="text-[11px] text-slate-600">تاریخ: {selectedDate.dayOfWeek} {selectedDate.dayOfMonth} {selectedDate.monthName}</p>}
          {selectedTimeSlot && <p className="text-[11px] text-slate-600">ساعت: {selectedTimeSlot.label}</p>}
          <button
            onClick={onStartBooking}
            className="w-full mt-2 bg-sky-600 text-white text-xs font-bold py-1.5 rounded-lg text-center cursor-pointer"
          >
            ادامه تکمیل رزرو
          </button>
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <PackageCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-xs font-bold text-slate-600">هنوز سفارشی ثبت نکرده‌اید</p>
          <p className="text-[11px] text-slate-400">با چند کلیک ساده اولین سفارش نظافت خود را ثبت کنید.</p>
          <button
            onClick={onStartBooking}
            className="bg-sky-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm hover:bg-sky-700 transition cursor-pointer"
          >
            ثبت اولین سفارش
          </button>
        </div>
      )}

      {/* سابقه سفارش‌های قبلی نمادین */}
      <div className="pt-2">
        <h4 className="text-xs font-bold text-slate-500 mb-2">سفارش‌های گذشته</h4>
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex justify-between items-center opacity-70">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-700">نظافت عادی منزل</p>
              <p className="text-[10px] text-slate-400">۱۴ مرداد ۱۴۰۵ • ۴ ساعت</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-slate-600">تکمیل شده</span>
        </div>
      </div>
    </div>
  );
};
