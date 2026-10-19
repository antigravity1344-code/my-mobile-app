import type { FinalPrice } from '../../../utils/pricing';
import type { PricingType } from '../../../types/service';

export const NO_TARIFF_MESSAGE = 'تعرفه این خدمت هنوز تعیین نشده است.';
export const CONNECTION_MESSAGE = 'ارتباط برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.';

const NON_OPTION_KEYS = new Set(['durationHours', 'price', 'total', 'basePrice', 'confirmedTotal', 'quoteToken']);

export type QuoteSelection = {
  serviceId: string;
  pricingType: PricingType | string;
  durationHours: number;
  serviceOptions: Record<string, string | number | boolean>;
};

export type QuoteRequestBody = {
  serviceId: string;
  quantity?: number;
  options: Record<string, string | number | boolean>;
};

export type ServerQuoteLine = { id: string; amount: number };

export type ServerQuote = {
  quoteToken: string;
  subtotal: number;
  surcharges: ServerQuoteLine[];
  discounts: ServerQuoteLine[];
  total: number;
  currencyUnit: string;
  tariffVersionId: string;
  expiresAt: string;
};

export type QuoteView =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; quote: ServerQuote; request: QuoteRequestBody }
  | { status: 'unavailable'; message: string; code?: string }
  | { status: 'network'; message: string };

type QuoteTransport = (body: QuoteRequestBody) => Promise<{ success?: boolean; code?: string; message?: string; quote?: unknown } | null>;

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function optionValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'boolean') return value;
  if (isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && value.length <= 80) return value;
  return null;
}

export function quoteOptions(options: Record<string, unknown> | null | undefined): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  if (!options) return clean;
  for (const key of Object.keys(options).sort()) {
    if (NON_OPTION_KEYS.has(key)) continue;
    const value = optionValue(options[key]);
    if (value != null) clean[key] = value;
  }
  return clean;
}

function positiveIntegerOption(options: Record<string, string | number | boolean>): number | null {
  for (const key of ['quantity', 'count', 'area', 'floors', 'mattresses']) {
    const value = options[key];
    if (isInteger(value) && value > 0) return value;
  }
  return null;
}

export function buildQuoteRequest(selection: QuoteSelection): { ok: true; body: QuoteRequestBody } | { ok: false; message: string } {
  const serviceId = selection.serviceId.trim();
  if (!serviceId) return { ok: false, message: 'خدمت را انتخاب کنید.' };
  const options = quoteOptions(selection.serviceOptions);
  if (selection.pricingType === 'hourly') {
    if (!isInteger(selection.durationHours) || selection.durationHours < 1) {
      return { ok: false, message: 'مدت خدمت را انتخاب کنید.' };
    }
    return { ok: true, body: { serviceId, quantity: selection.durationHours, options } };
  }
  if (selection.pricingType === 'fixed') {
    return { ok: true, body: { serviceId, options } };
  }
  const quantity = positiveIntegerOption(options);
  if (quantity == null) return { ok: false, message: 'تعداد یا متراژ را انتخاب کنید.' };
  return { ok: true, body: { serviceId, quantity, options } };
}

export function quoteSelectionKey(selection: QuoteSelection): string {
  const built = buildQuoteRequest(selection);
  if (!built.ok) return `blocked:${selection.serviceId}:${built.message}`;
  return JSON.stringify(built.body);
}

function lines(value: unknown): ServerQuoteLine[] | null {
  if (!Array.isArray(value)) return null;
  const result: ServerQuoteLine[] = [];
  for (const line of value) {
    if (!line || typeof line !== 'object') return null;
    const id = (line as { id?: unknown }).id;
    const amount = (line as { amount?: unknown }).amount;
    if (typeof id !== 'string' || !id || !isInteger(amount)) return null;
    result.push({ id, amount });
  }
  return result;
}

export function parseServerQuote(raw: unknown): ServerQuote | null {
  if (!raw || typeof raw !== 'object') return null;
  const quote = raw as Record<string, unknown>;
  if (typeof quote.quoteToken !== 'string' || quote.quoteToken.length === 0 || quote.quoteToken.length > 32768) return null;
  if (!isInteger(quote.subtotal) || !isInteger(quote.total)) return null;
  if (typeof quote.currencyUnit !== 'string' || quote.currencyUnit.trim() === '') return null;
  if (typeof quote.tariffVersionId !== 'string' || quote.tariffVersionId.trim() === '') return null;
  if (typeof quote.expiresAt !== 'string' || quote.expiresAt.trim() === '') return null;
  const surcharges = lines(quote.surcharges);
  const discounts = lines(quote.discounts);
  if (!surcharges || !discounts) return null;
  return {
    quoteToken: quote.quoteToken,
    subtotal: quote.subtotal,
    surcharges,
    discounts,
    total: quote.total,
    currencyUnit: quote.currencyUnit,
    tariffVersionId: quote.tariffVersionId,
    expiresAt: quote.expiresAt,
  };
}

/** Show the server integer and its own unit. No rate conversion and no assumed toman label. */
export function formatServerAmount(amount: number, currencyUnit: string): string {
  return `${amount.toLocaleString('fa-IR')} ${currencyUnit}`;
}

export function serverQuoteAsFinalPrice(quote: ServerQuote): FinalPrice {
  const discountAmount = quote.discounts.reduce((sum, line) => sum + line.amount, 0);
  return {
    subtotal: quote.subtotal,
    earlyBirdDiscountRate: 0,
    earlyBirdDiscountAmount: 0,
    tierDiscountRate: 0,
    tierDiscountAmount: 0,
    recurringDiscountRate: 0,
    recurringDiscountAmount: 0,
    discountRate: 0,
    discountAmount,
    recurringDiscountDeferred: false,
    total: quote.total,
  };
}

export function isQuoteRefreshCode(code: unknown): boolean {
  return code === 'PRICE_CHANGED' || code === 'QUOTE_EXPIRED';
}

export async function requestServerQuote(body: QuoteRequestBody, transport?: QuoteTransport): Promise<QuoteView> {
  const send = transport ?? (async (payload) => {
    const { apiFetch } = await import('../../../api/apiClient');
    return apiFetch('/pricing/quote', { method: 'POST', body: JSON.stringify(payload) });
  });
  let response: Awaited<ReturnType<QuoteTransport>>;
  try {
    response = await send(body);
  } catch {
    return { status: 'network', message: CONNECTION_MESSAGE };
  }
  if (!response || response.success !== true) {
    if (!response || response.message === CONNECTION_MESSAGE) {
      return { status: 'network', message: CONNECTION_MESSAGE };
    }
    const message = response.code === 'NO_TARIFF' || response.message === NO_TARIFF_MESSAGE
      ? NO_TARIFF_MESSAGE
      : (typeof response.message === 'string' && response.message ? response.message : 'قیمت این خدمت از سرور دریافت نشد.');
    return { status: 'unavailable', message, code: response.code };
  }
  const quote = parseServerQuote(response.quote);
  if (!quote) return { status: 'unavailable', message: 'پاسخ قیمت سرور قابل نمایش نیست.' };
  return { status: 'ready', quote, request: body };
}
