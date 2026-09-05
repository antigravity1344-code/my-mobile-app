import type { CleaningService } from '../types/service';
import { SERVICES_CATALOG } from '../config/servicesData';

export const getServices = (): CleaningService[] => SERVICES_CATALOG;

export const getServiceById = (id: string): CleaningService | undefined =>
  SERVICES_CATALOG.find(s => s.id === id);

export const calculatePrice = (
  service: CleaningService,
  durationHours: number,
): number => {
  if (service.pricingType === 'hourly') {
    return service.basePrice * durationHours;
  }
  return service.basePrice;
};

// Placeholder for future backend integration
export const submitBooking = async (payload: unknown): Promise<{ success: boolean; orderId?: string }> => {
  console.log('[API] Submit booking (mock):', payload);
  return { success: true, orderId: `ORDER-${Date.now()}` };
};
