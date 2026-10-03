import { describe, expect, it } from 'vitest';

import type { CleaningService } from '../types/service';
import { calculatePrice } from './pricing';

const hourlyLabor = {
  id: 'hourly_labor',
  basePrice: 120000,
  estimatedDurationHours: 3,
} as CleaningService;

describe('calculatePrice hourly labor', () => {
  it('uses the selected duration when the hours option is absent', () => {
    expect(calculatePrice(hourlyLabor, 5, {})).toBe(600000);
  });

  it('keeps an explicit hours option ahead of the duration control', () => {
    expect(calculatePrice(hourlyLabor, 5, { hours: 3 })).toBe(360000);
  });
});
