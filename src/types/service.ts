export type PricingType = 'hourly' | 'fixed' | 'count_based' | 'per_sqm' | 'negotiable';

export interface ServiceConfiguration {
  pricingLabel: string;
  includedOptions?: string[];
  paidOptions?: string[];
  inputs?: ServiceInput[];
}

export interface ServiceInput {
  id: string;
  label: string;
  type: 'number' | 'select' | 'boolean';
  options?: string[];
  price?: number;
}

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
  configuration: ServiceConfiguration;
}
