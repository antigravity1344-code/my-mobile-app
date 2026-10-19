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
