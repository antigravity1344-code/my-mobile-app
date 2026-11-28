import { STAIR_SERVICE, buildingOptions } from '../../../server/pricing/staircase';
import { SOFA_SERVICE_ID } from '../../config/sofaPricingMode';
import type { ServicePricingMode } from '../../config/serviceAvailability';

type Field = 'date' | 'time' | 'duration' | 'floors' | 'unitsPerFloor' | 'parkingFloors' | 'area' | 'sofaSeats' | 'mattresses';
export type BookingTimingErrors = Partial<Record<Field, string>>;

export function getBookingTimingErrors(input: {
  serviceId?: string;
  pricingType?: string;
  hasDate: boolean;
  hasTime: boolean;
  durationHours: number;
  minimumHours: number;
  options: Record<string, string | number | boolean>;
  sofaMode: ServicePricingMode;
}): BookingTimingErrors {
  const errors: BookingTimingErrors = {};
  if (!input.hasDate) errors.date = 'تاریخ مراجعه را انتخاب کنید.';
  if (!input.hasTime) errors.time = input.hasDate ? 'ساعت شروع کار را انتخاب کنید.' : 'ابتدا تاریخ مراجعه را انتخاب کنید.';
  if (input.pricingType === 'hourly' && (!Number.isSafeInteger(input.durationHours) || input.durationHours < input.minimumHours)) {
    errors.duration = 'مدت خدمت را انتخاب کنید.';
  }
  const atLeast = (value: unknown, minimum: number) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
  if (input.serviceId === STAIR_SERVICE) {
    const building = buildingOptions(input.options);
    if (!atLeast(building.floors, 1)) errors.floors = 'تعداد طبقات مسکونی را وارد کنید. حداقل ۱ طبقه.';
    if (!atLeast(building.unitsPerFloor, 1)) errors.unitsPerFloor = 'تعداد واحد در هر طبقه را وارد کنید. حداقل ۱ واحد.';
    if (!atLeast(building.parkingFloors, 0)) errors.parkingFloors = 'تعداد طبقات پارکینگ را وارد کنید. اگر پارکینگ ندارد، ۰ بزنید.';
  }
  if (input.pricingType === 'per_sqm' && !atLeast(input.options.area, 1)) {
    errors.area = 'متراژ را به متر مربع وارد کنید. حداقل ۱ متر مربع.';
  }
  if (input.serviceId === SOFA_SERVICE_ID && input.sofaMode) {
    if (input.sofaMode === 'mattress_seat' && !/[۷۹79]/.test(String(input.options.sofaSeats ?? ''))) {
      errors.sofaSeats = 'تعداد نشیمن مبل را انتخاب کنید.';
    }
    if (!atLeast(input.options.mattresses, 1)) {
      errors.mattresses = input.sofaMode === 'units' ? 'تعداد واحد را وارد کنید. حداقل ۱ واحد.' : 'تعداد تشک را وارد کنید. حداقل ۱ تشک.';
    }
  }
  return errors;
}
