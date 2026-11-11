import type { ServicePricingMode } from './serviceAvailability';

export const SOFA_SERVICE_ID = 'sofa_carpet_washing';

export type SofaInput = { id: string; label: string; type: 'select' | 'number' | 'boolean'; options?: string[] };

const SEAT_INPUT: SofaInput = { id: 'sofaSeats', label: 'تعداد نشیمن مبل', type: 'select', options: ['۷ نفره', '۹ نفره'] };
const MATTRESS_INPUT: SofaInput = { id: 'mattresses', label: 'تعداد تشک', type: 'number' };
const UNIT_INPUT: SofaInput = { id: 'mattresses', label: 'تعداد واحد (تشک یا قطعهٔ مبل)', type: 'number' };

/** فیلدهایی که برای حالت سرور نشان داده می‌شوند. حالت خاموش: هیچ فیلدی (خدمت فعال نیست). */
export function sofaInputsFor(mode: ServicePricingMode): SofaInput[] {
  if (mode === 'mattress_seat') return [SEAT_INPUT, MATTRESS_INPUT];
  if (mode === 'units') return [UNIT_INPUT];
  return [];
}

export type SofaQuoteShape = { quantity: number; options: Record<string, string | number | boolean> };

/** تبدیل ورودی فرم به ورودی نقل‌قول سرور. null یعنی ورودی ناقص است. */
export function sofaQuoteShape(mode: ServicePricingMode, options: Record<string, unknown>): SofaQuoteShape | null {
  const count = options.mattresses;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null;
  if (mode === 'units') return { quantity: count, options: {} };
  if (mode !== 'mattress_seat') return null;
  const seat = String(options.sofaSeats ?? '');
  if (seat.includes('۹') || seat.includes('9')) return { quantity: count, options: { seatSize: '9' } };
  if (seat.includes('۷') || seat.includes('7')) return { quantity: count, options: { seatSize: '7' } };
  return null;
}
