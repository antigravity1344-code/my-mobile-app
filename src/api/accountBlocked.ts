/**
 * حساب مسدود (فقط مدیر مسدود می‌کند): requireUser سرور روی هر درخواست ۴۰۳ با این پیام
 * و `code: 'ACCOUNT_BLOCKED'` برمی‌گرداند. ۴۰۳های دیگر (مثلاً اقدام غیرمجاز) مسدودی نیستند.
 * بدون وابستگی به React Native تا قابل تست باشد.
 */
export const ACCOUNT_BLOCKED_CODE = 'ACCOUNT_BLOCKED';
export const ACCOUNT_BLOCKED_MESSAGE = 'حساب شما مسدود شده است.';

export function isAccountBlockedResponse(res: unknown): boolean {
  if (!res || typeof res !== 'object') return false;
  const r = res as { httpStatus?: unknown; code?: unknown; message?: unknown };
  if (r.httpStatus !== 403) return false;
  // پیام دقیق برای سرورهایی که هنوز code را نمی‌فرستند (سرور زنده تا ری‌استارت بعدی).
  return r.code === ACCOUNT_BLOCKED_CODE || r.message === ACCOUNT_BLOCKED_MESSAGE;
}

export function accountBlockedMessage(res: unknown): string {
  const message = res && typeof res === 'object' ? (res as { message?: unknown }).message : undefined;
  return typeof message === 'string' && message.trim() ? message.trim() : ACCOUNT_BLOCKED_MESSAGE;
}

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

export function onAccountBlocked(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAccountBlocked(message: string): void {
  for (const listener of Array.from(listeners)) listener(message);
}

/** چند پاسخ مسدودی پشت‌سرهم فقط یک دیالوگ/خروج می‌سازند تا دوباره باز شود. */
export function createAccountBlockedGate() {
  let open = true;
  return {
    tryEnter(): boolean {
      if (!open) return false;
      open = false;
      return true;
    },
    reopen(): void {
      open = true;
    },
  };
}
