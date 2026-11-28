import { useId } from 'react';
import { ADDONS, buildingOptions, calculateStaircase, NUMBER_LABELS, RATE_LABELS, SUPPLIES_NOTE, type Rates } from '../../../server/pricing/staircase';

type Values = Record<string, string | number | boolean>;
type Props = { confirmedTotal?: number; rates?: Rates | null; values: Values; change: (key: string, value: string | number | boolean) => void };
export function StaircaseWebForm({ rates, values, change, confirmedTotal }: Props) {
  const groupId = useId();
  if (!rates) return <p role="status">تعرفهٔ محاسباتی راه‌پله هنوز در دسترس نیست.</p>;
  const options = buildingOptions(values);
  const price = calculateStaircase(rates, options);
  const amount = (n: number) => n.toLocaleString('fa-IR') + ' تومان';
  return <fieldset dir="rtl" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-right text-sm">
    <legend className="px-2 font-bold">مشخصات ساختمان</legend>
    <div className="grid gap-3 sm:grid-cols-3">{Object.entries(NUMBER_LABELS).map(([key, label]) =>
      <label key={key}>{label}<input type="text" inputMode="numeric" value={String(options[key])}
        className="block w-full rounded-lg border border-slate-300 p-2"
        onChange={event => { const value = event.target.value.trim().replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
          if (/^\d*$/.test(value)) change(key, value === '' ? '' : Number(value)); }} /></label>)}</div>
    {(['noLift', ...ADDONS] as const).map(key => {
      const isElevator = key === 'noLift';
      return <fieldset key={key}>
        <legend>{isElevator ? 'آسانسور دارد؟' : RATE_LABELS[key] + ' (+' + amount(rates[key]) + ')'}</legend>
        <div className="mt-1 flex gap-2">{[true, false].map(yes => {
          const value = isElevator ? !yes : yes;
          const selected = options[key] === value;
          return <label key={String(yes)} className={'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border p-2 ' +
            (selected ? 'border-emerald-700 bg-emerald-50' : 'border-slate-300')}>
            <input type="radio" name={groupId + '-' + key} checked={selected} onChange={() => change(key, value)} />
            {yes ? 'بله' : 'خیر'}
          </label>;
        })}</div>
      </fieldset>;
    })}
    <div><p className="mb-2 text-slate-600">{SUPPLIES_NOTE}</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={options.detergent === true}
        onChange={event => change('detergent', event.target.checked)} />درخواست {RATE_LABELS.detergent} (+{amount(rates.detergent)})</label></div>
    <p role="status" className="font-bold text-emerald-800">{price ? (confirmedTotal == null ? 'برآورد خدمت: ' : 'مبلغ تأییدشده: ') + amount(confirmedTotal ?? price.total) : 'تعدادهای ساختمان را کامل کنید.'}</p>
  </fieldset>;
}
