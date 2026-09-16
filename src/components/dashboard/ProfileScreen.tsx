import React from 'react';
import { User, MapPin, Award, ChevronLeft } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';

export const ProfileScreen: React.FC = () => {
  const { addressDetails, customerTier, updateAddressField } = useBooking();

  const getTierBadge = () => {
    switch (customerTier) {
      case 'VIP':
        return { label: 'مشتری VIP (۸٪ تخفیف)', color: 'bg-amber-500 text-white' };
      case 'GOLD':
        return { label: 'مشتری طلایی (۵٪ تخفیف)', color: 'bg-amber-400 text-slate-900' };
      case 'SILVER':
        return { label: 'مشتری نقره‌ای (۳٪ تخفیف)', color: 'bg-slate-300 text-slate-900' };
      default:
        return { label: 'مشتری جدید', color: 'bg-sky-100 text-sky-800 border border-sky-300' };
    }
  };

  const tierInfo = getTierBadge();

  return (
    <div className="space-y-4 text-right pb-6">
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-lg">
          <User className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900">{addressDetails.recipientName || 'کاربر پاکشو'}</h3>
          <p className="text-xs text-slate-500">{addressDetails.contactPhone || 'شماره تماس ثبت نشده'}</p>
          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${tierInfo.color}`}>
            {tierInfo.label}
          </span>
        </div>
      </div>

      {/* اطلاعات آدرس پیش‌فرض */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <MapPin className="w-4 h-4 text-sky-600" />
          <h4 className="text-xs font-bold text-slate-800">آدرس منتخب فعلی</h4>
        </div>

        <div className="space-y-2 text-xs">
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">نام گیرنده / تحویل‌دهنده:</label>
            <input
              type="text"
              value={addressDetails.recipientName}
              onChange={(e) => updateAddressField('recipientName', e.target.value)}
              placeholder="مثال: محمد احمدی"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-sky-500 text-xs"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-500 block mb-1">شماره تماس:</label>
            <input
              type="text"
              value={addressDetails.contactPhone}
              onChange={(e) => updateAddressField('contactPhone', e.target.value)}
              placeholder="۰۹۱۲..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono text-left focus:outline-none focus:border-sky-500 text-xs"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-500 block mb-1">محله و آدرس کامل:</label>
            <input
              type="text"
              value={addressDetails.fullAddress}
              onChange={(e) => updateAddressField('fullAddress', e.target.value)}
              placeholder="خیابان، پلاک، واحد..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-sky-500 text-xs"
            />
          </div>
        </div>
      </div>

      {/* سایدبار اطلاعات باشگاه مشتریان */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          <div>
            <p className="font-bold text-slate-800">باشگاه مشتریان پاکشو</p>
            <p className="text-[10px] text-slate-500">با افزایش سفارشات تخفیف بیشتری بگیرید</p>
          </div>
        </div>
        <ChevronLeft className="w-4 h-4 text-slate-400" />
      </div>
    </div>
  );
};
