import type { CleanerSpecialty, CleanerTier } from '../types/cleaner';

export const CLEANER_SPECIALTY_LABELS: Record<CleanerSpecialty, string> = {
  HOME_UNIT: 'نظافت منزل',
  STAIRCASE_COMMON_AREAS: 'راه‌پله و مشاعات',
  OFFICE_COMPANY: 'اداری و شرکت',
  SOFA_CARPET_WASHING: 'مبل و فرش',
};

export const MARKETPLACE_BASE_PRICE = 150_000;

export type CleanerFilterTab = 'ALL' | CleanerTier;

export const CLEANER_FILTER_TABS: { key: CleanerFilterTab; label: string }[] = [
  { key: 'ALL', label: 'همه' },
  { key: 'STANDARD', label: 'معمولی' },
  { key: 'MID', label: 'متوسط' },
  { key: 'VIP', label: 'VIP' },
];
