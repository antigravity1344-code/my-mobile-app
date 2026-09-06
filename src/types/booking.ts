import { CleaningService } from './service';
import type { CustomerTier, RecurringFrequency, FinalPrice } from '../utils/pricing';

export interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
  period: 'MORNING' | 'AFTERNOON' | 'EVENING';
  isAvailable: boolean;
  extraFee?: number;
}

export interface JalaliDateOption {
  dateString: string;
  dayOfWeek: string;
  dayOfMonth: number;
  monthName: string;
  isToday?: boolean;
  isTomorrow?: boolean;
  isHoliday?: boolean;
}

export interface AddressCoordinates {
  latitude: number;
  longitude: number;
}

export interface AddressDetails {
  district: string;
  fullAddress: string;
  plaque: string;
  unit: string;
  floor?: string;
  hasElevator: boolean;
  contactPhone: string;
  recipientName: string;
  addressNotes?: string;
  coordinates: AddressCoordinates;
  isSaved?: boolean;
}

export interface BookingScheduleData {
  selectedService: CleaningService | null;
  selectedDate: JalaliDateOption | null;
  selectedTimeSlot: TimeSlot | null;
  durationHours: number;
  genderPreference: 'FEMALE' | 'MALE' | 'NO_PREFERENCE';
  notes?: string;
  addressDetails: AddressDetails | null;
  serviceOptions?: Record<string, string | number | boolean>;
  recurringFrequency: RecurringFrequency;
  customerTier: CustomerTier;
  customer_rating: number | null;
  cleaner_rating: number | null;
  metadata: OrderMetadata;
  pricing?: FinalPrice;
}

export interface OrderMetadata {
  customer_tier: CustomerTier;
  recurring_frequency: RecurringFrequency;
  customer_rating: number | null;
  cleaner_rating: number | null;
}

export type OrderPaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface PaymentReceipt {
  orderId: string;
  status: OrderPaymentStatus;
  amountInRials: number;
  refId?: string;
  paidAt: string;
  error?: string;
}