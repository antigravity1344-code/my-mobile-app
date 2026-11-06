import { describe, expect, it } from 'vitest';
import { isServiceEnabled, parseDisabledServiceIds, setDisabledServiceIds } from './serviceAvailability';

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
});
