import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { appStorage } from '../../utils/storage';
import { previewActive } from './previewRuntime';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';

export const WORKER_OFFERS_ENDPOINT = '/workers/me/offers';
export const OFFERS_LOAD_ERROR = 'دریافت پیشنهادها انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';
export const OFFERS_SAVE_ERROR = 'ثبت پیشنهاد تأیید نشد. فهرست را بازخوانی کنید و دوباره تلاش کنید.';
export const OFFERS_PREVIEW_BLOCKED = 'ثبت پیشنهاد در پیش‌نمایش انجام نمی‌شود.';

export * from './workerOffersModel';
import { errorMessage, parseOffersResponse, type OfferActionResult, type OffersResult } from './workerOffersModel';

export async function loadWorkerOffers(signal?: AbortSignal): Promise<OffersResult> {
  try {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    if (signal?.aborted) return { ok: false, message: OFFERS_LOAD_ERROR };
    const result: unknown = await apiFetch(WORKER_OFFERS_ENDPOINT, { signal });
    const data = parseOffersResponse(result);
    return data ? { ok: true, data } : { ok: false, message: errorMessage(result, OFFERS_LOAD_ERROR) };
  } catch {
    return { ok: false, message: OFFERS_LOAD_ERROR };
  }
}

export async function createWorkerOffer(
  input: { serviceId: string; startAt: string; endAt: string; adjustmentBasisPoints: number },
  signal?: AbortSignal,
): Promise<OfferActionResult> {
  if (previewActive()) return { ok: false, message: OFFERS_PREVIEW_BLOCKED };
  try {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    const result: unknown = await apiFetch(WORKER_OFFERS_ENDPOINT, { method: 'POST', body: JSON.stringify(input), signal });
    if (result && typeof result === 'object' && (result as { success?: unknown }).success === true) return { ok: true };
    return { ok: false, message: errorMessage(result, OFFERS_SAVE_ERROR) };
  } catch {
    return { ok: false, message: OFFERS_SAVE_ERROR };
  }
}

export async function cancelWorkerOffer(id: string, signal?: AbortSignal): Promise<OfferActionResult> {
  if (previewActive()) return { ok: false, message: OFFERS_PREVIEW_BLOCKED };
  try {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    const result: unknown = await apiFetch(`${WORKER_OFFERS_ENDPOINT}/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
    if (result && typeof result === 'object' && (result as { success?: unknown }).success === true) return { ok: true };
    return { ok: false, message: errorMessage(result, OFFERS_SAVE_ERROR) };
  } catch {
    return { ok: false, message: OFFERS_SAVE_ERROR };
  }
}
