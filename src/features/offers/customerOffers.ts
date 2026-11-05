import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { appStorage } from '../../utils/storage';
import { CUSTOMER_TOKEN_KEY } from '../../components/native/customerLoginStorage';
import { parseCustomerOffers, type CustomerOffer } from './customerOffersModel';

export const CUSTOMER_OFFERS_LOAD_ERROR = 'دریافت پیشنهادها انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';
export type CustomerOffersResult = { ok: true; offers: CustomerOffer[] } | { ok: false; message: string };

export async function loadCustomerOffers(signal?: AbortSignal): Promise<CustomerOffersResult> {
  try {
    await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
    if (signal?.aborted) return { ok: false, message: CUSTOMER_OFFERS_LOAD_ERROR };
    const result: unknown = await apiFetch('/offers', { signal });
    const offers = parseCustomerOffers(result);
    if (offers) return { ok: true, offers };
    const message = result && typeof result === 'object' ? (result as { message?: unknown }).message : null;
    return { ok: false, message: typeof message === 'string' && message ? message : CUSTOMER_OFFERS_LOAD_ERROR };
  } catch {
    return { ok: false, message: CUSTOMER_OFFERS_LOAD_ERROR };
  }
}
