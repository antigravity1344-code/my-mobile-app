import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  DollarSign,
  Package,
  TrendingUp,
  UserCheck,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../../api/apiClient';

export const AdminPanelScreen: React.FC = () => {
  const [adminTab, setAdminTab] = useState<'orders' | 'cleaners' | 'stats'>('orders');
  const [stats, setStats] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const statsRes = await apiFetch('/admin/stats');
      if (statsRes.success) setStats(statsRes.stats);

      const workersRes = await apiFetch('/admin/users?role=WORKER');
      if (workersRes.success) setWorkers(workersRes.users);

      const ordersRes = await apiFetch('/admin/orders');
      if (ordersRes.success) setOrders(ordersRes.orders);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCompleteOrder = async (orderId: string) => {
    setLoading(true);
    const res = await apiFetch('/admin/orders/' + orderId, {
      method: 'PUT',
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    setLoading(false);
    if (res.success) loadData();
  };

  const handleUpdateWorkerStatus = async (userId: string, status: string) => {
    setLoading(true);
    const res = await apiFetch(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    setLoading(false);
    if (res.success) {
      loadData();
    }
  };

  return (
    <div className="space-y-4 text-right pb-6 font-sans">
      {/* هدر پنل مدیریت */}
      <div className="bg-slate-800 text-white rounded-2xl p-4 shadow-md border border-slate-700 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold">داشبورد مدیریت پاکشو (Real Admin)</h3>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-1 rounded-full font-bold cursor-pointer hover:bg-sky-500/30"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            بروزرسانی
          </button>
        </div>
        <p className="text-xs text-slate-300">مدیریت سفارش‌ها، تایید مدارک متخصصین و نظارت مالی واقعی</p>
      </div>

      {/* کارت‌های خلاصه آمار متصل به بکند */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-right space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px]">درآمد کل</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-xs font-bold text-slate-800">
            {stats ? (stats.totalRevenue || 0).toLocaleString('fa-IR') : '-'} تومان
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-right space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px]">کل سفارش‌ها</span>
            <Package className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <p className="text-xs font-bold text-slate-800">
            {stats ? stats.totalOrders : 0} سفارش
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-right space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px]">انتظار تایید</span>
            <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-xs font-bold text-slate-800">
            {stats ? stats.pendingWorkersCount : 0} متخصص
          </p>
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
          سفارش‌ها ({orders.length})
        </button>
        <button
          onClick={() => setAdminTab('cleaners')}
          className={`pb-2 px-1 transition border-b-2 cursor-pointer ${
            adminTab === 'cleaners' ? 'border-sky-600 text-sky-600 font-bold' : 'border-transparent text-slate-500'
          }`}
        >
          متخصصین ({workers.length})
        </button>
      </div>

      {/* تب ۱: مدیریت سفارش‌ها */}
      {adminTab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">هیچ سفارشی ثبت نشده است.</p>
          ) : (
            orders.map((ord) => (
              <div key={ord.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-sm">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-slate-500 font-bold">{ord.id}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    ord.status === 'COMPLETED'
                      ? 'bg-sky-100 text-sky-800'
                      : ord.status === 'ACCEPTED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {ord.status === 'COMPLETED'
                      ? 'تکمیل شده'
                      : ord.status === 'ACCEPTED'
                        ? 'پذیرفته شده'
                        : 'در انتظار متخصص'}
                  </span>
                </div>

                <div className="text-xs space-y-1 text-slate-700 border-t border-slate-100 pt-2">
                  <p><span className="text-slate-400">خدمت:</span> {ord.serviceTitle}</p>
                  <p><span className="text-slate-400">مشتری:</span> {ord.customerName} ({ord.customerPhone})</p>
                  <p><span className="text-slate-400">آدرس:</span> {ord.address}</p>
                  {ord.cleanerName && (
                    <p><span className="text-slate-400">متخصص:</span> {ord.cleanerName}</p>
                  )}
                  {ord.completedAt && (
                    <p><span className="text-slate-400">زمان تکمیل:</span> {ord.completedAt}</p>
                  )}
                </div>
                {ord.status === 'ACCEPTED' && (
                  <button
                    type="button"
                    onClick={() => handleCompleteOrder(ord.id)}
                    disabled={loading}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    اتمام سفارش
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* تب ۲: مدیریت متخصصین و تایید مدارک */}
      {adminTab === 'cleaners' && (
        <div className="space-y-2.5">
          {workers.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">هیچ متخصصی ثبت نام نکرده است.</p>
          ) : (
            workers.map((cleaner) => (
              <div key={cleaner.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-sky-600" />
                    <div>
                      <span className="font-bold text-slate-800">{cleaner.name || 'متخصص جدید'}</span>
                      <p className="text-[10px] text-slate-500">تلفن: {cleaner.phone} | کد ملی: {cleaner.nationalId || 'نامشخص'}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                    cleaner.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {cleaner.status === 'APPROVED' ? 'تایید شده' : 'در انتظار بررسی'}
                  </span>
                </div>

                {cleaner.status !== 'APPROVED' ? (
                  <button
                    onClick={() => handleUpdateWorkerStatus(cleaner.id, 'APPROVED')}
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    تایید مدارک و فعال‌سازی حساب متخصص
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateWorkerStatus(cleaner.id, 'BLOCKED')}
                    className="w-full mt-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    غیرفعال‌سازی متخصص
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
