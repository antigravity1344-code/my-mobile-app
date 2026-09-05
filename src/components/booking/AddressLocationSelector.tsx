import React, { useState, useCallback } from 'react';
import { AddressDetails } from '../../types/booking';
import { getCurrentPosition } from '../../services/location';
import {
  MapPin,
  Phone,
  User,
  ChevronLeft,
  ChevronRight,
  Navigation,
  Compass,
  ArrowUpCircle,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react';

const POPULAR_DISTRICTS = [
  'سعادت‌آباد',
  'شهرک غرب',
  'پونک',
  'نیاوران',
  'ونک',
  'تهران‌پارس',
  'صادقیه',
  'گیشا',
  'پاسداران',
  'مرزداران',
];

interface AddressLocationSelectorProps {
  addressDetails: AddressDetails;
  onUpdateField: <K extends keyof AddressDetails>(field: K, value: AddressDetails[K]) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const AddressLocationSelector: React.FC<AddressLocationSelectorProps> = ({
  addressDetails,
  onUpdateField,
  onNext,
  onPrev,
}) => {
  const [districtSearch, _setDistrictSearch] = useState('');
  const [, setTouched] = useState({
    fullAddress: false,
    plaque: false,
    unit: false,
    contactPhone: false,
    recipientName: false,
  });

  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [, setGpsError] = useState<string | null>(null);

  const handleGetCurrentLocation = useCallback(async () => {
    setGpsStatus('loading');
    setGpsError(null);
    try {
      const coords = await getCurrentPosition();
      if (coords) {
        onUpdateField('coordinates', coords);
        setGpsStatus('success');
      } else {
        setGpsError('نمی‌توان 現在 مکان شما را دریافت کرد. لطفاً مجوز موقعیت جغرافیایی را بررسی کنید.');
        setGpsStatus('error');
      }
    } catch {
      setGpsError('خطا در دریافت موقعیت. لطفاً دوباره امتحان کنید.');
      setGpsStatus('error');
    }
  }, [onUpdateField]);

  const isPhoneValid = /^09[0-9]{9}$/.test(addressDetails.contactPhone.trim());
  const isAddressValid = addressDetails.fullAddress.trim().length >= 8;
  const isPlaqueValid = addressDetails.plaque.trim().length >= 1;
  const isRecipientValid = addressDetails.recipientName.trim().length >= 3;

  const isFormValid = isPhoneValid && isAddressValid && isPlaqueValid && isRecipientValid;

  const filteredDistricts = POPULAR_DISTRICTS.filter((d) =>
    d.includes(districtSearch.trim())
  );

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-sky-600" />
          <span>۳. موقعیت مکانی، آدرس و مشخصات تحویل‌گیرنده</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
          موقعیت خود را روی نقشه مشخص نموده و آدرس دقیق و شماره همراه جهت هماهنگی با متخصص را وارد کنید.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-sky-600" />
            <span>تعیین پین موقعیت روی نقشه:</span>
          </span>
          <span className="text-[11px] text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full font-medium">
            منطقه فعال: {addressDetails.district}
          </span>
        </div>

        <div className="relative w-full h-56 sm:h-64 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner group select-none">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-sky-50/50 to-emerald-50/30 flex flex-col justify-between p-4">
            <div className="relative z-10 flex justify-between items-start">
              <div className="bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-sky-600 animate-pulse" />
                <span className="text-[11px] font-bold text-slate-800">
                  {addressDetails.district}، تهران
                </span>
              </div>

              <button
                type="button"
                onClick={handleGetCurrentLocation}
                disabled={gpsStatus === 'loading'}
                className="bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                {gpsStatus === 'loading' ? (
                  <>
                    <Loader2 className="w-3 h-3 text-sky-600 animate-spin" />
                    <span>در حال دریافت...</span>
                  </>
                ) : gpsStatus === 'success' ? (
                  <>
                    <MapPin className="w-3 h-3 text-emerald-600" />
                    <span>موقعیت دریافت شد</span>
                  </>
                ) : gpsStatus === 'error' ? (
                  <>
                    <AlertCircle className="w-3 h-3 text-red-500" />
                    <span>موفق نیست</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-3 h-3 text-sky-600" />
                    <span>موقعیت من (GPS)</span>
                  </>
                )}
              </button>
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-20 flex flex-col items-center pointer-events-none">
              <div className="bg-slate-900 text-white text-[10px] font-bold py-1 px-2.5 rounded-full shadow-lg mb-1 whitespace-nowrap animate-bounce">
                محل اعزام متخصص پاکشو
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-xl ring-4 ring-white">
                  <MapPin className="w-6 h-6 fill-current" />
                </div>
                <div className="w-3 h-1 bg-slate-800/40 rounded-full blur-[1px] mx-auto mt-1"></div>
              </div>
            </div>

            <div className="relative z-10 flex justify-between items-end">
              <span className="text-[10px] font-mono text-slate-500 bg-white/80 px-2 py-0.5 rounded-md backdrop-blur">
                Lat: {addressDetails.coordinates.latitude.toFixed(4)}, Lng: {addressDetails.coordinates.longitude.toFixed(4)}
              </span>
              <span className="text-[10px] text-slate-600 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs font-medium">
                نقشه را برای دقت بیشتر جابجا کنید
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 block">
          انتخاب یا جستجوی محله:
        </label>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
          {filteredDistricts.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onUpdateField('district', d)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition border cursor-pointer ${
                addressDetails.district === d
                  ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            نشانی دقیق (خیابان، کوچه، بن‌بست): *
          </label>
          <textarea
            rows={2}
            value={addressDetails.fullAddress}
            onChange={(e) => onUpdateField('fullAddress', e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, fullAddress: true }))}
            placeholder="مثال: خیابان سرو غربی، خیابان بخشایش، کوچه پانزدهم شرقی"
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 resize-none leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">پلاک: *</label>
            <input
              type="text"
              value={addressDetails.plaque}
              onChange={(e) => onUpdateField('plaque', e.target.value)}
              placeholder="مثال: ۲۴"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-center"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">واحد:</label>
            <input
              type="text"
              value={addressDetails.unit}
              onChange={(e) => onUpdateField('unit', e.target.value)}
              placeholder="مثال: ۳"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-center"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">طبقه:</label>
            <input
              type="text"
              value={addressDetails.floor || ''}
              onChange={(e) => onUpdateField('floor', e.target.value)}
              placeholder="مثال: دوم"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-center"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">وضعیت آسانسور:</label>
            <button
              type="button"
              onClick={() => onUpdateField('hasElevator', !addressDetails.hasElevator)}
              className={`w-full p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                addressDetails.hasElevator
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>{addressDetails.hasElevator ? 'دارد' : 'ندارد'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-sky-600" />
            <span>نام تحویل‌گیرنده: *</span>
          </label>
          <input
            type="text"
            value={addressDetails.recipientName}
            onChange={(e) => onUpdateField('recipientName', e.target.value)}
            placeholder="مثال: علی رضایی"
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-sky-600" />
            <span>شماره موبایل هماهنگی: *</span>
          </label>
          <input
            type="tel"
            maxLength={11}
            value={addressDetails.contactPhone}
            onChange={(e) => onUpdateField('contactPhone', e.target.value)}
            placeholder="09123456789"
            dir="ltr"
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-right"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>راهنمای ورود یا پارک (اختیاری):</span>
          </label>
          <input
            type="text"
            value={addressDetails.addressNotes || ''}
            onChange={(e) => onUpdateField('addressNotes', e.target.value)}
            placeholder="مثال: زنگ واحد ۳، طبقه دوم"
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={addressDetails.isSaved ?? true}
            onChange={(e) => onUpdateField('isSaved', e.target.checked)}
            className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
          />
          <span className="text-xs font-medium text-slate-700">
            ذخیره این آدرس در دفترچه آدرس‌های من
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onPrev}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
          <span>مرحله قبل</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!isFormValid}
          className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
        >
          <span>تایید و مشاهده پیش‌فاکتور</span>
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
