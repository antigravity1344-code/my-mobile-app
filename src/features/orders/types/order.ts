import type { JalaliDateOption, TimeSlot, AddressDetails, OrderPaymentStatus } from '../../../types/booking';
import type { CustomerTier, RecurringFrequency, FinalPrice } from '../../../utils/pricing';
import type { PricingType } from '../../../types/service';

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderPaymentMethod = 'ONLINE' | 'CASH';

export interface CleanerInfo {
  id: string;
  name: string;
  avatar?: string;
  phone: string;
  rating: number;
  completedJobsCount: number;
}

export type TimelineStepType =
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'STARTED'
  | 'FINISHED'
  | 'CANCELLED';

export interface OrderTimelineEvent {
  step: TimelineStepType;
  title: string;
  timestamp: string;
  description?: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface OrderRatingData {
  customerRating: number | null;
  customerComment?: string;
  customerTags?: string[];
  cleanerRating: number | null;
  cleanerNotes?: string;
  ratedAt?: string;
}

export interface OrderItem {
  id: string;
  orderNumber: string;
  serviceId: string;
  serviceTitle: string;
  serviceSubtitle?: string;
  pricingType: PricingType;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: OrderPaymentMethod;
  date: JalaliDateOption;
  timeSlot: TimeSlot;
  durationHours: number;
  genderPreference: 'FEMALE' | 'MALE' | 'NO_PREFERENCE';
  serviceOptions: Record<string, string | number | boolean>;
  recurringFrequency: RecurringFrequency;
  customerTier: CustomerTier;
  address: AddressDetails;
  pricing: FinalPrice;
  cleaner?: CleanerInfo;
  timeline: OrderTimelineEvent[];
  ratings?: OrderRatingData;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderFilterTab = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type OrderSortOption = 'NEWEST' | 'OLDEST' | 'PRICE_HIGH' | 'PRICE_LOW';

export interface OrderStats {
  totalCount: number;
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
  totalSpent: number;
}
