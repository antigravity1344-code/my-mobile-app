import { previewActive } from '../native/previewRuntime';
import { formatStoredAmount } from '../../features/orders/services/money';
import React, { useState, useEffect, useRef } from 'react';
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
import type { ApiAdminStats, ApiAdminUser, ApiOrder } from '../../api/types';

const ADMIN_ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'در انتظار متخصص',
  ACCEPTED: 'پذیرفته‌شده',
  CONFIRMED: 'تأیید شده',
  ASSIGNED: 'تخصیص متخصص',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'انجام شده',
  CANCELLED: 'لغو شده',
  CANCEL_REQUESTED: 'درخواست لغو در حال بررسی',
};

function adminOrderStatusLabel(status: string | null | undefined): string {
  if (status && ADMIN_ORDER_STATUS_LABEL[status]) return ADMIN_ORDER_STATUS_LABEL[status];
  return 'وضعیت نامشخص';
}

export const AdminPanelScreen: React.FC = () => {
  const [adminTab, setAdminTab] = useState<'orders' | 'cleaners' | 'policy'>('orders');
  const [completionPolicy,setCompletionPolicy]=useState<{version:number;mode:'customer_confirmation'|'worker_only'}|null>(null);
  const [completionMode,setCompletionMode]=useState<'customer_confirmation'|'worker_only'>('customer_confirmation');
  const [policyMessage,setPolicyMessage]=useState('');
  const [policyBusy, setPolicyBusy] = useState(false);
  const policyInFlight = useRef(false);
  const [stats, setStats] = useState<ApiAdminStats | null>(null);
  const [workers, setWorkers] = useState<ApiAdminUser[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const loadRequest = useRef(0);
  const [adminToken, setAdminToken] = useState('');
  const [password, setPassword] = useState('');
  const [completionError, setCompletionError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const actionInFlight = useRef(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const adminFetch = (endpoint: string, options: RequestInit = {}) =>
    apiFetch(endpoint, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${adminToken}`,
      },
    });

  const loadData = async () => {
    if (!adminToken) return;
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError('');
    const results = await Promise.allSettled([
      adminFetch('/admin/stats'),
      adminFetch('/admin/users?role=WORKER'),
      adminFetch('/admin/orders'),
    ]);
    if (request !== loadRequest.current) return;
    const errors: string[] = [];
    const labels = ['آمار', 'متخصصین', 'سفارش‌ها'];
    results.forEach((result, index) => {
      const data = result.status === 'fulfilled' ? result.value : null;
      const valid = data?.success && (index === 0 ? data.stats && typeof data.stats === 'object'
        : Array.isArray(index === 1 ? data.users : data.orders));
      if (!valid) {
        errors.push(labels[index] + ': ' + (data?.message || 'دریافت اطلاعات انجام نشد.'));
      } else if (index === 0) setStats(data.stats);
      else if (index === 1) setWorkers(data.users);
      else setOrders(data.orders);
    });
    setLoadError(errors.length ? errors.join(' ') + ' برای تلاش دوباره «بروزرسانی» را بزنید.' : '');
    setHasLoaded(true);
    setLoading(false);
  };

  useEffect(() => {
    if (adminToken) void loadData();
    return () => { loadRequest.current += 1; };
  }, [adminToken]);

  const handleAdminLogin = async () => {
    setLoginError(null);
    const res = await apiFetch('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (res.success && res.token) {
      setAdminToken(res.token);
      setPassword('');
    } else {
      setLoginError(res.message || 'ورود مدیر ناموفق بود.');
    }
  };

  const handleAdminLogout = async () => {
    if (adminToken) {
      await adminFetch('/admin/logout', { method: 'POST' });
    }
    loadRequest.current += 1;
    setAdminToken('');
    setLoadError('');
    setActionError('');
    setCompletionError('');
    setCompletionPolicy(null);
    setPolicyMessage('');
    setHasLoaded(false);
    setLoading(false);
    setStats(null);
    setWorkers([]);
    setOrders([]);
  };

  const handleCompleteOrder = async (order: ApiOrder, approve: boolean) => {
    if (previewActive()) { setCompletionError('ثبت واقعی در پیش‌نمایش مجاز نیست.'); return; }
    if (loading || order.completion?.status !== 'disputed') return;
    setLoading(true); setCompletionError('');
    try {
      const res = await adminFetch('/admin/orders/' + encodeURIComponent(order.id) + '/completion-decision', {
        method: 'PUT', body: JSON.stringify({ requestId: order.completion.requestId, approve }),
      });
      if (!res.success) setCompletionError(res.message || 'تصمیم ثبت نشد؛ سفارش را بازخوانی کنید.');
    } catch { setCompletionError('نتیجه ثبت مشخص نیست؛ سفارش را بازخوانی کنید.'); }
    finally { setLoading(false); void loadData(); }
  };

  const loadCompletionPolicy = async () => {
    if (policyInFlight.current) return;
    policyInFlight.current = true; setPolicyBusy(true); setCompletionPolicy(null);
    setPolicyMessage('در حال دریافت سیاست…');
    try {
      const result=await adminFetch('/admin/completion-policy');
      if(!result.success || !result.policy || !Number.isSafeInteger(result.policy.version) || !['customer_confirmation','worker_only'].includes(result.policy.mode)) throw new Error('پاسخ معتبر نیست.');
      setCompletionPolicy(result.policy);setCompletionMode(result.policy.mode);setPolicyMessage('سیاست جاری دریافت شد.');
    } catch {setCompletionPolicy(null);setPolicyMessage('دریافت نشد؛ اتصال مدیر را بررسی و دوباره تلاش کنید.');}
    finally { policyInFlight.current = false; setPolicyBusy(false); }
  };

  const saveCompletionPolicy = async () => {
    if(!completionPolicy || policyInFlight.current)return;
    policyInFlight.current = true; setPolicyBusy(true);
    setPolicyMessage('در حال ذخیره…');
    try {
      const result=await adminFetch('/admin/completion-policy',{method:'PUT',body:JSON.stringify({mode:completionMode,expectedVersion:completionPolicy.version})});
      if(!result.success || !result.policy) throw new Error(result.message || 'ذخیره انجام نشد.');
      setCompletionPolicy(result.policy);setPolicyMessage('ذخیره شد؛ درخواست‌های جدید از این روش پیروی می‌کنند.');
    } catch {setCompletionPolicy(null);setPolicyMessage('نتیجه ذخیره مشخص نیست؛ پیش از تلاش دوباره بازخوانی کنید.');}
    finally { policyInFlight.current = false; setPolicyBusy(false); }
  };

  const runStatusAction = async (endpoint: string, body: object) => {
    if (loading || actionInFlight.current) return;
    actionInFlight.current = true;
    setActionPending(true);
    setActionError('');
    try {
      const res = await adminFetch(endpoint, { method: 'PUT', body: JSON.stringify(body) });
      if (!res.success) setActionError(res.message || 'تغییر ثبت نشد؛ اطلاعات را بازخوانی کنید.');
    } catch {
      setActionError('نتیجه ثبت مشخص نیست؛ پیش از تلاش دوباره اطلاعات را بازخوانی کنید.');
    } finally {
      await loadData();
      actionInFlight.current = false;
      setActionPending(false);
    }
  };

  const handleConfirmCancel = (orderId: string) =>
    runStatusAction('/admin/orders/' + encodeURIComponent(orderId), { status: 'CANCELLED' });

  const handleUpdateWorkerStatus = (userId: string, status: string) =>
    runStatusAction('/admin/users/' + encodeURIComponent(userId) + '/status', { status });

  if (!adminToken) {
    return (
      <div className="mx-auto min-w-0 max-w-sm space-y-3 rounded-2xl border border-slate-700 bg-slate-800 p-4 text-right text-white [&_button]:min-h-11 [&_input]:min-h-11">
        <h3 className="text-base font-bold">ورود مدیر</h3>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
          placeholder="رمز مدیر"
        />
        {loginError ? <p className="text-xs text-rose-300">{loginError}</p> : null}
        <button
          type="button"
          onClick={() => void handleAdminLogin()}
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold"
        >
          ورود
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 text-right pb-6 font-sans [overflow-wrap:anywhere] [&_button]:min-h-11 [&_select]:min-h-11">
      {/* هدر پنل مدیریت */}
      <div className="bg-slate-800 text-white rounded-2xl p-4 shadow-md border border-slate-700 space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold">داشبورد مدیریت پاکشو (Real Admin)</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1 text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-1 rounded-full font-bold cursor-pointer hover:bg-sky-500/30"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              بروزرسانی
            </button>
            <button
              type="button"
              onClick={() => void handleAdminLogout()}
              disabled={actionPending || policyBusy}
              className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-1 rounded-full font-bold cursor-pointer"
            >
              خروج
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-300">مدیریت سفارش‌ها، تایید مدارک متخصصین و نظارت مالی واقعی</p>
      </div>

      {loading ? <p role="status" className="text-sm text-slate-600">در حال دریافت اطلاعات…</p> : null}
      {loadError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{loadError}</p> : null}

      {actionError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p> : null}
      {actionPending ? <p role="status" className="text-sm text-slate-600">در حال ثبت تغییر…</p> : null}
      {completionError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{completionError}</p> : null}

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
      <div className="flex flex-wrap border-b border-slate-200 text-xs font-medium gap-2">
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
        <button onClick={()=>{setAdminTab('policy');void loadCompletionPolicy();}} className={`pb-2 px-1 transition border-b-2 cursor-pointer ${adminTab==='policy'?'border-sky-600 text-sky-600 font-bold':'border-transparent text-slate-500'}`}>سیاست پایان کار</button>
      </div>

      {/* تب ۱: مدیریت سفارش‌ها */}
      {adminTab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            !loading && hasLoaded && !loadError ? <p className="text-xs text-slate-500 text-center py-4">هیچ سفارشی ثبت نشده است.</p> : null
          ) : (
            orders.map((ord) => (
              <div key={ord.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-sm">
                <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                  <span className="min-w-0 break-all font-mono text-slate-500 font-bold">{ord.id}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    ord.status === 'COMPLETED'
                      ? 'bg-sky-100 text-sky-800'
                      : ord.status === 'CANCELLED'
                        ? 'bg-rose-100 text-rose-800'
                        : ord.status === 'CANCEL_REQUESTED' || ord.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {adminOrderStatusLabel(ord.status)}
                  </span>
                </div>

                <div className="min-w-0 break-words text-xs space-y-1 text-slate-700 border-t border-slate-100 pt-2">
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
                {ord.completion?.status === 'disputed' && (
                  <div>
                  <p>مبلغ اعلام‌شده: {formatStoredAmount(ord.completion.finalAmount, ord.currencyUnit || ord.pricing?.currencyUnit)}؛ ساعات واقعی: {ord.completion.actualHours ?? 'غیرساعتی'}</p>
                  <button
                    type="button"
                    onClick={() => void handleCompleteOrder(ord, true)}
                    disabled={loading}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    تأیید پایان کار و مبلغ
                  </button>
                  <button type="button" disabled={loading} onClick={() => void handleCompleteOrder(ord, false)}>رد درخواست پایان کار</button>
                  </div>
                )}
                {ord.status === 'CANCEL_REQUESTED' && (
                  <button
                    type="button"
                    onClick={() => handleConfirmCancel(ord.id)}
                    disabled={loading || actionPending}
                    className="w-full bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    تأیید لغو
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {adminTab==='policy' && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-xs">
          <h4 className="font-bold">روش تأیید پایان کار</h4>
          <p>پیش‌فرض، ثبت متخصص و تأیید مشتری است؛ اختلاف به مدیر می‌رسد. تغییر روش روی درخواست‌های جدید اعمال می‌شود.</p>
          <select aria-label="روش تأیید پایان کار" disabled={!completionPolicy || loading || policyBusy} value={completionMode} onChange={e=>setCompletionMode(e.target.value as 'customer_confirmation'|'worker_only')} className="w-full rounded-lg border p-2">
            <option value="customer_confirmation">ثبت متخصص و تأیید مشتری</option><option value="worker_only">فقط تأیید متخصص</option>
          </select>
          <p role="status" aria-live="polite">{policyMessage}</p>
          <div className="flex gap-2"><button type="button" disabled={policyBusy} onClick={()=>void loadCompletionPolicy()} className="rounded-lg bg-slate-600 px-3 py-2 text-white">بازخوانی</button><button type="button" disabled={!completionPolicy || loading || policyBusy} onClick={()=>void saveCompletionPolicy()} className="rounded-lg bg-sky-600 px-3 py-2 text-white">ذخیره سیاست</button></div>
        </div>
      )}

      {/* تب ۲: مدیریت متخصصین و تایید مدارک */}
      {adminTab === 'cleaners' && (
        <div className="space-y-2.5">
          {workers.length === 0 ? (
            !loading && hasLoaded && !loadError ? <p className="text-xs text-slate-500 text-center py-4">هیچ متخصصی ثبت نام نکرده است.</p> : null
          ) : (
            workers.map((cleaner) => (
              <div key={cleaner.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-sky-600" />
                    <div>
                      <span className="font-bold text-slate-800">{cleaner.name || ''}</span>
                      <p className="text-[10px] text-slate-500">تلفن: {cleaner.phone} | کد ملی: {cleaner.nationalIdMasked || 'نامشخص'}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                    cleaner.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {{ APPROVED: 'تایید شده', ACTIVE: 'فعال', BLOCKED: 'مسدود', PENDING_VERIFICATION: 'در انتظار بررسی مدارک', REGISTERED: 'ثبت‌نام اولیه' }[cleaner.status] || 'وضعیت نامشخص'}
                  </span>
                </div>

                {cleaner.status !== 'APPROVED' ? (
                  <button
                    onClick={() => handleUpdateWorkerStatus(cleaner.id, 'APPROVED')}
                    disabled={loading || actionPending}
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    تایید مدارک و فعال‌سازی حساب متخصص
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateWorkerStatus(cleaner.id, 'BLOCKED')}
                    disabled={loading || actionPending}
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
