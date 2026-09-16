import React, { useState } from 'react';
import {
  ShieldAlert,
  DollarSign,
  Package,
  TrendingUp,
  UserCheck,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { SERVICES_CATALOG } from '../../config/servicesData';

export const AdminPanelScreen: React.FC = () => {
  const { paymentReceipt, addressDetails } = useBooking();
  const [adminTab, setAdminTab] = useState<'orders' | 'cleaners' | 'services'>('orders');

  // داده‌های نمونه متخصصین
  const cleanersList = [
    { id: 'cl-101', name: 'مریم حسینی', rating: 4.9, completedOrders: 142, status: 'فعال / آماده به کار', phone: '۰۹۱۲۱۱۱۱۱۱۱' },
    { id: 'cl-102', name: 'رضا کریمی', rating: 4.8, completedOrders: 98, status: 'در حال انجام ماموریت', phone: '۰۹۱۲۲۲۲۲۲۲۲' },
    { id: 'cl-103', name: 'زهرا موسوی', rating: 5.0, completedOrders: 210, status: 'فعال / آماده به کار', phone: '۰۹۱۲۳۳۳۳۳۳۳' },
  ];

  return (
    <div className="space-y-4 text-right pb-6 font-sans">
      {/* هدر پنل مدیریت */}
      <div className="bg-slate-800 text-white rounded-2xl p-4 shadow-md border border-slate-700 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold">پنل مدیریت پاکشو (Admin)</h3>
          </div>
          <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full font-bold">
            دسترسی مدیر ارشد
          </span>
        </div>
        <p className="text-xs text-slate-300">مدیریت سفارش‌ها، متخصصین نظافت، قیمت‌گذاری و گزارشات مالی</p>
      </div>

      {/* کارت‌های خلاصه آمار */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-right space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px]">درآمد کل</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-xs font-bold text-slate-800">۱۲,۴۵۰,۰۰۰ تومان</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-right space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px]">سفارش‌ها</span>
            <Package className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <p className="text-xs font-bold text-slate-800">۴۸ سفارش</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-right space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px]">رضایت</span>
            <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-xs font-bold text-slate-800">۹۸.۴٪</p>
        </div>
      </div>

      {/* منوی تب‌های پنل مدیریت */}
      <div className="flex border-b border-slate-200 text-xs font-medium gap-2">
        <button
          onClick={() => setAdminTab('orders')}
          className={`pb-2 px-1 transition border-b-2 cursor-pointer ${
            adminTab === 'orders' ? 'border-sky-600 text-sky-600 font-bold' : 'border-transparent text-slate-500'
          }`}
        >
          سفارش‌ها
        </button>
        <button
          onClick={() => setAdminTab('cleaners')}
          className={`pb-2 px-1 transition border-b-2 cursor-pointer ${
            adminTab === 'cleaners' ? 'border-sky-600 text-sky-600 font-bold' : 'border-transparent text-slate-500'
          }`}
        >
          متخصصین ({cleanersList.length})
        </button>
        <button
          onClick={() => setAdminTab('services')}
          className={`pb-2 px-1 transition border-b-2 cursor-pointer ${
            adminTab === 'services' ? 'border-sky-600 text-sky-600 font-bold' : 'border-transparent text-slate-500'
          }`}
        >
          خدمات و تعرفه‌ها
        </button>
      </div>

      {/* تب ۱: مدیریت سفارش‌ها */}
      {adminTab === 'orders' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl text-xs">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="جستجو با شماره سفارش یا نام..."
              className="bg-transparent text-xs w-full focus:outline-none"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-sm">
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono text-slate-500 font-bold">
                {paymentReceipt ? paymentReceipt.orderId : 'ORD-2026-9041'}
              </span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {paymentReceipt?.status === 'PAID' ? 'پرداخت شده - آماده تخصیص' : 'جدید / در انتظار'}
              </span>
            </div>

            <div className="text-xs space-y-1 text-slate-700 border-t border-slate-100 pt-2">
              <p><span className="text-slate-400">مشتری:</span> {addressDetails.recipientName || 'کاربر نمونه'}</p>
              <p><span className="text-slate-400">تلفن:</span> {addressDetails.contactPhone || '۰۹۱۲۰۰۰۰۰۰۰'}</p>
              <p><span className="text-slate-400">محله:</span> {addressDetails.district}</p>
            </div>

            <div className="flex gap-2 border-t border-slate-100 pt-2">
              <button className="flex-1 bg-sky-600 text-white text-[11px] font-bold py-1.5 rounded-lg cursor-pointer text-center">
                تخصیص متخصص
              </button>
              <button className="bg-slate-100 text-slate-700 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer">
                جزئیات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* تب ۲: مدیریت متخصصین */}
      {adminTab === 'cleaners' && (
        <div className="space-y-2.5">
          {cleanersList.map((cleaner) => (
            <div key={cleaner.id} className="bg-white border border-slate-200 rounded-xl p-3 flex justify-between items-center text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-sky-600" />
                  <span className="font-bold text-slate-800">{cleaner.name}</span>
                </div>
                <p className="text-[10px] text-slate-500">سفارش‌های موفق: {cleaner.completedOrders} • امتیاز: {cleaner.rating} ⭐</p>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-lg border border-emerald-200">
                {cleaner.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* تب ۳: خدمات و تعرفه‌ها */}
      {adminTab === 'services' && (
        <div className="space-y-2.5">
          {SERVICES_CATALOG.map((svc) => (
            <div key={svc.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800">{svc.title}</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{svc.badge}</span>
              </div>
              <p className="text-[11px] text-slate-500">{svc.description}</p>
              <div className="flex justify-between items-center pt-1 text-[11px] text-sky-600 font-bold">
                <span>قیمت پایه: {svc.basePrice.toLocaleString('fa-IR')} تومان</span>
                <button className="text-slate-400 hover:text-sky-600">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
