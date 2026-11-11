import { useSyncExternalStore } from 'react';

// خدمت‌هایی که مدیر خاموش کرده یا برای این حساب اصلاً نیستند (پنهان).
// تا رسیدن پاسخ سرور همه روشن‌اند؛ شکست دریافت وضعیت قبلی را نگه می‌دارد.
let disabled: ReadonlySet<string> = new Set();
// خدمت‌های صلاحیتی که هنوز متخصص آماده ندارند: در فهرست دیده می‌شوند ولی قابل سفارش نیستند.
let unavailable: ReadonlySet<string> = new Set();
// خدمت‌هایی که تعرفه آن‌ها را از قفل سطح معاف کرده است. تا رسیدن تعرفه هیچ خدمتی معاف نیست.
let tierExempt: ReadonlySet<string> = new Set();
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

const PRICE_MODELS = new Set(['hourly', 'fixed', 'count', 'area']);

export type ServicePricingRule = {
  serviceId: string;
  model: 'hourly' | 'fixed' | 'count' | 'area';
  exemptFromTierLock: boolean;
  pricingMode?: 'units' | 'mattress_seat' | null;
};

export type ServicePricingMode = 'units' | 'mattress_seat' | null;
const PRICING_MODES = new Set(['units', 'mattress_seat']);
let pricingModes: ReadonlyMap<string, 'units' | 'mattress_seat'> = new Map();

/** قواعد قیمت از تعرفهٔ سرور. فیلد غایب یعنی سرور هنوز آن را نمی‌فرستد و هیچ معافیتی شناخته نیست. */
export function parsePricingRules(value: unknown): ServicePricingRule[] | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { success?: unknown; pricingRules?: unknown };
  if (body.success !== true) return null;
  if (!Array.isArray(body.pricingRules)) return [];
  const rules: ServicePricingRule[] = [];
  for (const item of body.pricingRules) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { serviceId?: unknown; model?: unknown; exemptFromTierLock?: unknown; pricingMode?: unknown };
    if (typeof row.serviceId !== 'string' || row.serviceId.length === 0 || row.serviceId.length > 80) continue;
    if (typeof row.model !== 'string' || !PRICE_MODELS.has(row.model)) continue;
    rules.push({
      serviceId: row.serviceId,
      model: row.model as ServicePricingRule['model'],
      exemptFromTierLock: row.exemptFromTierLock === true,
      pricingMode: typeof row.pricingMode === 'string' && PRICING_MODES.has(row.pricingMode)
        ? (row.pricingMode as 'units' | 'mattress_seat') : null,
    });
  }
  return rules;
}

/** حالت قیمت‌گذاری سرور برای خدمت (فقط مبل‌شویی مقدار دارد). null یعنی تعیین نشده. */
export function servicePricingMode(serviceId: string): ServicePricingMode {
  return pricingModes.get(serviceId) ?? null;
}

export function isTierExempt(serviceId: string): boolean {
  return tierExempt.has(serviceId);
}

export function setPricingRules(rules: readonly ServicePricingRule[]): void {
  pricingModes = new Map(rules.flatMap((rule) => (rule.pricingMode ? [[rule.serviceId, rule.pricingMode] as const] : [])));
  const next = new Set(rules.filter((rule) => rule.exemptFromTierLock).map((rule) => rule.serviceId));
  if (next.size === tierExempt.size && [...next].every((id) => tierExempt.has(id))) return;
  tierExempt = next;
  version += 1;
  listeners.forEach((listener) => listener());
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
