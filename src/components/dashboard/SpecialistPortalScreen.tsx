import React, { useState } from 'react';
import {
  Briefcase,
  Hammer,
  Paintbrush,
  Sparkles,
  MapPin,
  Clock,
  CheckCircle2,
  Phone,
  User,
  ShieldCheck,
  AlertCircle,
  Sofa,
} from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { CleanersScreen } from '../../features/cleaners';

export type SpecialistRole = 'cleaner' | 'hourly_laborer' | 'painter' | 'sofa_cleaner';

interface OpenOrder {
  id: string;
  serviceId: string;
  serviceTitle: string;
  roleRequired: SpecialistRole;
  badge: string;
  customerName: string;
  phone: string;
  district: string;
  address: string;
  date: string;
  timeSlot: string;
  priceTotal: number;
  paymentMethod: 'ONLINE' | 'CASH';
  details: Record<string, string | number | boolean>;
  status: 'OPEN' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED';
}

export const SpecialistPortalScreen: React.FC = () => {
  const { paymentReceipt, selectedService, addressDetails, selectedDate, selectedTimeSlot } = useBooking();
  const [activeRole, setActiveRole] = useState<SpecialistRole>('cleaner');
  const [acceptedOrders, setAcceptedOrders] = useState<string[]>([]);
  const [portalView, setPortalView] = useState<'orders' | 'cleaners'>('orders');

  const dateLabel = selectedDate
    ? `${selectedDate.dayOfWeek} ${selectedDate.dayOfMonth} ${selectedDate.monthName}`
    : 'امروز - ۲۷ شهریور';

  // سفارش‌های نمونه پویا بر اساس تمام نقش‌ها
  const mockOrders: OpenOrder[] = [
    {
      id: paymentReceipt ? paymentReceipt.orderId : 'ORD-2026-9041',
      serviceId: selectedService?.id || 'home_unit_cleaning',
      serviceTitle: selectedService?.title || 'نظافت داخل منزل / واحد',
      roleRequired:
        selectedService?.id === 'hourly_labor'
          ? 'hourly_laborer'
          : selectedService?.id === 'building_painting'
          ? 'painter'
          : selectedService?.id === 'sofa_carpet_washing'
          ? 'sofa_cleaner'
          : 'cleaner',
      badge: selectedService?.badge || 'ساعتی',
      customerName: addressDetails.recipientName || 'علی رضایی',
      phone: addressDetails.contactPhone || '۰۹۱۲۳۴۵۶۷۸۹',
      district: addressDetails.district || 'سعادت‌آباد',
      address: addressDetails.fullAddress || 'خیابان سرو، پلاک ۲۴، واحد ۳',
      date: dateLabel,
      timeSlot: selectedTimeSlot?.label || '۱۰:۰۰ تا ۱۲:۰۰ (صبح)',
      priceTotal: paymentReceipt ? Math.round(paymentReceipt.amountInRials / 10) : 600000,
      paymentMethod: 'ONLINE',
      details: {
        'مدت کار': '۴ ساعت',
        'ترجیح نیروی کار': 'خانم / آقا',
      },
      status: 'OPEN',
    },
    {
      id: 'ORD-2026-8812',
      serviceId: 'hourly_labor',
      serviceTitle: 'کارگر ساعتی (جابجایی اثاثیه و تخلیه انبار)',
      roleRequired: 'hourly_laborer',
      badge: 'ساعتی',
      customerName: 'محمد کاظمی',
      phone: '۰۹۱۲۹۸۷۶۵۴۳',
      district: 'شهرک غرب',
      address: 'بلوار دادمان، خیابان درختی، پلاک ۱۲',
      date: 'فردا - ۲۸ شهریور',
      timeSlot: '۰۸:۰۰ تا ۱۱:۰۰ (صبح زود)',
      priceTotal: 440000,
      paymentMethod: 'ONLINE',
      details: {
        'تعداد نیرو': '۲ نفر کارگر',
        'مدت کار': '۳ ساعت',
        'تهیه ابزار': 'بله (+۸۰,۰۰۰ تومان)',
      },
      status: 'OPEN',
    },
    {
      id: 'ORD-2026-7734',
      serviceId: 'building_painting',
      serviceTitle: 'نقاشی کامل ساختمان (پذیرایی و اتاق‌ها)',
      roleRequired: 'painter',
      badge: 'متراژی',
      customerName: 'رضا حدادی',
      phone: '۰۹۳۵۱۱۱۲۲۳۳',
      district: 'نیاوران',
      address: 'خیابان باهنر، کوچه یاس، پلاک ۸، واحد ۵',
      date: 'شنبه - ۲۹ شهریور',
      timeSlot: '۰۹:۰۰ تا ۱۷:۰۰ (تمام وقت)',
      priceTotal: 5100000,
      paymentMethod: 'CASH',
      details: {
        'متراژ تقریبی': '۶۰ متر مربع',
        'نوع رنگ': 'رنگ وینیل ضدآب',
        'تهیه رنگ': 'توسط پاکشو',
        'بتونه‌کاری': 'بتونه‌کاری کامل دیوار',
      },
      status: 'OPEN',
    },
    {
      id: 'ORD-2026-6651',
      serviceId: 'sofa_carpet_washing',
      serviceTitle: 'مبل‌شویی و شستشوی تشک در محل',
      roleRequired: 'sofa_cleaner',
      badge: 'تعدادی',
      customerName: 'سارا نوری',
      phone: '۰۹۱۲۷۷۷۸۸۹۹',
      district: 'ونک',
      address: 'خیابان ملاصدرا، پلاک ۴۵، واحد ۲',
      date: 'یکشنبه - ۳۰ شهریور',
      timeSlot: '۱۱:۰۰ تا ۱۴:۰۰ (ظهر)',
      priceTotal: 850000,
      paymentMethod: 'ONLINE',
      details: {
        'تعداد نشیمن مبل': '۷ نفره',
        'تعداد تشک': '۲ عدد',
        'دستگاه خشک‌کن': 'همراه با دستگاه نازل و تزریق',
      },
      status: 'OPEN',
    },
    {
      id: 'ORD-2026-5522',
      serviceId: 'home_unit_cleaning',
      serviceTitle: 'نظافت کامل واحد ۱۲۰ متری',
      roleRequired: 'cleaner',
      badge: 'ساعتی',
      customerName: 'مریم ابراهیمی',
      phone: '۰۹۱۲۴۴۴۵۵۶۶',
      district: 'پونک',
      address: 'بلوار همیلا، خیابان استاد نظری، پلاک ۴',
      date: 'امروز - ۲۷ شهریور',
      timeSlot: '۱۴:۰۰ تا ۱۸:۰۰ (عصر)',
      priceTotal: 720000,
      paymentMethod: 'ONLINE',
      details: {
        'مدت کار': '۴ ساعت',
        'دیوارشویی': 'بله',
        'مواد شوینده': 'توسط مشتری',
      },
      status: 'OPEN',
    },
  ];

  const filteredOrders = mockOrders.filter((order) => order.roleRequired === activeRole);

  const handleAcceptOrder = (orderId: string) => {
    if (!acceptedOrders.includes(orderId)) {
      setAcceptedOrders([...acceptedOrders, orderId]);
    }
  };

  return (
    <div className="space-y-4 text-right pb-6 font-sans">
      {/* هدر پنل متخصصین */}
      <div className="bg-gradient-to-r from-slate-900 to-sky-950 text-white rounded-2xl p-4 shadow-md border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold">پورتال متخصصین و نیروهای کاری</h3>
          </div>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
            وضعیت: آماده پذیرش کار
          </span>
        </div>
        <p className="text-xs text-slate-300">مشاهده مشخصات کامل درخواست‌ها و انتخاب سفارشات مرتبط با تخصص شما</p>
      </div>

      {/* سوییچ حالت: سفارش‌های در انتظار پذیرش / بازارگاه متخصصین */}
      <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex gap-1">
        <button
          onClick={() => setPortalView('orders')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            portalView === 'orders' ? 'bg-sky-600 text-white shadow' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>سفارش‌های در انتظار پذیرش</span>
        </button>
        <button
          onClick={() => setPortalView('cleaners')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            portalView === 'cleaners' ? 'bg-sky-600 text-white shadow' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>فهرست و بازارگاه متخصصین</span>
        </button>
      </div>

      {portalView === 'cleaners' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <CleanersScreen />
        </div>
      ) : (
        <>
          {/* انتخاب نقش/تخصص کاری */}
          <div className="bg-slate-100 p-1.5 rounded-xl border border-slate-200">
        <p className="text-[11px] font-bold text-slate-600 mb-1.5 px-1">تخصص شما چیست؟ (نقش کاری)</p>
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={() => setActiveRole('cleaner')}
            className={`py-2 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeRole === 'cleaner' ? 'bg-sky-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>نظافتچی</span>
          </button>
          <button
            onClick={() => setActiveRole('sofa_cleaner')}
            className={`py-2 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeRole === 'sofa_cleaner' ? 'bg-teal-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Sofa className="w-3.5 h-3.5" />
            <span>مبل‌شو</span>
          </button>
          <button
            onClick={() => setActiveRole('hourly_laborer')}
            className={`py-2 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeRole === 'hourly_laborer' ? 'bg-amber-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Hammer className="w-3.5 h-3.5" />
            <span>کارگر ساعتی</span>
          </button>
          <button
            onClick={() => setActiveRole('painter')}
            className={`py-2 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeRole === 'painter' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            <span>نقاش</span>
          </button>
        </div>
      </div>

      {/* بنر راهنمای تخصص */}
      <div className="bg-sky-50 border border-sky-200/80 rounded-xl p-3 flex items-start gap-2 text-sky-900 text-xs">
        <AlertCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">
            {activeRole === 'cleaner' && 'سفارش‌های نظافت منزل، واحد و دفاتر اداری'}
            {activeRole === 'sofa_cleaner' && 'سفارش‌های مبل‌شویی، فرش‌شویی و شستشوی تشک در محل'}
            {activeRole === 'hourly_laborer' && 'سفارش‌های جابجایی اثاثیه، بارگیری، تخلیه و کارهای سنگین'}
            {activeRole === 'painter' && 'سفارش‌های نقاشی ساختمان، رنگ‌آمیزی و بتونه‌کاری متراژی'}
          </span>
          <p className="text-[11px] text-sky-700 mt-0.5">
            مشخصات کامل هر درخواست را بررسی کرده و در صورت تمایل دکمه «قبول سفارش» را بزنید.
          </p>
        </div>
      </div>

      {/* لیست سفارشات قابل انتخاب */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500 space-y-1">
            <Briefcase className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold">سفارش جدیدی برای این تخصص ثبت نشده است</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isAccepted = acceptedOrders.includes(order.id);

            return (
              <div
                key={order.id}
                className={`bg-white border rounded-2xl p-4 space-y-3 transition shadow-sm ${
                  isAccepted ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-200'
                }`}
              >
                {/* هدر سفارش */}
                <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400">{order.id}</span>
                    <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {order.badge}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      isAccepted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {isAccepted ? 'قبول شده توسط شما' : 'آماده پذیرش'}
                  </span>
                </div>

                {/* عنوان و قیمت */}
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{order.serviceTitle}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{order.date} • {order.timeSlot}</span>
                    </p>
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-black text-emerald-600 block">
                      {order.priceTotal.toLocaleString('fa-IR')} تومان
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {order.paymentMethod === 'ONLINE' ? 'پرداخت شده آنلاین' : 'پرداخت نقدی در محل'}
                    </span>
                  </div>
                </div>

                {/* جزئیات مشخصات سفارش */}
                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span><strong className="text-slate-900">مشتری:</strong> {order.customerName}</span>
                    <span className="text-slate-400 font-mono text-[11px] mr-auto flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {order.phone}
                    </span>
                  </div>

                  <div className="flex items-start gap-1.5 text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-900">محل انجام کار:</strong> {order.district}، {order.address}
                    </span>
                  </div>

                  {/* ویژگی‌ها و درخواست‌های خاص سفارش */}
                  <div className="border-t border-slate-200/60 pt-1.5 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                    {Object.entries(order.details).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-1">
                        <span className="text-slate-400">• {key}:</span>
                        <span className="font-bold text-slate-800">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* دکمه اقدام سفارش */}
                <div className="pt-1 flex gap-2">
                  {!isAccepted ? (
                    <button
                      onClick={() => handleAcceptOrder(order.id)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>قبول این سفارش</span>
                    </button>
                  ) : (
                    <div className="w-full flex items-center justify-between bg-emerald-100 border border-emerald-300 rounded-xl p-2 text-xs text-emerald-900">
                      <span className="font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        سفارش در لیست ماموریت‌های شما ثبت شد
                      </span>
                      <button className="bg-emerald-600 text-white font-bold text-[11px] px-3 py-1 rounded-lg">
                        تکمیل شد
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
        </>
      )}
    </div>
  );
};
