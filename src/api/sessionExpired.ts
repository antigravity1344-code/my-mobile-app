/**
 * پایان نشست: requireUser سرور برای توکن نامعتبر یا منقضی ۴۰۱ «ورود لازم است.» برمی‌گرداند.
 * فقط ۴۰۱ روی درخواستی که توکن داشته نشست منقضی است؛ خروج (/auth/logout) و مسیرهای مدیر حساب نمی‌شوند.
 * بدون وابستگی به React Native تا قابل تست باشد.
 */
export const SESSION_EXPIRED_TITLE = 'نشست به پایان رسید';
export const SESSION_EXPIRED_MESSAGE = 'مدت ورود شما تمام شده است. لطفاً دوباره وارد شوید.';

export function isSessionExpiredResponse(
  res: unknown,
  request: { hadToken: boolean; endpoint: string },
): boolean {
  if (!request.hadToken) return false;
  if (request.endpoint === '/auth/logout' || request.endpoint.startsWith('/admin')) return false;
  if (!res || typeof res !== 'object') return false;
  return (res as { httpStatus?: unknown }).httpStatus === 401;
}

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSessionExpired(): void {
  for (const listener of Array.from(listeners)) listener(SESSION_EXPIRED_MESSAGE);
}
