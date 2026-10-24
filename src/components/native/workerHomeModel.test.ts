import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gregorianToJalali } from '../../utils/pricing';
import {
  WORKER_HOME_FALLBACK_GREETING,
  WORKER_PRICE_UNKNOWN,
  WORKER_STAT_PLACEHOLDER,
  WORKER_WEEKDAY_LABELS,
  parseOrderDay,
  workerGreeting,
  workerOrderTimeLabel,
  workerPriceLine,
  workerStatText,
  workerTabBadge,
  workerTodayJobsCount,
  workerWeeklyIncome,
} from './workerHomeModel';

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');
const now = new Date(2026, 9, 24, 10, 0, 0); // ۲ آبان ۱۴۰۵
const [jy, jm, jd] = gregorianToJalali(2026, 10, 24);
const pad = (n: number) => String(n).padStart(2, '0');
const todayJ = `${jy}/${pad(jm)}/${pad(jd)}`;
const fa = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

describe('worker home model', () => {
  it('greets by first name with a fallback', () => {
    expect(workerGreeting('علی رضایی')).toBe('سلام، علی عزیز!');
    expect(workerGreeting('  ')).toBe(WORKER_HOME_FALLBACK_GREETING);
    expect(workerGreeting(undefined)).toBe('سلام، متخصص عزیز!');
  });

  it('stats show — for unknown, never a fake 0', () => {
    expect(workerStatText(null)).toBe(WORKER_STAT_PLACEHOLDER);
    expect(workerStatText(undefined)).toBe('—');
    expect(workerStatText(0)).toBe('۰');
    expect(workerStatText(12)).toBe('۱۲');
  });

  it('tab badge hides 0/unknown and caps at ۹۹+', () => {
    expect(workerTabBadge(0)).toBeNull();
    expect(workerTabBadge(null)).toBeNull();
    expect(workerTabBadge(7)).toBe('۷');
    expect(workerTabBadge(99)).toBe('۹۹');
    expect(workerTabBadge(150)).toBe('۹۹+');
  });

  it('price line (D-70): only stairwell cleaning shows a valid stored amount', () => {
    const f = (n: number) => `${n} T`;
    expect(workerPriceLine('staircase_common_areas', 450000, f)).toBe('مبلغ سفارش: 450000 T');
    expect(workerPriceLine('staircase_common_areas', 0, f)).toBe(WORKER_PRICE_UNKNOWN);
    expect(workerPriceLine('staircase_common_areas', null, f)).toBe(WORKER_PRICE_UNKNOWN);
    expect(workerPriceLine('staircase_common_areas', Number.NaN, f)).toBe(WORKER_PRICE_UNKNOWN);
    expect(workerPriceLine('home_unit_cleaning', 450000, f)).toBe(WORKER_PRICE_UNKNOWN);
    expect(workerPriceLine('office_company_cleaning', 450000, f)).toBe(WORKER_PRICE_UNKNOWN);
    expect(workerPriceLine('sofa_carpet_washing', 450000, f)).toBe(WORKER_PRICE_UNKNOWN);
    expect(workerPriceLine(null, 450000, f)).toBe(WORKER_PRICE_UNKNOWN);
    expect(workerPriceLine('unknown_service', 450000, f)).toBe(WORKER_PRICE_UNKNOWN);
  });

  it('the orders screen uses the same D-70 price rule for available orders and my jobs', () => {
    const src = read('NativeWorkerPortal.tsx');
    expect(src.match(/workerPriceLine\(order\.serviceId, order\.rawPrice,/g)?.length).toBe(2);
    expect(src).not.toContain('formatStoredAmount(order.grossOrderAmount');
  });

  it('parses Jalali/Gregorian dates in Persian or Latin digits', () => {
    expect(parseOrderDay(fa(todayJ))).toEqual([jy, jm, jd]);
    expect(parseOrderDay('2026-10-24')).toEqual([jy, jm, jd]);
    expect(parseOrderDay('امروز')).toBeNull();
  });

  it('time label uses امروز/فردا and Persian digits', () => {
    expect(workerOrderTimeLabel(fa(todayJ), '۱۴:۰۰', now)).toBe('امروز، ساعت ۱۴:۰۰');
    expect(workerOrderTimeLabel('2026-10-25', '9:30', now)).toBe('فردا، ساعت ۰۹:۳۰');
    expect(workerOrderTimeLabel('', '', now)).toBe('');
  });

  it('today count includes only this worker\'s active/completed jobs dated today', () => {
    const mine = [
      { status: 'ACCEPTED' as const, rawDate: todayJ },
      { status: 'COMPLETED' as const, rawDate: fa(todayJ) },
      { status: 'CANCELLED' as const, rawDate: todayJ },
      { status: 'ACCEPTED' as const, rawDate: '2026-10-25' },
      { status: 'ACCEPTED' as const, rawDate: '' },
    ];
    expect(workerTodayJobsCount(mine, now)).toBe(2);
  });

  it('weekly income stays unavailable without real payout data; weekdays start Saturday', () => {
    expect(workerWeeklyIncome()).toEqual({ available: false });
    expect(WORKER_WEEKDAY_LABELS[0]).toBe('ش');
    expect(WORKER_WEEKDAY_LABELS).toHaveLength(7);
    const home = read('WorkerHomeScreen.tsx');
    expect(home).toContain('گزارش درآمد هنوز فعال نشده است.');
  });

  it('home has no reject/cancel button and no hardcoded tier and no online toggle', () => {
    const home = read('WorkerHomeScreen.tsx');
    expect(home).not.toContain('رد کردن');
    expect(home).not.toContain('/cancel');
    expect(home).not.toMatch(/آنلاین/);
    // درجه فقط از سرور و از workerTierBadge می‌آید (D-71)، نه متن ثابت.
    expect(home).not.toMatch(/درجه (خاکستری|نقره|طلایی)/);
    expect(home).toContain('workerTierBadge(tierKey)');
  });

  it('one shared orders source; bottom-bar my_jobs opens a fresh portal on my_jobs', () => {
    const shell = read('WorkerMainShell.tsx');
    expect(shell.match(/useWorkerOrders</g)).toHaveLength(1);
    expect(shell).toMatch(/key="my_jobs" initialTab="my_jobs" orders=\{orders\}/);
    expect(shell).toMatch(/key="new_orders" initialTab="available" orders=\{orders\}/);
    expect(read('NativeWorkerPortal.tsx')).not.toMatch(/useWorkerOrders\(/);
  });

  it('polls every 10s and clears the interval on unmount', () => {
    const hook = read('useWorkerOrders.ts');
    expect(hook).toMatch(/WORKER_ORDERS_POLL_MS = 10000/);
    expect(hook).toMatch(/return \(\) => clearInterval\(interval\)/);
  });
});
