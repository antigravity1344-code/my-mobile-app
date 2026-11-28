import { describe, expect, it } from 'vitest';
import { getBookingTimingErrors } from './bookingTimingValidation';

const valid = { hasDate: true, hasTime: true, durationHours: 4, minimumHours: 2, options: {}, sofaMode: null };

describe('required booking fields', () => {
  it('explains what is required before and after choosing the date', () => {
    expect(getBookingTimingErrors({ ...valid, hasDate: false, hasTime: false })).toEqual({
      date: 'تاریخ مراجعه را انتخاب کنید.', time: 'ابتدا تاریخ مراجعه را انتخاب کنید.',
    });
    expect(getBookingTimingErrors({ ...valid, hasTime: false })).toEqual({ time: 'ساعت شروع کار را انتخاب کنید.' });
  });

  it('names each blank staircase field and accepts zero parking floors', () => {
    const booking = { ...valid, serviceId: 'staircase_common_areas' };
    expect(Object.keys(getBookingTimingErrors({ ...booking, options: { floors: '', unitsPerFloor: 0, parkingFloors: '' } })))
      .toEqual(['floors', 'unitsPerFloor', 'parkingFloors']);
    expect(getBookingTimingErrors({ ...booking, options: { floors: 4, unitsPerFloor: 2, parkingFloors: 0 } })).toEqual({});
  });

  it('checks only the fields required by the selected model', () => {
    expect(Object.keys(getBookingTimingErrors({ ...valid, pricingType: 'hourly', durationHours: 1 }))).toEqual(['duration']);
    expect(Object.keys(getBookingTimingErrors({ ...valid, pricingType: 'per_sqm' }))).toEqual(['area']);
    expect(Object.keys(getBookingTimingErrors({ ...valid, serviceId: 'sofa_carpet_washing', sofaMode: 'mattress_seat' })))
      .toEqual(['sofaSeats', 'mattresses']);
    expect(getBookingTimingErrors({ ...valid, pricingType: 'fixed' })).toEqual({});
  });
});
