import { CleaningService } from '../types/service';

export const SERVICES_CATALOG: CleaningService[] = [
  {
    id: 'general_cleaning',
    title: 'نظافت منزل و محل کار',
    subtitle: 'خدمت استاندارد',
    description: 'نظافت راه پله، سالن و اتاق‌ها با نیروهای آموزش‌دیده',
    iconName: 'home-outline',
    pricingType: 'hourly',
    basePrice: 150000,
    estimatedDurationHours: 4,
    badge: 'پرفروش',
    isVisible: true,
  },
  {
    id: 'sofa_washing',
    title: 'مبل‌شویی تخصصی در محل',
    subtitle: 'شستشوی مبلمان',
    description: 'شستشوی انواع مبلمان با دستگاه مکانیزه',
    iconName: 'color-palette-outline',
    pricingType: 'count_based',
    basePrice: 250000,
    estimatedDurationHours: 3,
    badge: 'در دسترس',
    isVisible: false,
  },
];
