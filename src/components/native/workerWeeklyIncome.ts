import { tehranWallParts } from '../../utils/jalaliDisplay';
import { gregorianToJalali } from '../../utils/pricing';
import { toPersianDigits } from '../../utils/jalaliDateOptions';

type JalaliDay = [number, number, number];

/** اسنپ‌شات قطعی پایان کار؛ شارژ کیف پول این شکل را ندارد. */
export type WorkerIncomeSnapshot = {
  createdAt: string;
  currencyUnit: string;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
};

export type WorkerWeeklyIncomeTotal = {
  currencyUnit: string;
  jobCount: number;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
};

export type WorkerWeeklyIncomeReport = {
  calendar: 'jalali';
  weekStart: { year: number; month: number; day: number };
  weekEnd: { year: number; month: number; day: number };
  totals: WorkerWeeklyIncomeTotal[];
};

export type WorkerWeeklyIncome =
  | { available: false }
  | { available: true; report: WorkerWeeklyIncomeReport };

const pad = (n: number) => String(n).padStart(2, '0');

export function jalaliDayFromTehranInstant(ms: number): JalaliDay | null {
  if (!Number.isFinite(ms)) return null;
  const wall = tehranWallParts(ms);
  const day = gregorianToJalali(wall.year, wall.month, wall.day);
  if (!day.every((value) => Number.isSafeInteger(value)) || day[0] < 1 || day[1] < 1 || day[1] > 12 || day[2] < 1) {
    return null;
  }
  return day;
}

export function jalaliDayFromIso(value: string | null | undefined): JalaliDay | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? jalaliDayFromTehranInstant(ms) : null;
}

function dayKey(day: JalaliDay): number {
  return day[0] * 10000 + day[1] * 100 + day[2];
}

/** هفتهٔ شمسی از شنبه تا جمعه، با روز تقویمی تهران. */
export function jalaliSaturdayWeekRange(now: Date = new Date()): { start: JalaliDay; end: JalaliDay } | null {
  const wall = tehranWallParts(now.getTime());
  const weekday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, 12)).getUTCDay();
  const offset = (weekday + 1) % 7;
  const saturday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day - offset, 12));
  const friday = new Date(Date.UTC(saturday.getUTCFullYear(), saturday.getUTCMonth(), saturday.getUTCDate() + 6, 12));
  const start = jalaliDayFromTehranInstant(saturday.getTime());
  const end = jalaliDayFromTehranInstant(friday.getTime());
  if (!start || !end) return null;
  return { start, end };
}

export function isJalaliDayInWeek(day: JalaliDay, week: { start: JalaliDay; end: JalaliDay }): boolean {
  const key = dayKey(day);
  return key >= dayKey(week.start) && key <= dayKey(week.end);
}

export function workerWeeklyIncomeFromSnapshots(
  rows: ReadonlyArray<WorkerIncomeSnapshot>,
  now: Date = new Date(),
): WorkerWeeklyIncome {
  const week = jalaliSaturdayWeekRange(now);
  if (!week) return { available: false };
  const groups = new Map<string, WorkerWeeklyIncomeTotal>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.grossAmount) || row.grossAmount < 0) return { available: false };
    if (!Number.isSafeInteger(row.commissionAmount) || row.commissionAmount < 0) return { available: false };
    if (!Number.isSafeInteger(row.netAmount) || row.netAmount < 0) return { available: false };
    if (typeof row.currencyUnit !== 'string' || !row.currencyUnit.trim()) return { available: false };
    const day = jalaliDayFromIso(row.createdAt);
    if (!day) return { available: false };
    if (!isJalaliDayInWeek(day, week)) continue;
    const current = groups.get(row.currencyUnit) ?? {
      currencyUnit: row.currencyUnit,
      jobCount: 0,
      grossAmount: 0,
      commissionAmount: 0,
      netAmount: 0,
    };
    current.jobCount += 1;
    current.grossAmount += row.grossAmount;
    current.commissionAmount += row.commissionAmount;
    current.netAmount += row.netAmount;
    if (![current.grossAmount, current.commissionAmount, current.netAmount, current.jobCount].every(Number.isSafeInteger)) {
      return { available: false };
    }
    groups.set(row.currencyUnit, current);
  }
  return {
    available: true,
    report: {
      calendar: 'jalali',
      weekStart: { year: week.start[0], month: week.start[1], day: week.start[2] },
      weekEnd: { year: week.end[0], month: week.end[1], day: week.end[2] },
      totals: [...groups.values()].sort((a, b) => (a.currencyUnit < b.currencyUnit ? -1 : a.currencyUnit > b.currencyUnit ? 1 : 0)),
    },
  };
}

/** فقط ردیف کمیسیون دارای اسنپ‌شات؛ شارژ TOPUP حذف می‌شود. */
export function incomeSnapshotsFromLedger(
  rows: ReadonlyArray<{
    type?: string;
    createdAt: string;
    currencyUnit: string;
    grossAmount: number | null;
    commissionAmount: number | null;
    netAmount: number | null;
  }>,
): WorkerIncomeSnapshot[] {
  const snapshots: WorkerIncomeSnapshot[] = [];
  for (const row of rows) {
    if (row.type === 'TOPUP') continue;
    if (row.type != null && row.type !== 'COMMISSION') continue;
    if (row.grossAmount == null || row.commissionAmount == null || row.netAmount == null) continue;
    snapshots.push({
      createdAt: row.createdAt,
      currencyUnit: row.currencyUnit,
      grossAmount: row.grossAmount,
      commissionAmount: row.commissionAmount,
      netAmount: row.netAmount,
    });
  }
  return snapshots;
}

export function workerWeeklyIncome(report: WorkerWeeklyIncomeReport | null | undefined): WorkerWeeklyIncome {
  if (!report || report.calendar !== 'jalali' || !Array.isArray(report.totals)) return { available: false };
  return { available: true, report };
}

export function workerWeeklyIncomeWeekLabel(report: WorkerWeeklyIncomeReport): string {
  const start = `${report.weekStart.year}/${pad(report.weekStart.month)}/${pad(report.weekStart.day)}`;
  const end = `${report.weekEnd.year}/${pad(report.weekEnd.month)}/${pad(report.weekEnd.day)}`;
  return `شنبه ${toPersianDigits(start)} تا جمعه ${toPersianDigits(end)}`;
}

export function workerWeeklyIncomeJobCount(report: WorkerWeeklyIncomeReport): string {
  const count = report.totals.reduce((sum, item) => sum + item.jobCount, 0);
  return count > 0 ? `${toPersianDigits(count)} کار قطعی` : 'این هفته کار قطعی‌شده‌ای ثبت نشده است.';
}

export function workerWeeklyIncomeNetText(
  total: WorkerWeeklyIncomeTotal,
  format: (amount: number, unit: string) => string,
): string {
  if (!Number.isSafeInteger(total.netAmount)) return '—';
  return `سهم خالص: ${format(total.netAmount, total.currencyUnit)}`;
}
