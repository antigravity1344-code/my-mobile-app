export type PricingType = 'hourly' | 'fixed' | 'count_based' | 'per_sqm' | 'negotiable';

export interface CleaningService {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  iconName: string;
  pricingType: PricingType;
  basePrice: number;
  isVisible: boolean;
  estimatedDurationHours?: number;
  badge?: string;
}
