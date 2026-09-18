import { describe, expect, it } from 'vitest';
import type { CleanerProfile } from '../types/cleaner';
import { calculateCleanerStats, filterCleaners } from './filterCleaners';

const sample: CleanerProfile[] = [
  {
    id: 'CLN-1',
    fullName: 'مریم مرادی',
    phone: '09120000000',
    tier: 'VIP',
    specialties: ['HOME_UNIT'],
    district: 'سعادت‌آباد',
    rating: 4.9,
    completedJobsCount: 10,
    bio: 'متخصص نظافت منزل',
    isVerified: true,
    avatarColor: '#0284c7',
  },
  {
    id: 'CLN-2',
    fullName: 'زهرا احمدی',
    phone: '09120000001',
    tier: 'STANDARD',
    specialties: ['STAIRCASE_COMMON_AREAS'],
    district: 'پونک',
    rating: 4.6,
    completedJobsCount: 4,
    bio: 'قیمت اقتصادی',
    isVerified: true,
    avatarColor: '#d97706',
  },
];

describe('filterCleaners', () => {
  it('filters by VIP tier', () => {
    expect(filterCleaners(sample, 'VIP', '')).toHaveLength(1);
    expect(filterCleaners(sample, 'VIP', '')[0].id).toBe('CLN-1');
  });

  it('searches by district', () => {
    expect(filterCleaners(sample, 'ALL', 'پونک')).toHaveLength(1);
    expect(filterCleaners(sample, 'ALL', 'پونک')[0].fullName).toBe('زهرا احمدی');
  });

  it('calculates marketplace stats', () => {
    expect(calculateCleanerStats(sample)).toEqual({
      totalCount: 2,
      standardCount: 1,
      midCount: 0,
      vipCount: 1,
    });
  });
});
