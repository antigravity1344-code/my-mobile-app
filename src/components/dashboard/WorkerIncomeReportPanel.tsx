import React, { useCallback, useEffect, useState } from 'react';
import { formatStoredAmount } from '../../features/orders/services/money';
import { loadWorkerIncomeReport, type WorkerIncomeReport } from '../../features/worker/services/workerFinance';
import { JALALI_MONTH_NAMES, toPersianDigits } from '../../utils/jalaliDateOptions';
import { previewActive } from '../native/previewRuntime';

function monthTitle(year: number, month: number): string {
  return `${JALALI_MONTH_NAMES[month - 1]} ${toPersianDigits(year)}`;
}

export const WorkerIncomeReportPanel: React.FC = () => {
  const [report, setReport] = useState<WorkerIncomeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (previewActive()) { setReport(null); setError('گزارش درآمد واقعی در پیش‌نمایش در دسترس نیست.'); return; }
    setLoading(true); setError(null); setReport(null);
    const result = await loadWorkerIncomeReport();
    if (result.success) setReport(result.value);
    else setError(result.message);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4" dir="rtl">
    <h2 className="text-lg font-bold text-slate-900">گزارش ماهانه کارها</h2>
    <p className="text-sm text-slate-600 leading-6">فقط کارهای پایان‌یافته با مبلغ قطعی این‌جا جمع می‌شوند: مبلغ کار، کمیسیون شرکت و سهم خالص شما. شارژ کیف پول و گردش اعتبار درآمد کاری نیست و در این گزارش نیست.</p>
    <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg px-3 py-2 text-sm font-bold text-sky-700 disabled:opacity-50">{loading ? 'در حال بارگیری…' : 'بازخوانی گزارش درآمد'}</button>
    {loading ? <p role="status" className="text-sm text-slate-500">در حال دریافت گزارش ماهانه…</p> : null}
    {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => void refresh()} disabled={loading} className="mt-2 font-bold underline">تلاش دوباره</button></div> : null}
    {report ? report.months.length ? report.months.map((item) => <section key={`${item.year}-${item.month}`}>
      <h3 className="mb-2 font-bold text-slate-800">{monthTitle(item.year, item.month)}</h3>
      <ul className="space-y-2">{item.totals.map((total) => <li key={total.currencyUnit} className="rounded-lg border border-slate-200 p-3 space-y-1">
        <p className="text-sm text-slate-700">{toPersianDigits(total.jobCount)} کار قطعی · {total.currencyUnit}</p>
        <p className="text-xs text-slate-600">مبلغ کارها: {formatStoredAmount(total.grossAmount, total.currencyUnit)}</p>
        <p className="text-xs text-slate-600">کمیسیون: {formatStoredAmount(total.commissionAmount, total.currencyUnit)}</p>
        <p className="text-xs text-slate-600">سهم خالص: {formatStoredAmount(total.netAmount, total.currencyUnit)}</p>
      </li>)}</ul>
    </section>) : <p className="text-sm text-slate-500">هنوز کار قطعی‌شده‌ای برای گزارش ماهانه ثبت نشده است.</p> : null}
  </section>;
};
