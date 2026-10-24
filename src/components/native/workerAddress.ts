import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { appStorage } from '../../utils/storage';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';

export const WORKER_ADDRESS_ENDPOINT = '/workers/me/address';
export const ADDRESS_VALIDATION_MESSAGE = 'آدرس باید متن معتبر بین ۱ تا ۳۰۰ نویسه باشد.';
export const ADDRESS_LOAD_ERROR = 'دریافت آدرس انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';
export const ADDRESS_SAVE_ERROR = 'تأیید ذخیره دریافت نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';
export const ADDRESS_SAVED_MESSAGE = 'آدرس محل سکونت ذخیره شد.';

export function validWorkerAddress(address: string): boolean {
  const value = address.trim();
  return value.length > 0 && value.length <= 300 &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}

export type AddressResult =
  | { ok: true; address: string }
  | { ok: false; message: string; sessionExpired?: boolean };

async function requestAddress(options: RequestInit): Promise<AddressResult> {
  const fallback = options.method === 'PUT' ? ADDRESS_SAVE_ERROR : ADDRESS_LOAD_ERROR;
  try {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    if (options.signal?.aborted) return { ok: false, message: fallback };
    const result: unknown = await apiFetch(WORKER_ADDRESS_ENDPOINT, options);
    if (result && typeof result === 'object') {
      const data = result as Record<string, unknown>;
      if (data.success === true && typeof data.address === 'string') {
        return { ok: true, address: data.address };
      }
      return {
        ok: false,
        message: typeof data.message === 'string' && data.message ? data.message : fallback,
        sessionExpired: data.httpStatus === 401 || data.httpStatus === 403,
      };
    }
  } catch {
    // Storage failures and transport failures retain the editable draft.
  }
  return { ok: false, message: fallback };
}

export function loadWorkerAddress(signal?: AbortSignal): Promise<AddressResult> {
  return requestAddress({ signal });
}

export function saveWorkerAddress(address: string, signal?: AbortSignal): Promise<AddressResult> {
  if (!validWorkerAddress(address)) {
    return Promise.resolve({ ok: false, message: ADDRESS_VALIDATION_MESSAGE });
  }
  return requestAddress({ method: 'PUT', body: JSON.stringify({ address: address.trim() }), signal });
}

export type AddressState = {
  draft: string;
  savedAddress: string | null;
  phase: 'loading' | 'ready' | 'saving' | 'loadError';
  message: string | null;
  error: boolean;
  sessionExpired: boolean;
};
export const initialAddressState: AddressState = {
  draft: '', savedAddress: null, phase: 'loading', message: null, error: false, sessionExpired: false,
};
export type AddressAction =
  | { type: 'load' }
  | { type: 'save' }
  | { type: 'edit'; value: string }
  | { type: 'loaded' | 'saved'; result: AddressResult };

export function workerAddressReducer(state: AddressState, action: AddressAction): AddressState {
  if (action.type === 'load' || action.type === 'save') {
    return { ...state, phase: action.type === 'load' ? 'loading' : 'saving', message: null, error: false };
  }
  if (action.type === 'edit') {
    return { ...state, draft: action.value, message: null, error: false };
  }
  if (!action.result.ok) {
    return {
      ...state, phase: action.type === 'loaded' ? 'loadError' : 'ready',
      message: action.result.message, error: true, sessionExpired: !!action.result.sessionExpired,
    };
  }
  return {
    draft: action.result.address, savedAddress: action.result.address, phase: 'ready',
    message: action.type === 'saved' ? ADDRESS_SAVED_MESSAGE : null, error: false, sessionExpired: false,
  };
}
