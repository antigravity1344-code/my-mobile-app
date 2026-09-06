import type { CleaningService } from '../types/service';
import { SERVICES_CATALOG } from '../config/servicesData';
import type { BookingScheduleData } from '../types/booking';
import { calculatePrice } from '../utils/pricing';
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface BookingResponse {
  success: boolean;
  orderId?: string;
  error?: string;
}

export const getServices = (): CleaningService[] => SERVICES_CATALOG;

export const getServiceById = (id: string): CleaningService | undefined =>
  SERVICES_CATALOG.find(s => s.id === id);

export { calculatePrice };

export const submitBooking = async (payload: BookingScheduleData): Promise<BookingResponse> => {
  if (!API_URL) {
    await wait(700);
    return { success: true, orderId: `MOCK-${Date.now()}` };
  }

  try {
    const response = await fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as BookingResponse;
    if (!response.ok) {
      return { success: false, error: result.error || 'ثبت سفارش انجام نشد.' };
    }
    return result;
  } catch {
    return { success: false, error: 'ارتباط با سرویس ثبت سفارش برقرار نشد.' };
  }
};
