import { STAIR_SERVICE, validRates, type Rates } from '../../server/pricing/staircase';
import { useSyncExternalStore } from 'react';

// خدمت‌هایی که مدیر خاموش کرده یا برای این حساب اصلاً نیستند (پنهان).
// تا رسیدن پاسخ سرور همه روشن‌اند؛ شکست دریافت وضعیت قبلی را نگه می‌دارد.
let disabled: ReadonlySet<string> = new Set();
// خدمت‌های صلاحیتی که هنوز متخصص آماده ندارند: در فهرست دیده می‌شوند ولی قابل سفارش نیستند.
let unavailable: ReadonlySet<string> = new Set();
// خدمت‌هایی که تعرفه آن‌ها را از قفل سطح معاف کرده است. تا رسیدن تعرفه هیچ خدمتی معاف نیست.
let tierExempt: ReadonlySet<string> = new Set();
let staircaseRates: Rates | null = null;
export function getStaircaseRates() { return staircaseRates; }
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
  minQuantity?: number;
  staircaseRates?: Rates;
  detergentBookable?: boolean;
  pricingMode?: 'units' | 'mattress_seat' | null;
};

export type ServicePricingMode = 'units' | 'mattress_seat' | null;
const PRICING_MODES = new Set(['units', 'mattress_seat']);
let detergentServices = new Set<string>();
let hourlyMinimums = new Map<string, number>();
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
    const row = item as { serviceId?: unknown; model?: unknown; exemptFromTierLock?: unknown; pricingMode?: unknown; staircaseRates?: unknown; detergentBookable?: unknown; minQuantity?: unknown };
    if (typeof row.serviceId !== 'string' || row.serviceId.length === 0 || row.serviceId.length > 80) continue;
    if (typeof row.model !== 'string' || !PRICE_MODELS.has(row.model)) continue;
    rules.push({
      serviceId: row.serviceId,
      ...(row.serviceId === STAIR_SERVICE && validRates(row.staircaseRates) ? { staircaseRates: row.staircaseRates } : {}),
      ...(typeof row.detergentBookable === 'boolean' ? { detergentBookable: row.detergentBookable } : {}),
      model: row.model as ServicePricingRule['model'],
      exemptFromTierLock: row.exemptFromTierLock === true,
      ...(row.model === 'hourly' && typeof row.minQuantity === 'number' && Number.isSafeInteger(row.minQuantity) && row.minQuantity > 0
        ? { minQuantity: row.minQuantity } : {}),
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

export function serviceMinimumHours(serviceId: string): number {
  return hourlyMinimums.get(serviceId) ?? 4;
}

export function hourlyDurationChoices(serviceId: string): number[] {
  const minimum = serviceMinimumHours(serviceId);
  return [minimum, ...[3, 4, 5, 6, 7, 8].filter(hours => hours > minimum)];
}

export function isDetergentBookable(serviceId?: string): boolean {
  return !!serviceId && detergentServices.has(serviceId);
}

export function isTierExempt(serviceId: string): boolean {
  return tierExempt.has(serviceId);
}

export function setPricingRules(rules: readonly ServicePricingRule[]): void {
  pricingModes = new Map(rules.flatMap((rule) => (rule.pricingMode ? [[rule.serviceId, rule.pricingMode] as const] : [])));
  const next = new Set(rules.filter((rule) => rule.exemptFromTierLock).map((rule) => rule.serviceId));
  const rates = rules.find(rule => rule.serviceId === STAIR_SERVICE)?.staircaseRates ?? null;
  const minimums = new Map(rules.flatMap(rule => rule.model === 'hourly' && rule.minQuantity != null
    ? [[rule.serviceId, rule.minQuantity] as const] : []));
  const unchangedMinimums = minimums.size === hourlyMinimums.size && [...minimums].every(([id, hours]) => hourlyMinimums.get(id) === hours);
  hourlyMinimums = minimums;
  const nextDetergentServices = new Set(rules.filter(rule => rule.detergentBookable).map(rule => rule.serviceId));
  const unchangedDetergent = nextDetergentServices.size === detergentServices.size && [...nextDetergentServices].every(id => detergentServices.has(id));
  detergentServices = nextDetergentServices;
  const unchangedRates = JSON.stringify(staircaseRates) === JSON.stringify(rates);
  staircaseRates = rates;
  if (unchangedRates && unchangedMinimums && unchangedDetergent && next.size === tierExempt.size && [...next].every((id) => tierExempt.has(id))) return;
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
