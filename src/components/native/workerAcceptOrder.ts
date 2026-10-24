import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { isAccountBlockedResponse } from '../../api/accountBlocked';
import { appStorage } from '../../utils/storage';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';

export type WorkerAcceptResult = { ok: true } | { ok: false; message: string | null };

/** همان درخواست پذیرش پنل سفارش‌ها؛ message=null یعنی حساب مسدود است و دیالوگ را هوک مسدودی نشان می‌دهد. */
export async function requestWorkerAccept(orderId: string, workerId: string): Promise<WorkerAcceptResult> {
  try {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    const res = await apiFetch('/orders/' + orderId + '/accept', {
      method: 'PUT',
      body: JSON.stringify({ cleanerId: workerId }),
    });
    if (res.success) return { ok: true };
    if (isAccountBlockedResponse(res)) return { ok: false, message: null };
    return { ok: false, message: res.message || 'پذیرش سفارش انجام نشد.' };
  } catch {
    return { ok: false, message: 'اتصال اینترنت را بررسی و دوباره تلاش کنید.' };
  }
}
