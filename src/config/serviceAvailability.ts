import { useSyncExternalStore } from 'react';

// خدمت‌هایی که مدیر خاموش کرده یا برای این حساب اصلاً نیستند (پنهان).
// تا رسیدن پاسخ سرور همه روشن‌اند؛ شکست دریافت وضعیت قبلی را نگه می‌دارد.
let disabled: ReadonlySet<string> = new Set();
// خدمت‌های صلاحیتی که هنوز متخصص آماده ندارند: در فهرست دیده می‌شوند ولی قابل سفارش نیستند.
let unavailable: ReadonlySet<string> = new Set();
let version = 0;
const listeners = new Set<() => void>();

function parseIds(value: unknown, key: 'disabledServiceIds' | 'unavailableServiceIds'): string[] | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { success?: unknown } & Record<string, unknown>;
  if (body.success !== true || !Array.isArray(body[key])) return null;
  return (body[key] as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 80);
}

export function parseDisabledServiceIds(value: unknown): string[] | null {
  return parseIds(value, 'disabledServiceIds');
}

export function parseUnavailableServiceIds(value: unknown): string[] {
  return parseIds(value, 'unavailableServiceIds') ?? [];
}

export function setServiceAvailability(disabledIds: readonly string[], unavailableIds: readonly string[] = []): void {
  const nextDisabled = new Set(disabledIds);
  const nextUnavailable = new Set(unavailableIds);
  const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((id) => b.has(id));
  if (same(nextDisabled, disabled) && same(nextUnavailable, unavailable)) return;
  disabled = nextDisabled;
  unavailable = nextUnavailable;
  version += 1;
  listeners.forEach((listener) => listener());
}

export function setDisabledServiceIds(ids: readonly string[]): void {
  setServiceAvailability(ids, [...unavailable]);
}

/** در فهرست خدمت‌ها دیده شود (مدیر خاموش نکرده و برای این حساب پنهان نیست). */
export function isServiceListed(serviceId: string): boolean {
  return !disabled.has(serviceId);
}

/** قابل سفارش است: دیده می‌شود و متخصص آماده دارد. */
export function isServiceEnabled(serviceId: string): boolean {
  return !disabled.has(serviceId) && !unavailable.has(serviceId);
}

/** دیده می‌شود ولی فعلاً متخصص آماده ندارد. */
export function isServiceUnavailable(serviceId: string): boolean {
  return !disabled.has(serviceId) && unavailable.has(serviceId);
}

/** فقط برای بازدیدن دوباره رندر وقتی وضعیت خدمت‌ها عوض شد. */
export function useServiceAvailability(): number {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => version,
    () => version,
  );
}
