export const STAIR_SERVICE: 'staircase_common_areas';
export type Rates = Record<'baseRate' | 'includedFloors' | 'extraFloor' | 'threeUnits' | 'fourUnits' |
  'parkingFloor' | 'glass' | 'yard' | 'roof' | 'mats' | 'detergent' | 'liftFromFloor' | 'noLiftPercent' , number>;
export const DEFAULT_RATES: Readonly<Rates>;
export const RATE_LABELS: Record<keyof Rates, string>;
export const BASE_BUILDING: Readonly<{ floors: number; unitsPerFloor: number; parkingFloors: number }>;
export const ADDONS: readonly ('glass' | 'yard' | 'roof' | 'mats')[];
export const SUPPLIES_NOTE: string;
export function validRates(value: unknown): value is Rates;
export function calculateStaircase(rates: Rates, options: Record<string, unknown>): {
  base: number; total: number; lines: { id: keyof Rates; amount: number }[];
} | null;
export const NUMBER_LABELS: Record<'floors' | 'unitsPerFloor' | 'parkingFloors', string>;
export function buildingOptions(values?: Record<string, unknown>): Record<string, string | number | boolean>;
