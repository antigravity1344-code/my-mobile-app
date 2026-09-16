import React from 'react';
import { Sparkles, Calendar, ShieldCheck, Clock, ArrowRight, Star } from 'lucide-react';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { useBooking } from '../../context/BookingContext';
import { CleaningService } from '../../types/service';

interface HomeScreenProps {
  onStartBooking: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onStartBooking }) => {
  const { setSelectedService } = useBooking();

  const handleQuickSelect = (serviceId: string) => {
    const service = SERVICES_CATALOG.find((s: CleaningService) => s.id === serviceId);
    if (service) {
      setSelectedService(service);
      onStartBooking();
    }
  };

  return (
    <div className="space-y-4 text-right pb-6">
      {/* بنر خوش‌آمدگویی و تخفیف */}
      <div className="bg-gradient-to-r from-sky-600 to-indigo-600 rounded-2xl p-4 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 space-y-1.5">
          <span className="inline-block px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-medium backdrop-blur">
            تخفیف ویژه سفارش اول 🎁
          </span>
          <h3 className="text-base font-bold">پاکشو؛ نظافت راحت و مطمئن</h3>
          <p className="text-xs text-sky-100">سفارش آنلاین متخصصین تاییدشده با تضمین کیفیت</p>
          <button
            onClick={onStartBooking}
            className="mt-2 inline-flex items-center gap-1.5 bg-white text-sky-700 px-3.5 py-1.5 rounded-xl text-xs font-bold shadow hover:bg-sky-50 transition cursor-pointer"
          >
            <span>شروع ثبت سفارش</span>
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
        <Sparkles className="absolute -left-3 -bottom-3 w-24 h-24 text-white/10" />
      </div>

      {/* مزایای سرویس */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center space-y-1">
          <ShieldCheck className="w-5 h-5 text-emerald-500 mx-auto" />
          <p className="text-[11px] font-bold text-slate-700">تایید هویت</p>
          <p className="text-[9px] text-slate-400">نیروی احراز شده</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center space-y-1">
          <Clock className="w-5 h-5 text-sky-500 mx-auto" />
          <p className="text-[11px] font-bold text-slate-700">آنلاین و سریع</p>
          <p className="text-[9px] text-slate-400">کمتر از ۳ دقیقه</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center space-y-1">
          <Star className="w-5 h-5 text-amber-500 mx-auto" />
          <p className="text-[11px] font-bold text-slate-700">امتیاز ۴.۸</p>
          <p className="text-[9px] text-slate-400">رضایت مشتریان</p>
        </div>
      </div>

      {/* لیست سرویس‌های محبوب */}
      <div>
        <div className="flex justify-between items-center mb-2.5">
          <h4 className="text-sm font-bold text-slate-800">خدمات محبوب پاکشو</h4>
          <button onClick={onStartBooking} className="text-[11px] text-sky-600 font-medium hover:underline">
            مشاهده همه
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {SERVICES_CATALOG.map((service: CleaningService) => (
            <button
              key={service.id}
              onClick={() => handleQuickSelect(service.id)}
              className="bg-white border border-slate-200 rounded-xl p-3 text-right hover:border-sky-400 hover:shadow-sm transition cursor-pointer flex flex-col justify-between h-28"
            >
              <div>
                <h5 className="text-xs font-bold text-slate-800 mt-1">{service.title}</h5>
                <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{service.subtitle || service.description}</p>
              </div>
              <div className="text-[10px] font-bold text-sky-600 mt-2">
                از {service.basePrice.toLocaleString('fa-IR')} تومان
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* بنر یادآوری دوره‌ای */}
      <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3 flex items-center justify-between text-amber-900">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-xs font-bold">نظافت دوره‌ای منزل</p>
            <p className="text-[10px] text-amber-700">تا ۱۰٪ تخفیف ویژه رزرو هفتگی یا ماهانه</p>
          </div>
        </div>
        <button
          onClick={onStartBooking}
          className="bg-amber-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0 cursor-pointer"
        >
          رزرو دوره‌ای
        </button>
      </div>
    </div>
  );
};
