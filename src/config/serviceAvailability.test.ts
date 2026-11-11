import { describe, expect, it } from 'vitest';
import {
  isServiceEnabled,
  isServiceListed,
  isServiceUnavailable,
  isTierExempt,
  parseDisabledServiceIds,
  parsePricingRules,
  parseUnavailableServiceIds,
  setDisabledServiceIds,
  setPricingRules,
  setServiceAvailability,
} from './serviceAvailability';
import { tierLockApplies } from '../features/orders/services/serverQuote';

describe('serviceAvailability', () => {
  it('parses only a successful list of ids', () => {
    expect(parseDisabledServiceIds({ success: true, disabledServiceIds: ['a', 3, '', 'b'] })).toEqual(['a', 'b']);
    expect(parseDisabledServiceIds({ success: false, disabledServiceIds: [] })).toBeNull();
    expect(parseDisabledServiceIds({ success: true })).toBeNull();
    expect(parseDisabledServiceIds(null)).toBeNull();
  });
  it('disables and re-enables services', () => {
    expect(isServiceEnabled('hourly_labor')).toBe(true);
    setDisabledServiceIds(['hourly_labor']);
    expect(isServiceEnabled('hourly_labor')).toBe(false);
    expect(isServiceEnabled('building_painting')).toBe(true);
    setDisabledServiceIds([]);
    expect(isServiceEnabled('hourly_labor')).toBe(true);
  });
  it('keeps a service listed but not bookable when no specialist is ready', () => {
    expect(parseUnavailableServiceIds({ success: true, disabledServiceIds: [], unavailableServiceIds: ['patient_companion', 4] })).toEqual(['patient_companion']);
    expect(parseUnavailableServiceIds({ success: true, disabledServiceIds: [] })).toEqual([]);
    setServiceAvailability([], ['patient_companion']);
    expect(isServiceListed('patient_companion')).toBe(true);
    expect(isServiceUnavailable('patient_companion')).toBe(true);
    expect(isServiceEnabled('patient_companion')).toBe(false);
    setServiceAvailability(['patient_companion'], ['patient_companion']);
    expect(isServiceListed('patient_companion')).toBe(false);
    expect(isServiceUnavailable('patient_companion')).toBe(false);
    setServiceAvailability([], []);
    expect(isServiceEnabled('patient_companion')).toBe(true);
  });
  it('takes tier exemption from the tariff flag, not from a service id', () => {
    expect(parsePricingRules({ success: false, pricingRules: [] })).toBeNull();
    expect(parsePricingRules({ success: true })).toEqual([]);
    expect(parsePricingRules({
      success: true,
      pricingRules: [
        { serviceId: 'staircase_common_areas', model: 'fixed', exemptFromTierLock: true },
        { serviceId: 'home_unit_cleaning', model: 'hourly', exemptFromTierLock: false },
        { serviceId: 'bad', model: 'other', exemptFromTierLock: true },
      ],
    })).toEqual([
      { serviceId: 'staircase_common_areas', model: 'fixed', exemptFromTierLock: true, pricingMode: null },
      { serviceId: 'home_unit_cleaning', model: 'hourly', exemptFromTierLock: false, pricingMode: null },
    ]);
    expect(tierLockApplies('staircase_common_areas', false)).toBe(true);
    setPricingRules([{ serviceId: 'staircase_common_areas', model: 'fixed', exemptFromTierLock: true }]);
    expect(isTierExempt('staircase_common_areas')).toBe(true);
    expect(tierLockApplies('staircase_common_areas', false)).toBe(false);
    expect(tierLockApplies('home_unit_cleaning', false)).toBe(true);
    expect(tierLockApplies('staircase_common_areas', true)).toBe(false);
    setPricingRules([]);
    expect(tierLockApplies('staircase_common_areas', false)).toBe(true);
  });
});
