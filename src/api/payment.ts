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

export const toPaymentAmountInRials = (amountInTomans: number): number => amountInTomans * 10;

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parsePaymentResult = (value: unknown): PaymentResult => {
  if (!isRecord(value) || typeof value.success !== 'boolean') {
    return { success: false, error: 'پاسخ نامعتبر از سرویس پرداخت دریافت شد.' };
  }

  const result: PaymentResult = { success: value.success };
  if (value.authority !== undefined && typeof value.authority !== 'string') {
    return { success: false, error: 'کد پرداخت دریافت‌شده معتبر نیست.' };
  }
  if (value.payUrl !== undefined && typeof value.payUrl !== 'string') {
    return { success: false, error: 'لینک پرداخت دریافتشده معتبر نیست.' };
  }
  if (value.isMock !== undefined && typeof value.isMock !== 'boolean') {
    return { success: false, error: 'نوع پاسخ پرداخت معتبر نیست.' };
  }
  if (value.error !== undefined && typeof value.error !== 'string') {
    return { success: false, error: 'پیام خطای پرداخت معتبر نیست.' };
  }

  if (value.authority !== undefined) result.authority = value.authority;
  if (value.payUrl !== undefined) result.payUrl = value.payUrl;
  if (value.isMock !== undefined) result.isMock = value.isMock;
  if (value.error !== undefined) result.error = value.error;
  return result;
};

const parsePaymentVerification = (value: unknown): { success: boolean; refId?: string; error?: string } => {
  if (!isRecord(value) || typeof value.success !== 'boolean') {
    return { success: false, error: 'پاسخ نامعتبر از سرویس تایید پرداخت دریافت شد.' };
  }
  if (value.refId !== undefined && typeof value.refId !== 'string') {
    return { success: false, error: 'کد پیگیری پرداخت معتبر نیست.' };
  }
  if (value.error !== undefined && typeof value.error !== 'string') {
    return { success: false, error: 'پیام خطای پرداخت معتبر نیست.' };
  }
  return {
    success: value.success,
    ...(value.refId !== undefined ? { refId: value.refId } : {}),
    ...(value.error !== undefined ? { error: value.error } : {}),
  };
};

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
    const result = parsePaymentResult(await response.json());
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
      return { success: false, error: 'پرداخت آزمایشی تایید نشد.' };
    }
    return { success: true, refId: `MOCK-${amount}-${Date.now()}` };
  }

  try {
    const response = await fetch(`${API_URL}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authority, amount }),
    });
    const result = parsePaymentVerification(await response.json());
    return response.ok ? result : { success: false, error: result.error || 'پرداخت تایید نشد.' };
  } catch {
    return { success: false, error: 'ارتباط با سرویس تایید پرداخت برقرار نشد.' };
  }
};
