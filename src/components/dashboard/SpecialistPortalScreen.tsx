import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useOrders } from '../../features/orders';
import { useProfile } from '../../features/profile';
import { CleanersScreen } from '../../features/cleaners';
import { apiFetch } from '../../api/apiClient';
import { appStorage } from '../../utils/storage';

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

function roleForService(serviceId: string): SpecialistRole {
  if (serviceId === 'hourly_labor') return 'hourly_laborer';
  if (serviceId === 'building_painting') return 'painter';
  if (serviceId === 'sofa_carpet_washing') return 'sofa_cleaner';
  return 'cleaner';
}

function mapApiOrderToOpenOrder(order: any): OpenOrder {
  const serviceId = order.serviceId || 'home_unit_cleaning';
  const addressText =
    typeof order.address === 'string'
      ? order.address
      : order.address?.fullAddress || '';
  const district =
    (typeof order.address === 'object' && order.address?.district) ||
    (typeof addressText === 'string'
      ? addressText.split('،')[0] || addressText.split(' ')[0]
      : '') ||
    '—';

  let status: OpenOrder['status'] = 'OPEN';
  if (order.status === 'ACCEPTED' || order.status === 'ASSIGNED') status = 'ACCEPTED';
  else if (order.status === 'IN_PROGRESS') status = 'IN_PROGRESS';
  else if (order.status === 'COMPLETED') status = 'COMPLETED';
  else status = 'OPEN';

  const details: Record<string, string | number | boolean> = {};
  if (order.serviceOptions && typeof order.serviceOptions === 'object') {
    for (const [k, v] of Object.entries(order.serviceOptions)) {
      if (v !== undefined && v !== null) details[k] = v as string | number | boolean;
    }
  } else if (order.notes) {
    details['توضیحات'] = String(order.notes);
  }

  return {
    id: order.id,
    serviceId,
    serviceTitle: order.serviceTitle || 'سفارش',
    roleRequired: roleForService(serviceId),
    badge:
      order.pricingType === 'hourly'
        ? 'ساعتی'
        : order.pricingType === 'per_sqm'
          ? 'متراژی'
          : order.badge || 'سفارش',
    customerName: order.customerName || order.address?.recipientName || '—',
    phone: order.customerPhone || order.address?.contactPhone || '—',
    district,
    address: addressText || '—',
    date: order.date || '—',
    timeSlot: order.time || order.timeSlot?.label || '—',
    priceTotal: order.price || order.pricing?.total || 0,
    paymentMethod: order.paymentMethod === 'ONLINE' ? 'ONLINE' : 'CASH',
    details,
    status,
  };
}

function readStoredUserId(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null && 'id' in (raw as any)) {
    return String((raw as any).id || '');
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed?.id ? String(parsed.id) : '';
    } catch {
      return '';
    }
  }
  return '';
}

export const SpecialistPortalScreen: React.FC = () => {
  const { refreshOrders } = useOrders();
  const { profile } = useProfile();
  const [activeRole, setActiveRole] = useState<SpecialistRole>('cleaner');
  const [portalView, setPortalView] = useState<'orders' | 'cleaners'>('orders');
  const [availableOrdersRaw, setAvailableOrdersRaw] = useState<any[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [workerUserId, setWorkerUserId] = useState<string>('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const workerRaw = await appStorage.getItem<unknown>('PAKSHO_USER_WORKER', null);
      const customerRaw = await appStorage.getItem<unknown>('PAKSHO_USER_CUSTOMER', null);
      let id = readStoredUserId(workerRaw);
      if (!id) id = profile.id || '';
      if (!id) id = readStoredUserId(customerRaw);
      if (alive) setWorkerUserId(id);
    })();
    return () => {
      alive = false;
    };
  }, [profile.id]);

  const loadAvailable = useCallback(async () => {
    setLoadingAvailable(true);
    setLoadError(null);
    try {
      const availRes = await apiFetch('/orders/available');
      if (availRes.success && Array.isArray(availRes.orders)) {
        setAvailableOrdersRaw(availRes.orders);
      } else {
        setAvailableOrdersRaw([]);
        setLoadError(availRes.message || availRes.error || 'سفارش بازی از سرور دریافت نشد.');
      }
    } catch {
      setAvailableOrdersRaw([]);
      setLoadError('خطا در ارتباط با سرور برای سفارش‌های باز.');
    } finally {
      setLoadingAvailable(false);
    }
  }, []);

  useEffect(() => {
    void loadAvailable();
  }, [loadAvailable]);

  const filteredOrders = useMemo(() => {
    return availableOrdersRaw
      .map(mapApiOrderToOpenOrder)
      .filter((order) => order.roleRequired === activeRole && order.status === 'OPEN');
  }, [availableOrdersRaw, activeRole]);

  const handleAcceptOrder = async (orderId: string) => {
    if (!workerUserId) {
      setLoadError('شناسه متخصص واقعی پیدا نشد. با حساب متخصص وارد شوید.');
      return;
    }
    setAcceptingId(orderId);
    setLoadError(null);
    try {
      const res = await apiFetch('/orders/' + encodeURIComponent(orderId) + '/accept', {
        method: 'PUT',
        body: JSON.stringify({ cleanerId: workerUserId }),
      });
      if (res.success) {
        await loadAvailable();
        void refreshOrders();
      } else {
        setLoadError(res.message || res.error || 'پذیرش سفارش ناموفق بود.');
      }
    } catch {
      setLoadError('خطا در پذیرش سفارش.');
    } finally {
      setAcceptingId(null);
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
        {loadingAvailable ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500 space-y-1">
            <Briefcase className="w-8 h-8 text-slate-300 mx-auto animate-pulse" />
            <p className="text-xs font-bold">در حال بارگذاری سفارش‌ها...</p>
          </div>
        ) : loadError ? (
          <div className="bg-white border border-dashed border-rose-300 rounded-2xl p-6 text-center text-rose-600 space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-xs font-bold">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadAvailable()}
              className="text-[11px] font-bold text-sky-700 underline cursor-pointer"
            >
              تلاش مجدد
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500 space-y-1">
            <Briefcase className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold">سفارش بازی برای این تخصص نیست.</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isAccepted = order.status === 'ACCEPTED' || order.status === 'IN_PROGRESS' || order.status === 'COMPLETED';

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
                      type="button"
                      onClick={() => void handleAcceptOrder(order.id)}
                      disabled={acceptingId === order.id || !workerUserId}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{acceptingId === order.id ? 'در حال پذیرش...' : 'قبول این سفارش'}</span>
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
