import { CUSTOMER_ORDER_STATUS_LABELS } from '../../features/orders/orderStatusLabels';
import type { ApiOrder } from '../../api/types';

/** وضعیت خام سفارش از سرور، همان‌طور که برای متخصص نگه داشته می‌شود؛ مقدار ناشناخته UNKNOWN است. */
export type WorkerOrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type WorkerStatusTone = 'open' | 'active' | 'completed' | 'cancelled' | 'neutral';

const KNOWN_STATUSES: readonly WorkerOrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'CONFIRMED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

/** کارهای فعالِ متخصص: همان وضعیت‌هایی که سرور برایشان تلفن و آدرس کامل می‌فرستد. */
export const WORKER_ACTIVE_STATUSES: readonly WorkerOrderStatus[] = [
  'ACCEPTED',
  'IN_PROGRESS',
  'CONFIRMED',
  'ASSIGNED',
];

export const WORKER_STATUS_LABEL: Record<WorkerOrderStatus, string> = {
  PENDING: 'در انتظار پذیرش',
  ACCEPTED: CUSTOMER_ORDER_STATUS_LABELS.ACCEPTED,
  CONFIRMED: 'تأیید شده',
  ASSIGNED: 'تخصیص داده شده',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'انجام شده',
  CANCELLED: 'لغو شده',
  UNKNOWN: 'وضعیت نامشخص',
};

export function normalizeWorkerOrderStatus(raw: unknown): WorkerOrderStatus {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return KNOWN_STATUSES.includes(value as WorkerOrderStatus) ? (value as WorkerOrderStatus) : 'UNKNOWN';
}

export function workerStatusLabel(status: WorkerOrderStatus): string {
  return WORKER_STATUS_LABEL[status] ?? WORKER_STATUS_LABEL.UNKNOWN;
}

export function workerStatusTone(status: WorkerOrderStatus): WorkerStatusTone {
  if (status === 'PENDING') return 'open';
  if (WORKER_ACTIVE_STATUSES.includes(status)) return 'active';
  if (status === 'COMPLETED') return 'completed';
  if (status === 'CANCELLED') return 'cancelled';
  return 'neutral';
}

export function isActiveWorkerJob(status: WorkerOrderStatus): boolean {
  return WORKER_ACTIVE_STATUSES.includes(status);
}

/** پذیرش فقط برای سفارش باز (PENDING). */
export function canAcceptWorkerOrder(status: WorkerOrderStatus): boolean {
  return status === 'PENDING';
}

/** سرور فقط ACCEPTED را تکمیل می‌کند؛ دکمه «اتمام کار» فقط همان‌جا نمایش داده می‌شود. */
export function canCompleteWorkerOrder(status: WorkerOrderStatus): boolean {
  return status === 'ACCEPTED';
}

/** تماس فقط برای کار فعال و وقتی شماره واقعاً موجود است. */
export function canCallWorkerCustomer(status: WorkerOrderStatus, phone: string | null | undefined): boolean {
  return isActiveWorkerJob(status) && typeof phone === 'string' && phone.trim() !== '';
}

/**
 * محدوده/محله برای نمایش: فیلد area سرور، وگرنه اولین بخش آدرس قبل از «،».
 * مثل سرور، بخشی که عدد دارد یا بلند است (احتمالاً نشانی دقیق) محدوده حساب نمی‌شود.
 */
export function workerOrderArea(order: { area?: unknown; address?: unknown }): string {
  if (typeof order.area === 'string' && order.area.trim()) return order.area.trim();
  const address = typeof order.address === 'string' ? order.address : '';
  const first = address.split(/[،,]/)[0]?.trim() ?? '';
  if (!first || first.length > 40 || /[0-9۰-۹٠-٩]/.test(first)) return '';
  return first;
}

/**
 * سفارش باز (قبل از پذیرش): فقط محدوده نگه داشته می‌شود.
 * سرور این فیلدها را نمی‌فرستد؛ این فقط احتیاط سمت اپ است تا اگر روزی فرستاده شد هم نمایش داده نشود.
 */
export function preAcceptOrderView(order: ApiOrder): ApiOrder {
  const area = workerOrderArea(order);
  return {
    ...order,
    address: area,
    addressNotes: null,
    notes: '',
    customerName: '',
    customerPhone: '',
    customerAvatar: '',
  };
}

function createdTime(value: unknown): number {
  const time = typeof value === 'string' ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

/** کارهای متخصص: فعال‌ها (جدیدترین اول) و سوابق یعنی انجام‌شده/لغوشده/نامشخص (جدیدترین اول). */
export function partitionWorkerJobs<T extends { status: WorkerOrderStatus; createdAt?: string }>(
  orders: readonly T[],
): { active: T[]; history: T[] } {
  const newestFirst = (left: T, right: T) => createdTime(right.createdAt) - createdTime(left.createdAt);
  const active = orders.filter((order) => isActiveWorkerJob(order.status)).slice().sort(newestFirst);
  const history = orders.filter((order) => !isActiveWorkerJob(order.status)).slice().sort(newestFirst);
  return { active, history };
}
