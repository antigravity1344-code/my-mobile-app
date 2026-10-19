/**
 * کلید تکرارنشدنی یک رزرو (D-07). سرور فقط [A-Za-z0-9_-] با طول ۸ تا ۶۴ می‌پذیرد.
 * یکتایی فقط برای همان مشتری لازم است؛ زمان + عدد تصادفی کافی است.
 */
export function createClientRequestId(): string {
  const random = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `bk-${Date.now().toString(36)}-${random()}${random()}`;
}

export type HeldClientRequest = { id: string; fingerprint: string };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = stable(source[key]);
    return sorted;
  }
  return value;
}

/** Identity of one booking attempt. A new service, option, schedule, address, or price needs a new id. */
export function bookingRequestFingerprint(input: {
  serviceId: string;
  options: Record<string, string | number | boolean>;
  quantity?: number;
  durationHours: number;
  confirmedTotal: number;
  currencyUnit: string;
  date: string;
  time: string;
  address: Record<string, string>;
  genderPreference: string;
  recurringFrequency: string;
  notes: string;
}): string {
  return JSON.stringify(stable(input));
}

/**
 * Reuse the held id only while the booking fingerprint is unchanged, so an unknown network retry
 * hits the same server request. A real change mints a new id.
 */
export function clientRequestIdForAttempt(
  held: HeldClientRequest | null,
  fingerprint: string,
  createId: () => string = createClientRequestId,
): HeldClientRequest {
  if (held && held.fingerprint === fingerprint) return held;
  return { id: createId(), fingerprint };
}

export type StoredBookingAttempt = {
  id: string;
  selectionFingerprint: string;
  quoteToken: string;
  confirmedTotal: number;
  currencyUnit: string;
  quantity?: number;
  serviceId: string;
  options: Record<string, string | number | boolean>;
};

/** Selection identity without the quote. A refreshed price must not look like a new booking. */
export function bookingSelectionFingerprint(input: {
  serviceId: string;
  options: Record<string, string | number | boolean>;
  quantity?: number;
  durationHours: number;
  date: string;
  time: string;
  address: Record<string, string>;
  genderPreference: string;
  recurringFrequency: string;
  notes: string;
}): string {
  return JSON.stringify(stable(input));
}

/**
 * After an unknown network result, the original token and total stay with this selection.
 * A fresher quote is used only when the customer actually changed the booking.
 */
export function resolveBookingSubmission(
  held: StoredBookingAttempt | null,
  selectionFingerprint: string,
  fresh: {
    quoteToken: string;
    confirmedTotal: number;
    currencyUnit: string;
    quantity?: number;
    serviceId: string;
    options: Record<string, string | number | boolean>;
  },
  createId: () => string = createClientRequestId,
): StoredBookingAttempt {
  if (held && held.selectionFingerprint === selectionFingerprint) return held;
  return {
    id: createId(),
    selectionFingerprint,
    quoteToken: fresh.quoteToken,
    confirmedTotal: fresh.confirmedTotal,
    currencyUnit: fresh.currencyUnit,
    quantity: fresh.quantity,
    serviceId: fresh.serviceId,
    options: fresh.options,
  };
}

export function isUnknownNetworkFailure(result: { success: boolean; code?: string | null }): boolean {
  return result.success !== true && (typeof result.code !== 'string' || result.code.trim() === '');
}

/** Keep the sent attempt when the server may already have saved it. A known rejection releases it. */
export function attemptAfterSubmit(
  sent: StoredBookingAttempt,
  result: { success: boolean; code?: string | null },
): StoredBookingAttempt | null {
  if (result.success) return null;
  if (isUnknownNetworkFailure(result)) return sent;
  if (
    result.code === 'QUOTE_EXPIRED'
    || result.code === 'PRICE_CHANGED'
    || result.code === 'NO_TARIFF'
    || result.code === 'PRICE_NOT_CONFIRMED'
    || result.code === 'INPUT_INVALID'
  ) {
    return null;
  }
  return sent;
}
