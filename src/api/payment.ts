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

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
    const result = (await response.json()) as PaymentResult;
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
    return { success: authority.startsWith('mock-'), refId: `MOCK-${amount}-${Date.now()}` };
  }

  try {
    const response = await fetch(`${API_URL}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authority, amount }),
    });
    const result = (await response.json()) as { success: boolean; refId?: string; error?: string };
    return response.ok ? result : { success: false, error: result.error || 'پرداخت تایید نشد.' };
  } catch {
    return { success: false, error: 'ارتباط با سرویس تایید پرداخت برقرار نشد.' };
  }
};
