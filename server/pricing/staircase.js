'use strict';

const STAIR_SERVICE = 'staircase_common_areas';
const DEFAULT_RATES = Object.freeze({
  baseRate: 1070000, includedFloors: 4, extraFloor: 45000, threeUnits: 18000, fourUnits: 36000,
  parkingFloor: 90000, glass: 45000, yard: 90000, roof: 100000, mats: 60000, detergent: 150000,
  liftFromFloor: 4, noLiftPercent: 10,
});
const RATE_LABELS = {
  baseRate: 'قیمت پایه', includedFloors: 'تعداد طبقات مشمول قیمت پایه', extraFloor: 'هر طبقهٔ مسکونی اضافه',
  threeUnits: 'ساختمان سه واحد در هر طبقه', fourUnits: 'ساختمان چهار واحد یا بیشتر در هر طبقه',
  parkingFloor: 'هر طبقهٔ پارکینگ', glass: 'درب و دیواره‌های شیشه سکوریت', yard: 'حیاط و مشاعات روباز',
  roof: 'نظافت پشت‌بام', mats: 'شستشوی پادری‌های طبقات', detergent: 'پک مواد شوینده و لوازم نظافت',
  liftFromFloor: 'حداقل طبقات برای ضریب بدون آسانسور', noLiftPercent: 'درصد ساختمان بدون آسانسور',
};
const BASE_BUILDING = Object.freeze({ floors: 4, unitsPerFloor: 2, parkingFloors: 0 });
const ADDONS = ['glass', 'yard', 'roof', 'mats'];
const SUPPLIES_NOTE = 'تأمین وسایل و مواد شوینده بر عهده کارفرما (مشتری) است. در صورت نداشتن لوازم، می‌توانید گزینه زیر را انتخاب کنید تا نظافتچی پک کامل مواد شوینده را همراه بیاورد.';

function validRates(rates) {
  return rates && typeof rates === 'object'
    && Object.keys(DEFAULT_RATES).every(key => Number.isSafeInteger(rates[key]) && rates[key] >= 0)
    && rates.baseRate > 0 && rates.includedFloors > 0 && rates.liftFromFloor > 0
    && rates.noLiftPercent <= 100;
}

function calculateStaircase(rates, options) {
  if (!validRates(rates) || !options) return null;
  const { floors, unitsPerFloor, parkingFloors } = options;
  if (![floors, unitsPerFloor, parkingFloors].every(Number.isSafeInteger)
      || floors < 1 || unitsPerFloor < 1 || parkingFloors < 0) return null;
  if ([...ADDONS, 'noLift', 'detergent'].some(key => options[key] != null && typeof options[key] !== 'boolean')) return null;
  const lines = [];
  function add(id, amount) { if (amount) lines.push({ id, amount }); }
  add('extraFloor', Math.max(0, floors - rates.includedFloors) * rates.extraFloor);
  if (unitsPerFloor === 3) add('threeUnits', rates.threeUnits);
  if (unitsPerFloor >= 4) add('fourUnits', rates.fourUnits);
  add('parkingFloor', parkingFloors * rates.parkingFloor);
  for (const key of ADDONS) if (options[key]) add(key, rates[key]);
  const beforeLift = lines.reduce((sum, line) => sum + line.amount, rates.baseRate);
  if (options.noLift && floors >= rates.liftFromFloor) {
    const scaled = beforeLift * rates.noLiftPercent;
    if (!Number.isSafeInteger(scaled)) return null;
    add('noLiftPercent', Math.round(scaled / 100));
  }
  if (options.detergent) lines.push({ id: 'detergent', amount: rates.detergent });
  const total = lines.reduce((sum, line) => sum + line.amount, rates.baseRate);
  return Number.isSafeInteger(total) ? { base: rates.baseRate, lines, total } : null;
}

const NUMBER_LABELS = { floors: 'تعداد طبقات مسکونی', unitsPerFloor: 'تعداد واحد در هر طبقه', parkingFloors: 'تعداد طبقات پارکینگ' };

function buildingOptions(values = {}) {
  const result = { ...BASE_BUILDING };
  for (const key of ['floors', 'unitsPerFloor', 'parkingFloors', 'noLift', ...ADDONS, 'detergent']) {
    if (values[key] !== undefined) result[key] = values[key];
  }
  return result;
}

module.exports = { STAIR_SERVICE, DEFAULT_RATES, RATE_LABELS, BASE_BUILDING, ADDONS, NUMBER_LABELS, buildingOptions, SUPPLIES_NOTE, validRates, calculateStaircase };
