export interface PaymentRequest {
  orderId: string;
  amount: number; // IRR
  description: string;
  mobile: string;
  paymentMethod?: 'ONLINE' | 'CASH';
  callbackUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  authority?: string;
  payUrl?: string;
  isMock?: boolean;
  error?: string;
}

interface PaymentVerificationResult {
  success: boolean;
  refId?: string;
  error?: string;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPaymentResult = (value: unknown): value is PaymentResult =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && (value.authority === undefined || typeof value.authority === 'string')
  && (value.payUrl === undefined || typeof value.payUrl === 'string')
  && (value.isMock === undefined || typeof value.isMock === 'boolean')
  && (value.error === undefined || typeof value.error === 'string')
  && (!value.success ? typeof value.error === 'string' : typeof value.authority === 'string');

const isPaymentVerificationResult = (value: unknown): value is PaymentVerificationResult =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && (value.refId === undefined || typeof value.refId === 'string')
  && (value.error === undefined || typeof value.error === 'string')
  && (!value.success ? typeof value.error === 'string' : typeof value.refId === 'string');

export const requestPayment = async (payload: PaymentRequest): Promise<PaymentResult> => {
  if (!API_URL) {
    await wait(700);
    return { success: true, authority: `mock-${Date.now()}`, isMock: true };
  }

  try {
    const response = await fetch(`${API_URL}/payments/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result: unknown = await response.json();
    if (!isPaymentResult(result)) {
      return { success: false, error: 'پاسخ سرویس پرداخت معتبر نیست.' };
    }
    return response.ok ? result : { success: false, error: result.error || 'درخواست پرداخت انجام نشد.' };
  } catch {
    return { success: false, error: 'ارتباط با سرویس پرداخت برقرار نشد.' };
  }
};

export const verifyPayment = async (
  authority: string,
  amount: number,
): Promise<{ success: boolean; refId?: string; error?: string }> => {
  if (!API_URL) {
    await wait(500);
    if (!authority.startsWith('mock-')) {
      return { success: false, error: 'کد پرداخت آزمایشی معتبر نیست.' };
    }
    return { success: true, refId: `MOCK-${amount}-${Date.now()}` };
  }

  try {
    const response = await fetch(`${API_URL}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authority, amount }),
    });
    const result: unknown = await response.json();
    if (!isPaymentVerificationResult(result)) {
      return { success: false, error: 'پاسخ تایید پرداخت معتبر نیست.' };
    }
    return response.ok ? result : { success: false, error: result.error || 'پرداخت تایید نشد.' };
  } catch {
    return { success: false, error: 'ارتباط با سرویس تایید پرداخت برقرار نشد.' };
  }
};
