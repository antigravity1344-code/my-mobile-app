import { describe, expect, it } from 'vitest';
import {
  isServiceEnabled,
  isServiceListed,
  isServiceUnavailable,
  parseDisabledServiceIds,
  parseUnavailableServiceIds,
  setDisabledServiceIds,
  setServiceAvailability,
} from './serviceAvailability';

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
});
