import { accountBlockedMessage, isAccountBlockedResponse } from '../../api/accountBlocked';

/** منطق خالص بارگذاری سفارش‌های پنل متخصص (بدون وابستگی به React Native تا قابل تست باشد). */

export type WorkerOrdersFetchMode = 'initial' | 'manual' | 'poll' | 'after-action';

export const WORKER_ORDERS_LOAD_ERROR = 'دریافت سفارش‌ها انجام نشد. لطفاً دوباره تلاش کنید.';
export const WORKER_SESSION_EXPIRED_MESSAGE = 'نشست شما به پایان رسیده است. لطفاً دوباره وارد شوید.';

/** پیام سرور برای درخواست بدون نشست معتبر (server/index.js requireUser). */
const SERVER_LOGIN_REQUIRED_MESSAGE = 'ورود لازم است.';

export type WorkerOrdersResponse =
  | { kind: 'ok'; orders: unknown[] }
  | { kind: 'error'; message: string }
  | { kind: 'expired' }
  /** حساب مسدود (۴۰۳ ACCOUNT_BLOCKED)؛ دیالوگ و خروج را اپ متخصص انجام می‌دهد. */
  | { kind: 'blocked'; message: string };

export type WorkerOrdersState<T> = {
  available: T[];
  mine: T[];
  error: string | null;
  sessionExpired: boolean;
};

export type WorkerOrdersLoad<T> = {
  available: WorkerOrdersResponse | null;
  /** null یعنی این فهرست در این دور درخواست نشد. */
  mine: WorkerOrdersResponse | null;
  map?: (orders: unknown[]) => T[];
};

/** لودر فقط در بارگذاری اول و تلاش دوباره دستی؛ پولینگ پس‌زمینه نباید فهرست را چشمک‌زن کند. */
export function showsWorkerOrdersSpinner(mode: WorkerOrdersFetchMode): boolean {
  return mode === 'initial' || mode === 'manual';
}

/** پولینگ وقتی درخواست قبلی هنوز در جریان است شروع نمی‌شود تا پاسخ‌ها روی هم نیفتند. */
export function shouldStartWorkerOrdersFetch(mode: WorkerOrdersFetchMode, inFlight: boolean): boolean {
  return !(mode === 'poll' && inFlight);
}

export function classifyWorkerOrdersResponse(res: unknown): WorkerOrdersResponse {
  const r = (res && typeof res === 'object' ? res : {}) as {
    success?: unknown;
    orders?: unknown;
    message?: unknown;
    httpStatus?: unknown;
  };
  if (r.httpStatus === 401 || r.message === SERVER_LOGIN_REQUIRED_MESSAGE) return { kind: 'expired' };
  if (isAccountBlockedResponse(res)) return { kind: 'blocked', message: accountBlockedMessage(res) };
  if (r.success === true && Array.isArray(r.orders)) return { kind: 'ok', orders: r.orders };
  const message = typeof r.message === 'string' && r.message.trim() ? r.message.trim() : WORKER_ORDERS_LOAD_ERROR;
  return { kind: 'error', message };
}

/**
 * اعمال نتیجه یک دور بارگذاری. خطا هیچ‌وقت فهرست قبلی را خالی نمی‌کند؛
 * خطای پولینگ پس‌زمینه بی‌صدا نادیده گرفته می‌شود، ولی پایان نشست همیشه نمایش داده می‌شود.
 */
export function applyWorkerOrdersLoad<T>(
  state: WorkerOrdersState<T>,
  load: WorkerOrdersLoad<T>,
  mode: WorkerOrdersFetchMode,
): WorkerOrdersState<T> {
  const parts = [load.available, load.mine].filter((p): p is WorkerOrdersResponse => p !== null);
  const blocked = parts.find((p): p is { kind: 'blocked'; message: string } => p.kind === 'blocked');
  if (blocked) return { ...state, error: blocked.message, sessionExpired: true };
  if (parts.some((p) => p.kind === 'expired')) {
    return { ...state, error: WORKER_SESSION_EXPIRED_MESSAGE, sessionExpired: true };
  }
  const firstError = parts.find((p): p is { kind: 'error'; message: string } => p.kind === 'error');
  if (firstError && mode === 'poll') return state;

  const map = load.map ?? ((orders: unknown[]) => orders as T[]);
  return {
    available: load.available?.kind === 'ok' ? map(load.available.orders) : state.available,
    mine: load.mine?.kind === 'ok' ? map(load.mine.orders) : state.mine,
    error: firstError ? firstError.message : null,
    sessionExpired: false,
  };
}
