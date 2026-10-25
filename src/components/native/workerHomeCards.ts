import { SERVICES_CATALOG } from '../../config/servicesData';
import type { WorkerWallet, WorkerWalletTransaction } from '../../features/worker/services/workerFinance';
import { JALALI_MONTH_NAMES, toPersianDigits } from '../../utils/jalaliDateOptions';
import {
  jalaliDayOf,
  parseOrderDay,
  workerOrderTimeLabel,
  WORKER_STAT_PLACEHOLDER,
  WORKER_WEEKDAY_LABELS,
  type JalaliDay,
} from './workerHomeModel';
import { workerRatingText, type WorkerRating } from './workerRating';
import { workerStatusLabel, workerStatusTone, type WorkerOrderStatus, type WorkerStatusTone } from './workerOrderStatus';

/** چهار کارت خانهٔ متخصص؛ داده از منابع موجود روی main می‌آید، نه از جدول ساختگی. */
export const WORKER_HOME_CARD_KEYS = ['calendar', 'services', 'transactions', 'feedbacks'] as const;
export type WorkerHomeCardKey = (typeof WORKER_HOME_CARD_KEYS)[number];

export const WORKER_HOME_CARD_LABEL: Record<WorkerHomeCardKey, string> = {
  calendar: 'تقویم کاری',
  services: 'خدمات من',
  transactions: 'تراکنش‌ها',
  feedbacks: 'بازخوردها',
};

const pad = (n: number) => String(n).padStart(2, '0');
const sameDay = (a: JalaliDay, b: JalaliDay) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const dayKey = (day: JalaliDay) => `${day[0]}-${pad(day[1])}-${pad(day[2])}`;
const daySort = (day: JalaliDay) => day[0] * 10000 + day[1] * 100 + day[2];

export function jalaliDayKey(day: JalaliDay): string {
  return dayKey(day);
}

export function jalaliDayTitle(day: JalaliDay, now: Date = new Date()): string {
  const dateText = toPersianDigits(`${day[0]}/${pad(day[1])}/${pad(day[2])}`);
  const month = JALALI_MONTH_NAMES[day[1] - 1] || '';
  const labeled = month ? `${toPersianDigits(day[2])} ${month} ${toPersianDigits(day[0])}` : dateText;
  return sameDay(day, jalaliDayOf(now)) ? `امروز، ${labeled}` : labeled;
}

export type WorkerCalendarJob = {
  id: string;
  title: string;
  status: WorkerOrderStatus;
  statusLabel: string;
  tone: WorkerStatusTone;
  timeLabel: string;
  rawDate: string;
  rawTime: string;
};

export type WorkerCalendarDay = {
  key: string;
  day: JalaliDay | null;
  title: string;
  jobs: WorkerCalendarJob[];
};

export type WorkerCalendarSource = {
  id: string;
  serviceTitle: string;
  status: WorkerOrderStatus;
  rawDate: string;
  rawTime: string;
};

function toCalendarJob(order: WorkerCalendarSource, now: Date): WorkerCalendarJob {
  return {
    id: order.id,
    title: order.serviceTitle,
    status: order.status,
    statusLabel: workerStatusLabel(order.status),
    tone: workerStatusTone(order.status),
    timeLabel: workerOrderTimeLabel(order.rawDate, order.rawTime, now),
    rawDate: order.rawDate,
    rawTime: order.rawTime,
  };
}

/**
 * رزروها و نوبت‌های کاری همین متخصص به تفکیک روز شمسی و وضعیت.
 * شیفت آزاد یا تقویم خالی تعریف‌شده وجود ندارد؛ فقط سفارش‌های خود متخصص.
 */
export function workerCalendarDays(
  mine: ReadonlyArray<WorkerCalendarSource>,
  now: Date = new Date(),
): WorkerCalendarDay[] {
  const dated = new Map<string, WorkerCalendarDay>();
  const undated: WorkerCalendarJob[] = [];
  for (const order of mine) {
    const job = toCalendarJob(order, now);
    const day = parseOrderDay(order.rawDate);
    if (!day) {
      undated.push(job);
      continue;
    }
    const key = dayKey(day);
    const group = dated.get(key) ?? { key, day, title: jalaliDayTitle(day, now), jobs: [] };
    group.jobs.push(job);
    dated.set(key, group);
  }
  const days = [...dated.values()].sort((left, right) => {
    if (!left.day || !right.day) return 0;
    return daySort(left.day) - daySort(right.day);
  });
  for (const group of days) {
    group.jobs.sort((left, right) => left.rawTime.localeCompare(right.rawTime) || left.id.localeCompare(right.id));
  }
  if (undated.length) {
    days.push({
      key: 'undated',
      day: null,
      title: 'بدون تاریخ مشخص',
      jobs: undated.sort((left, right) => left.id.localeCompare(right.id)),
    });
  }
  return days;
}

export type WorkerCalendarWeekDay = {
  key: string;
  weekday: string;
  dayNumber: string;
  isToday: boolean;
  jobCount: number;
};

/** هفته از شنبه؛ شمارش فقط از رزروهای تاریخ‌دار همین متخصص. */
export function workerCalendarWeek(
  mine: ReadonlyArray<WorkerCalendarSource>,
  now: Date = new Date(),
): WorkerCalendarWeekDay[] {
  const weekday = now.getDay();
  const saturdayOffset = (weekday + 1) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - saturdayOffset);
  const today = jalaliDayOf(now);
  const counts = new Map<string, number>();
  for (const order of mine) {
    const day = parseOrderDay(order.rawDate);
    if (!day) continue;
    const key = dayKey(day);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return WORKER_WEEKDAY_LABELS.map((label, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const day = jalaliDayOf(date);
    const key = dayKey(day);
    return {
      key,
      weekday: label,
      dayNumber: toPersianDigits(day[2]),
      isToday: sameDay(day, today),
      jobCount: counts.get(key) || 0,
    };
  });
}

export const WORKER_CATALOG_SERVICE_IDS: readonly string[] = SERVICES_CATALOG
  .filter((service) => service.isVisible)
  .map((service) => service.id);

export type WorkerServiceRow = {
  id: string;
  title: string;
  badge: string;
  active: boolean;
  known: boolean;
};

/** مهارت‌های ذخیره‌شده؛ حداکثر ۲۰ مورد، هر کدام حداکثر ۴۰ نویسه، بدون تکرار و بدون مقدار خالی. */
export function normalizeWorkerSkills(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of skills) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || id.length > 40 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 20) break;
  }
  return out;
}

/**
 * فهرست خدمات از کاتالوگ موجود + مهارت‌های ثبت‌شده.
 * فعال یعنی شناسه در skills است؛ مهارت ناشناخته هم به‌عنوان ردیف فعال جدا می‌ماند.
 */
export function workerServiceRows(skills: unknown): WorkerServiceRow[] {
  const active = new Set(normalizeWorkerSkills(skills));
  const rows: WorkerServiceRow[] = SERVICES_CATALOG.filter((service) => service.isVisible).map((service) => ({
    id: service.id,
    title: service.title,
    badge: service.badge || '',
    active: active.has(service.id),
    known: true,
  }));
  for (const id of active) {
    if (rows.some((row) => row.id === id)) continue;
    rows.push({ id, title: id, badge: '', active: true, known: false });
  }
  return rows;
}

export function toggleWorkerSkill(skills: readonly string[], serviceId: string): string[] {
  const id = typeof serviceId === 'string' ? serviceId.trim() : '';
  const current = normalizeWorkerSkills(skills);
  if (!id || id.length > 40) return current;
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (current.length >= 20) return current;
  return [...current, id];
}

export const WORKER_SERVICES_NOTE =
  'فعال یا غیرفعال بودن از مهارت ثبت‌شده در حساب خوانده می‌شود. این فهرست فیلتر سفارش‌های باز را عوض نمی‌کند.';

export type WorkerLedgerKind = 'commission' | 'topup';

export type WorkerLedgerRow = {
  id: string;
  kind: WorkerLedgerKind;
  title: string;
  /** شارژ اعتبار درآمد کاری نیست (D-79). کسر کمیسیون هم دستمزد نیست. */
  isWorkIncome: false;
  amount: number;
  currencyUnit: string;
  createdAt: string;
  orderId: string | null;
  grossAmount: number | null;
  commissionAmount: number | null;
  netAmount: number | null;
  ratePercent: number | null;
};

export function workerLedgerKind(type: WorkerWalletTransaction['type']): WorkerLedgerKind {
  return type === 'COMMISSION' ? 'commission' : 'topup';
}

export function workerLedgerTitle(type: WorkerWalletTransaction['type']): string {
  return type === 'COMMISSION' ? 'کمیسیون کار' : 'شارژ اعتبار کیف پول';
}

/** گردش D-79: کمیسیون و شارژ جدا؛ هیچ ردیف کیف پول درآمد کاری محسوب نمی‌شود. */
export function workerLedgerRows(wallet: WorkerWallet | null | undefined): WorkerLedgerRow[] {
  if (!wallet) return [];
  return wallet.transactions.map((item) => ({
    id: item.id,
    kind: workerLedgerKind(item.type),
    title: workerLedgerTitle(item.type),
    isWorkIncome: false,
    amount: item.amount,
    currencyUnit: item.currencyUnit,
    createdAt: item.createdAt,
    orderId: item.orderId,
    grossAmount: item.grossAmount,
    commissionAmount: item.commissionAmount,
    netAmount: item.netAmount,
    ratePercent: item.ratePercent,
  }));
}

export function workerLedgerWorkRows(rows: readonly WorkerLedgerRow[]): WorkerLedgerRow[] {
  return rows.filter((row) => row.kind === 'commission');
}

export function workerLedgerCreditRows(rows: readonly WorkerLedgerRow[]): WorkerLedgerRow[] {
  return rows.filter((row) => row.kind === 'topup');
}

export const WORKER_TRANSACTIONS_NOTE =
  'مشتری دستمزد را مستقیم می‌پردازد. گردش زیر اعتبار کمیسیون و شارژ کیف پول است؛ شارژ درآمد کاری نیست.';

/** فیلدهایی که متن نظر مشتری را حمل می‌کنند؛ در نمای متخصص نباید باشند (D-32). */
export const WORKER_FEEDBACK_FORBIDDEN_KEYS = [
  'comment',
  'customerComment',
  'text',
  'body',
  'review',
  'reviews',
  'message',
  'tags',
  'customerTags',
] as const;

export type WorkerFeedbackStats = {
  average: number | null;
  count: number;
  headline: string;
};

export const WORKER_FEEDBACK_PRIVACY_NOTE =
  'فقط میانگین و تعداد امتیاز نمایش داده می‌شود. متن نظر یا کامنت مشتری نشان داده نمی‌شود.';

export function workerFeedbackStats(rating: WorkerRating | null | undefined): WorkerFeedbackStats {
  const count = rating && rating.count > 0 ? rating.count : 0;
  const average = rating && count > 0 && rating.average != null ? rating.average : null;
  return {
    average,
    count,
    headline: workerRatingText(rating),
  };
}

export function workerFeedbackHasForbiddenField(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return WORKER_FEEDBACK_FORBIDDEN_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function workerFeedbackEmpty(stats: WorkerFeedbackStats): boolean {
  return stats.count <= 0 || stats.average == null || stats.headline === WORKER_STAT_PLACEHOLDER;
}
