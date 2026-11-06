import { useSyncExternalStore } from 'react';

// خدمت‌هایی که مدیر از پنل خاموش کرده است. تا رسیدن پاسخ سرور همه روشن‌اند؛ شکست دریافت وضعیت قبلی را نگه می‌دارد.
let disabled: ReadonlySet<string> = new Set();
let version = 0;
const listeners = new Set<() => void>();

export function parseDisabledServiceIds(value: unknown): string[] | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { success?: unknown; disabledServiceIds?: unknown };
  if (body.success !== true || !Array.isArray(body.disabledServiceIds)) return null;
  return body.disabledServiceIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 80);
}

export function setDisabledServiceIds(ids: readonly string[]): void {
  const next = new Set(ids);
  if (next.size === disabled.size && [...next].every((id) => disabled.has(id))) return;
  disabled = next;
  version += 1;
  listeners.forEach((listener) => listener());
}

export function isServiceEnabled(serviceId: string): boolean {
  return !disabled.has(serviceId);
}

/** فقط برای بازدیدن دوباره رندر وقتی وضعیت خدمت‌ها عوض شد. */
export function useServiceAvailability(): number {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => version,
    () => version,
  );
}
