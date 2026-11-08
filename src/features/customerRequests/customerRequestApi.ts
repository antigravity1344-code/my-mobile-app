import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { CUSTOMER_TOKEN_KEY } from '../../components/native/customerLoginStorage';
import { appStorage } from '../../utils/storage';
import type { CustomerRequestPayload } from './customerRequestPayload';

export type CustomerRequestView = {
  id: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  adjustmentBasisPoints: number;
  status: 'OPEN' | 'ACCEPTED' | 'CANCELLED';
  total: number | null;
  createdAt: string;
};

export type CustomerRequestResult<T> = { ok: true; value: T } | { ok: false; message: string };

const FAILED = 'انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';

function messageOf(result: unknown): string {
  if (result && typeof result === 'object') {
    const message = (result as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return FAILED;
}

async function call(endpoint: string, init?: RequestInit): Promise<unknown> {
  await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
  return apiFetch(endpoint, init);
}

export async function createCustomerRequest(payload: CustomerRequestPayload): Promise<CustomerRequestResult<CustomerRequestView>> {
  try {
    const result = await call('/customer/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const request = result && typeof result === 'object' ? (result as { request?: CustomerRequestView }).request : undefined;
    if (request) return { ok: true, value: request };
    return { ok: false, message: messageOf(result) };
  } catch {
    return { ok: false, message: FAILED };
  }
}

export async function loadCustomerRequestBounds(): Promise<{ minPercent: number; maxPercent: number } | null> {
  try {
    const result = await call('/customer/request-bounds');
    const body = result && typeof result === 'object' ? (result as { minPercent?: unknown; maxPercent?: unknown }) : null;
    if (body && typeof body.minPercent === 'number' && typeof body.maxPercent === 'number') return { minPercent: body.minPercent, maxPercent: body.maxPercent };
    return null;
  } catch {
    return null;
  }
}

export async function listCustomerRequests(): Promise<CustomerRequestResult<CustomerRequestView[]>> {
  try {
    const result = await call('/customer/requests');
    const requests = result && typeof result === 'object' ? (result as { requests?: CustomerRequestView[] }).requests : undefined;
    if (Array.isArray(requests)) return { ok: true, value: requests };
    return { ok: false, message: messageOf(result) };
  } catch {
    return { ok: false, message: FAILED };
  }
}

export async function cancelCustomerRequest(id: string): Promise<CustomerRequestResult<true>> {
  try {
    const result = await call(`/customer/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (result && typeof result === 'object' && (result as { success?: unknown }).success === true) return { ok: true, value: true };
    return { ok: false, message: messageOf(result) };
  } catch {
    return { ok: false, message: FAILED };
  }
}
