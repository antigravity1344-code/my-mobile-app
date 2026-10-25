import { describe, expect, it } from 'vitest';
import {
  incomeSnapshotsFromLedger,
  jalaliSaturdayWeekRange,
  workerWeeklyIncomeFromSnapshots,
  workerWeeklyIncomeJobCount,
  workerWeeklyIncomeWeekLabel,
} from './workerWeeklyIncome';

const now = new Date('2026-10-25T10:00:00.000Z');

describe('worker weekly income (D-77 / D-79)', () => {
  it('uses a Tehran Jalali week starting Saturday', () => {
    expect(jalaliSaturdayWeekRange(now)).toEqual({ start: [1405, 8, 2], end: [1405, 8, 8] });
  });

  it('sums finalized snapshots in the current week and keeps currencies separate', () => {
    const income = workerWeeklyIncomeFromSnapshots([
      { createdAt: '2026-10-24T08:00:00.000Z', currencyUnit: 'تومان', grossAmount: 4000, commissionAmount: 1000, netAmount: 3000 },
      { createdAt: '2026-10-26T08:00:00.000Z', currencyUnit: 'تومان', grossAmount: 2000, commissionAmount: 500, netAmount: 1500 },
      { createdAt: '2026-10-26T09:00:00.000Z', currencyUnit: 'ریال', grossAmount: 800, commissionAmount: 200, netAmount: 600 },
      { createdAt: '2026-10-23T20:29:00.000Z', currencyUnit: 'تومان', grossAmount: 90000, commissionAmount: 22500, netAmount: 67500 },
    ], now);
    expect(income.available).toBe(true);
    if (!income.available) return;
    expect(income.report.totals).toEqual([
      { currencyUnit: 'تومان', jobCount: 2, grossAmount: 6000, commissionAmount: 1500, netAmount: 4500 },
      { currencyUnit: 'ریال', jobCount: 1, grossAmount: 800, commissionAmount: 200, netAmount: 600 },
    ]);
    expect(workerWeeklyIncomeJobCount(income.report)).toBe('۳ کار قطعی');
    expect(workerWeeklyIncomeWeekLabel(income.report)).toContain('شنبه');
  });

  it('drops wallet top-ups and rows without a completion snapshot', () => {
    expect(incomeSnapshotsFromLedger([
      { type: 'TOPUP', createdAt: '2026-10-25T08:00:00.000Z', currencyUnit: 'تومان', grossAmount: null, commissionAmount: null, netAmount: null },
      { type: 'COMMISSION', createdAt: '2026-10-25T08:00:00.000Z', currencyUnit: 'تومان', grossAmount: 1000, commissionAmount: 250, netAmount: 750 },
      { type: 'COMMISSION', createdAt: '2026-10-25T09:00:00.000Z', currencyUnit: 'تومان', grossAmount: null, commissionAmount: null, netAmount: null },
    ])).toEqual([
      { createdAt: '2026-10-25T08:00:00.000Z', currencyUnit: 'تومان', grossAmount: 1000, commissionAmount: 250, netAmount: 750 },
    ]);
  });

  it('does not invent a zero week from invalid snapshot amounts', () => {
    expect(workerWeeklyIncomeFromSnapshots([
      { createdAt: '2026-10-25T08:00:00.000Z', currencyUnit: 'تومان', grossAmount: Number.NaN, commissionAmount: 0, netAmount: 0 },
    ], now)).toEqual({ available: false });
  });
});
