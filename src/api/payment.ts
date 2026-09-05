export interface PaymentRequest {
  orderId: string;
  amount: number; // IRR
  description: string;
  mobile: string;
  callbackUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  authority?: string;
  payUrl?: string;
  error?: string;
}

// Mock payment gateway (ZarinPal-like behavior)
export const requestPayment = async (payload: PaymentRequest): Promise<PaymentResult> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 700));

  // Simulate ~90% success rate for demo
  const success = Math.random() > 0.1;

  if (success) {
    const authority = `AUTH-${Date.now().toString(36).toUpperCase()}`;
    return {
      success: true,
      authority,
      payUrl: `https://gateway.example.com/pay/${authority}?amount=${payload.amount}`,
    };
  }

  return {
    success: false,
    error: 'درخواست پرداخت با خطا مواجه شد. لطفاً مجدداً تلاش کنید.',
  };
};

export const verifyPayment = async (
  _authority: string,
  _amount: number,
): Promise<{ success: boolean; refId?: string; error?: string }> => {
  await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 400));

  const success = Math.random() > 0.15;

  if (success) {
    return { success: true, refId: `REF-${Date.now().toString(36).toUpperCase()}` };
  }

  return { success: false, error: 'پرداخت تایید نشد. مبلغ به حساب شما بازگردانده شد.' };
};
