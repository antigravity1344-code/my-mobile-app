import { getCurrentPosition, requestLocationPermission } from '../../services/location';
import { AddressDetails } from '../../types/booking';
import { getAddressValidationErrors, isValidAddress } from '../../utils/bookingValidation';
import { gpsStatusCopy, resolveGpsFix, type GpsUiStatus } from './gpsUi';

import React, { useState, useCallback } from 'react';

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
  const [districtSearch, setDistrictSearch] = useState('');
  const [, setTouched] = useState({
    fullAddress: false,
    plaque: false,
    unit: false,
    contactPhone: false,
    recipientName: false,
  });

  const [gpsStatus, setGpsStatus] = useState<GpsUiStatus>('idle');
  const [gpsDetail, setGpsDetail] = useState<string | null>(null);
  const validationErrors = getAddressValidationErrors(addressDetails);
  const gpsCopy = gpsStatusCopy(gpsStatus, gpsDetail);

  const handleGetCurrentLocation = useCallback(async () => {
    setGpsStatus('loading');
    setGpsDetail(null);
    const outcome = await resolveGpsFix({
      requestPermission: requestLocationPermission,
      getPosition: getCurrentPosition,
      onLateCoordinates: (coordinates) => {
        onUpdateField('coordinates', coordinates);
        setGpsStatus('success');
        setGpsDetail(null);
      },
    });
    if (outcome.coordinates) onUpdateField('coordinates', outcome.coordinates);
    setGpsStatus(outcome.coordinates ? 'success' : outcome.status);
    setGpsDetail(outcome.message ?? null);
  }, [onUpdateField]);

  const isFormValid = isValidAddress(addressDetails);

  const filteredDistricts = POPULAR_DISTRICTS.filter((d) => d.includes(districtSearch.trim()));

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#0C786E]" />
          <span>۳. موقعیت مکانی، آدرس و مشخصات تحویل‌گیرنده</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
          موقعیت خود را روی نقشه مشخص نموده و آدرس دقیق و شماره همراه جهت هماهنگی با متخصص را وارد
          کنید.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-[#0C786E]" />
            <span>تعیین پین موقعیت روی نقشه:</span>
          </span>
          <span className="text-[11px] text-[#0C786E] bg-[#F2FBFA] px-2 py-0.5 rounded-full font-medium">
            منطقه فعال: {addressDetails.district || 'انتخاب نشده'}
          </span>
        </div>

        <div className="relative w-full h-56 sm:h-64 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner group select-none">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-[#F2FBFA]/50 to-emerald-50/30 flex flex-col justify-between p-4">
            <div className="relative z-10 flex justify-between items-start">
              <div className="bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-[#0C786E] animate-pulse" />
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
                    <Loader2 className="w-3 h-3 text-[#0C786E] animate-spin" />
                    <span>در حال پیدا کردن...</span>
                  </>
                ) : gpsStatus === 'success' ? (
                  <>
                    <MapPin className="w-3 h-3 text-[#047857]" />
                    <span>موقعیت ثبت شد</span>
                  </>
                ) : gpsStatus === 'denied' || gpsStatus === 'empty' || gpsStatus === 'timeout' ? (
                  <>
                    <AlertCircle className="w-3 h-3 text-[#B91C1C]" />
                    <span>تلاش دوباره</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-3 h-3 text-[#0C786E]" />
                    <span>موقعیت من</span>
                  </>
                )}
              </button>
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-20 flex flex-col items-center pointer-events-none">
              <div className="bg-slate-900 text-white text-[10px] font-bold py-1 px-2.5 rounded-full shadow-lg mb-1 whitespace-nowrap animate-bounce">
                محل اعزام متخصص پاکشو
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-[#0A5E56] text-white flex items-center justify-center shadow-xl ring-4 ring-white">
                  <MapPin className="w-6 h-6 fill-current" />
                </div>
                <div className="w-3 h-1 bg-slate-800/40 rounded-full blur-[1px] mx-auto mt-1"></div>
              </div>
            </div>

            <div className="relative z-10 flex justify-between items-end">
              <span className="text-[10px] font-mono text-slate-500 bg-white/80 px-2 py-0.5 rounded-md backdrop-blur">
                Lat: {addressDetails.coordinates.latitude.toFixed(4)}, Lng:{' '}
                {addressDetails.coordinates.longitude.toFixed(4)}
              </span>
              <span className="text-[10px] text-slate-600 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs font-medium">
                نقشه را برای دقت بیشتر جابجا کنید
              </span>
            </div>
          </div>
        </div>
      </div>

      {gpsCopy ? (
        <div
          className={`rounded-2xl border p-3 text-right text-xs leading-relaxed ${
            gpsStatus === 'success'
              ? 'border-[#A9E3DB] bg-[#F2FBFA] text-[#084842]'
              : gpsStatus === 'loading'
                ? 'border-[#E4CFAA] bg-[#FBF3E8] text-[#44403C]'
                : 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
          }`}
          role={gpsStatus === 'loading' ? 'status' : 'alert'}
        >
          <p className="font-bold">{gpsCopy.title}</p>
          <p className="mt-1">{gpsCopy.body}</p>
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed text-[#78716C]">
          اگر موقعیت را نمی‌خواهید، محله و نشانی را دستی بنویسید. سفارش بدون مختصات هم ثبت می‌شود.
        </p>
      )}

      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 block">انتخاب یا جستجوی محله:</label>
        <input
          type="search"
          value={districtSearch}
          onChange={(e) => setDistrictSearch(e.target.value)}
          placeholder="جستجوی محله"
          className={`w-full rounded-xl border bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0A5E56] focus:outline-none focus:ring-2 focus:ring-[#0A5E56]/20 ${validationErrors.district ? 'border-red-300' : 'border-slate-200'}`}
        />
        {validationErrors.district && (
          <p className="text-[11px] text-red-600 font-medium">{validationErrors.district}</p>
        )}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
          {filteredDistricts.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onUpdateField('district', d)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition border cursor-pointer ${
                addressDetails.district === d
                  ? 'bg-[#0A5E56] text-white border-[#0A5E56] shadow-xs'
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
            className={`w-full rounded-xl border bg-white p-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0A5E56] focus:outline-none focus:ring-2 focus:ring-[#0A5E56]/20 resize-none leading-relaxed ${validationErrors.fullAddress ? 'border-red-300' : 'border-slate-200'}`}
          />
          {validationErrors.fullAddress && (
            <p className="text-[11px] text-red-600 font-medium">{validationErrors.fullAddress}</p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="address-plaque" className="text-xs font-bold text-slate-700 block">
              پلاک: *
            </label>
            <input
              id="address-plaque"
              type="text"
              value={addressDetails.plaque}
              onChange={(e) => onUpdateField('plaque', e.target.value)}
              placeholder="مثال: ۲۴"
              className={`w-full rounded-xl border bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0A5E56] focus:outline-none focus:ring-2 focus:ring-[#0A5E56]/20 text-center ${validationErrors.plaque ? 'border-red-300' : 'border-slate-200'}`}
            />
            {validationErrors.plaque && (
              <p className="text-[10px] text-red-600 font-medium mt-1">{validationErrors.plaque}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="address-unit" className="text-xs font-bold text-slate-700 block">
              واحد:
            </label>
            <input
              id="address-unit"
              type="text"
              value={addressDetails.unit}
              onChange={(e) => onUpdateField('unit', e.target.value)}
              placeholder="مثال: ۳"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0A5E56] focus:outline-none focus:ring-2 focus:ring-[#0A5E56]/20 text-center"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">طبقه:</label>
            <input
              type="text"
              value={addressDetails.floor || ''}
              onChange={(e) => onUpdateField('floor', e.target.value)}
              placeholder="مثال: دوم"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0A5E56] focus:outline-none focus:ring-2 focus:ring-[#0A5E56]/20 text-center"
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
            <User className="w-3.5 h-3.5 text-[#0C786E]" />
            <span>نام و نام خانوادگی: *</span>
          </label>
          <input
            type="text"
            value={addressDetails.recipientName}
            onChange={(e) => onUpdateField('recipientName', e.target.value)}
            placeholder="مثال: علی رضایی"
            className={`w-full rounded-xl border bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0A5E56] focus:outline-none focus:ring-2 focus:ring-[#0A5E56]/20 ${validationErrors.recipientName ? 'border-red-300' : 'border-slate-200'}`}
          />
          {validationErrors.recipientName && (
            <p className="text-[11px] text-red-600 font-medium">{validationErrors.recipientName}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-[#0C786E]" />
            <span>شماره موبایل: *</span>
          </label>
          <input
            type="tel"
            maxLength={11}
            value={addressDetails.contactPhone}
            onChange={(e) => onUpdateField('contactPhone', e.target.value)}
            placeholder="مثال: ۰۹۱۲۳۴۵۶۷۸۹"
            dir="ltr"
            className={`w-full rounded-xl border bg-white p-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:border-[#0A5E56] focus:outline-none focus:ring-2 focus:ring-[#0A5E56]/20 text-right ${validationErrors.contactPhone ? 'border-red-300' : 'border-slate-200'}`}
          />
          {validationErrors.contactPhone && (
            <p className="text-[11px] text-red-600 font-medium">{validationErrors.contactPhone}</p>
          )}
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
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0A5E56] focus:outline-none focus:ring-2 focus:ring-[#0A5E56]/20"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={addressDetails.isSaved ?? true}
            onChange={(e) => onUpdateField('isSaved', e.target.checked)}
            className="w-4 h-4 rounded text-[#0C786E] focus:ring-sky-500 border-slate-300"
          />
          <span className="text-xs font-medium text-slate-700">
            ذخیره این آدرس در دفترچه آدرس‌های من
          </span>
        </label>
      </div>

      <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-[#E8DCCE] bg-[#FFFBF6]/95 pt-4 backdrop-blur">
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
          className="flex items-center gap-1.5 rounded-xl bg-[#0A5E56] px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#084842] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
        >
          <span>{isFormValid ? 'تایید و مشاهده پیش‌فاکتور' : 'نشانی را کامل کنید'}</span>
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
