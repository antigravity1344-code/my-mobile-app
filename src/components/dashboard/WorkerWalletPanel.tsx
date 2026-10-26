import React, { useCallback, useEffect, useState } from 'react';
import { formatStoredAmount } from '../../features/orders/services/money';
import { loadWorkerWallet, type WorkerWallet } from '../../features/worker/services/workerFinance';
import { previewActive } from '../native/previewRuntime';
import { WORKER_MANUAL_TOPUP_HELP, WORKER_ONLINE_TOPUP_HELP, WORKER_ONLINE_TOPUP_LABEL, WORKER_WALLET_EXPLANATION } from '../../features/worker/services/workerFinanceCopy';

export const WorkerWalletPanel: React.FC = () => {
  const [wallet, setWallet] = useState<WorkerWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (previewActive()) { setWallet(null); setError('کیف پول واقعی در پیش‌نمایش در دسترس نیست.'); return; }
    setLoading(true); setError(null); setWallet(null);
    const result = await loadWorkerWallet();
    if (result.success) setWallet(result.value);
    else setError(result.message);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const onTopUp = () => {
    if (previewActive()) { setNotice('شارژ واقعی در پیش‌نمایش انجام نمی‌شود.'); return; }
    setNotice(wallet?.topUpAvailable ? 'پرداخت باید در درگاه تأیید شود؛ این دکمه موجودی را زیاد نمی‌کند.' : 'درگاه پرداخت هنوز متصل نیست.');
  };

  return <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4" dir="rtl">
    <h2 className="text-lg font-bold text-slate-900">کیف پول متخصص</h2>
    <p className="text-sm text-slate-600 leading-6">{WORKER_WALLET_EXPLANATION}</p>
    <p className="text-sm text-slate-600 leading-6">{WORKER_MANUAL_TOPUP_HELP}</p>
    <div><button type="button" disabled onClick={onTopUp} className="rounded-xl bg-slate-300 px-4 py-2 text-sm font-bold text-slate-600 cursor-not-allowed">{WORKER_ONLINE_TOPUP_LABEL}</button><p className="mt-1 text-xs text-slate-500">{WORKER_ONLINE_TOPUP_HELP}</p></div>
    {notice ? <p role="status" className="text-sm text-amber-800">{notice}</p> : null}
    <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg px-3 py-2 text-sm font-bold text-sky-700 disabled:opacity-50">{loading ? 'در حال بارگیری…' : 'بازخوانی کیف پول'}</button>
    {loading ? <p role="status" className="text-sm text-slate-500">در حال دریافت مانده و گردش…</p> : null}
    {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => void refresh()} disabled={loading} className="mt-2 font-bold underline">تلاش دوباره</button></div> : null}
    {wallet ? <>
      <section><h3 className="mb-2 font-bold text-slate-800">مانده‌ها</h3>{wallet.balances.length ? <ul className="space-y-2">{wallet.balances.map((item, index) => <li key={`${item.currencyUnit}-${index}`} className="flex justify-between rounded-lg bg-slate-50 p-3"><span className="text-slate-600">{item.currencyUnit}</span><strong>{formatStoredAmount(item.balance, item.currencyUnit)}</strong></li>)}</ul> : <p className="text-sm text-slate-500">مانده‌ای ثبت نشده است.</p>}</section>
      <section><h3 className="mb-2 font-bold text-slate-800">گردش کیف پول</h3>{wallet.transactions.length ? <ul className="space-y-2">{wallet.transactions.map(item => <li key={item.id} className="rounded-lg border border-slate-200 p-3 space-y-1">
        <div className="flex justify-between gap-3"><strong>{formatStoredAmount(item.amount, item.currencyUnit)}</strong><span className="text-sm text-slate-700">{item.type === 'COMMISSION' ? 'کمیسیون' : 'شارژ'}{item.orderId ? ` · سفارش ${item.orderId}` : ''}</span></div>
        <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('fa-IR')}</p>
        {item.grossAmount !== null ? <p className="text-xs text-slate-600">مبلغ کار: {formatStoredAmount(item.grossAmount, item.currencyUnit)}</p> : null}
        {item.commissionAmount !== null ? <p className="text-xs text-slate-600">کمیسیون: {formatStoredAmount(item.commissionAmount, item.currencyUnit)}</p> : null}
        {item.netAmount !== null ? <p className="text-xs text-slate-600">خالص کار: {formatStoredAmount(item.netAmount, item.currencyUnit)}</p> : null}
        {item.ratePercent !== null ? <p className="text-xs text-slate-600">درصد کمیسیون: {item.ratePercent}٪</p> : null}
      </li>)}</ul> : <p className="text-sm text-slate-500">تراکنشی ثبت نشده است.</p>}</section>
      {!wallet.canAcceptNewOrders ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-800">به‌دلیل مانده منفی، فعلاً امکان پذیرش سفارش جدید ندارید.</p> : null}
    </> : null}
  </section>;
};
