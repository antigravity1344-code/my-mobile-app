'use strict';

const fs = require('fs');

const MODELS = new Set(['hourly', 'fixed', 'count', 'area']);

class TariffError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TariffError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new TariffError(code, message);
}

function assertSafeInteger(value, code, message) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(code, message);
}

function mulDivHalfUp(amount, numerator, denominator) {
  const divisor = BigInt(denominator);
  if (divisor <= 0n) fail('CALCULATION_INVALID', 'محاسبه نامعتبر است.');
  const product = BigInt(amount) * BigInt(numerator);
  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  const rounded = (magnitude + divisor / 2n) / divisor;
  const result = negative ? -rounded : rounded;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (result > max || result < -max) fail('CALCULATION_INVALID', 'محاسبه از محدوده عدد صحیح خارج شد.');
  return Number(result);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function parseInstant(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, 'زمان اعتبار تعرفه معتبر نیست.');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) fail(code, 'زمان اعتبار تعرفه معتبر نیست.');
  return ms;
}

function listOrEmpty(value, message) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail('TARIFF_INVALID', message);
  return value;
}

function copyAdjustments(service) {
  const surcharges = listOrEmpty(service.surcharges, 'هزینه جانبی تعرفه معتبر نیست.');
  const factors = listOrEmpty(service.factors, 'ضریب تعرفه معتبر نیست.');
  const discounts = listOrEmpty(service.discounts, 'تخفیف تعرفه معتبر نیست.');
  let discountBps = 0;
  const copiedSurcharges = surcharges.map((item) => {
    if (!item || typeof item.id !== 'string' || item.id.trim() === '' || typeof item.optionId !== 'string' || item.optionId.trim() === '') {
      fail('TARIFF_INVALID', 'هزینه جانبی تعرفه معتبر نیست.');
    }
    assertSafeInteger(item.amount, 'TARIFF_INVALID', 'مبلغ هزینه جانبی باید عدد صحیح باشد.');
    if (item.amount < 0) fail('TARIFF_INVALID', 'مبلغ هزینه جانبی منفی است.');
    return { id: item.id, optionId: item.optionId, amount: item.amount };
  });
  const copiedFactors = factors.map((item) => {
    if (!item || typeof item.id !== 'string' || item.id.trim() === '' || typeof item.optionId !== 'string' || item.optionId.trim() === '') {
      fail('TARIFF_INVALID', 'ضریب تعرفه معتبر نیست.');
    }
    assertSafeInteger(item.basisPoints, 'TARIFF_INVALID', 'ضریب تعرفه باید عدد صحیح باشد.');
    if (item.basisPoints < 0) fail('TARIFF_INVALID', 'ضریب تعرفه منفی است.');
    const equals = Object.prototype.hasOwnProperty.call(item, 'equals') ? item.equals : true;
    if (!isOptionValue(equals)) fail('TARIFF_INVALID', 'شرط ضریب تعرفه معتبر نیست.');
    return { id: item.id, optionId: item.optionId, equals, basisPoints: item.basisPoints };
  });
  const copiedDiscounts = discounts.map((item) => {
    if (!item || typeof item.id !== 'string' || item.id.trim() === '') fail('TARIFF_INVALID', 'تخفیف تعرفه معتبر نیست.');
    assertSafeInteger(item.basisPoints, 'TARIFF_INVALID', 'تخفیف تعرفه باید عدد صحیح باشد.');
    if (item.basisPoints < 0 || item.basisPoints > 10000) fail('TARIFF_INVALID', 'تخفیف تعرفه خارج از محدوده است.');
    if (item.optionId != null && (typeof item.optionId !== 'string' || item.optionId.trim() === '')) {
      fail('TARIFF_INVALID', 'شرط تخفیف تعرفه معتبر نیست.');
    }
    discountBps += item.basisPoints;
    return { id: item.id, optionId: item.optionId || null, basisPoints: item.basisPoints };
  });
  if (discountBps > 10000) fail('TARIFF_INVALID', 'مجموع تخفیف‌های یک خدمت از کل مبلغ بیشتر است.');
  return { surcharges: copiedSurcharges, factors: copiedFactors, discounts: copiedDiscounts };
}

function validatePolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('TARIFF_INVALID', 'سیاست تعرفه معتبر نیست.');
  if (typeof raw.companyId !== 'string' || raw.companyId.trim() === '') fail('TARIFF_INVALID', 'شناسه شرکت در پیکربندی استقرار نیست.');
  if (typeof raw.currencyUnit !== 'string' || raw.currencyUnit.trim() === '') fail('TARIFF_INVALID', 'واحد پولی تعرفه مشخص نیست.');
  if (!Array.isArray(raw.versions)) fail('TARIFF_INVALID', 'نسخه‌های تعرفه مشخص نیستند.');
  const seen = new Set();
  const versions = raw.versions.map((version) => {
    if (!version || typeof version.id !== 'string' || version.id.trim() === '') fail('TARIFF_INVALID', 'شناسه نسخه تعرفه معتبر نیست.');
    if (seen.has(version.id)) fail('TARIFF_INVALID', 'شناسه نسخه تعرفه تکراری است.');
    seen.add(version.id);
    if (version.status !== 'published' && version.status !== 'draft') fail('TARIFF_INVALID', 'وضعیت نسخه تعرفه معتبر نیست.');
    const validFrom = parseInstant(version.validFrom, 'TARIFF_INVALID');
    const validTo = version.validTo == null ? null : parseInstant(version.validTo, 'TARIFF_INVALID');
    if (validTo != null && validTo <= validFrom) fail('TARIFF_INVALID', 'بازه اعتبار نسخه تعرفه نامعتبر است.');
    if (!version.services || typeof version.services !== 'object' || Array.isArray(version.services)) {
      fail('TARIFF_INVALID', 'خدمات تعرفه معتبر نیستند.');
    }
    const services = {};
    for (const [serviceId, service] of Object.entries(version.services)) {
      if (!serviceId || !service || typeof service !== 'object' || Array.isArray(service)) fail('TARIFF_INVALID', 'خدمت تعرفه معتبر نیست.');
      if (!MODELS.has(service.model)) fail('TARIFF_INVALID', 'مدل محاسبه تعرفه معتبر نیست.');
      assertSafeInteger(service.rate, 'TARIFF_INVALID', 'نرخ تعرفه باید عدد صحیح باشد.');
      if (service.rate < 0) fail('TARIFF_INVALID', 'نرخ تعرفه منفی است.');
      if (service.minQuantity != null) {
        assertSafeInteger(service.minQuantity, 'TARIFF_INVALID', 'حداقل مقدار باید عدد صحیح باشد.');
        if (service.minQuantity < 1) fail('TARIFF_INVALID', 'حداقل مقدار نامعتبر است.');
      }
      if (service.maxQuantity != null) {
        assertSafeInteger(service.maxQuantity, 'TARIFF_INVALID', 'حداکثر مقدار باید عدد صحیح باشد.');
        if (service.minQuantity != null && service.maxQuantity < service.minQuantity) {
          fail('TARIFF_INVALID', 'بازه مقدار خدمت نامعتبر است.');
        }
      }
      services[serviceId] = {
        model: service.model,
        rate: service.rate,
        minQuantity: service.minQuantity == null ? null : service.minQuantity,
        maxQuantity: service.maxQuantity == null ? null : service.maxQuantity,
        ...copyAdjustments(service),
      };
    }
    return { id: version.id, status: version.status, validFrom, validTo, services };
  });
  const published = versions.filter((version) => version.status === 'published');
  for (let i = 0; i < published.length; i += 1) {
    for (let j = i + 1; j < published.length; j += 1) {
      const leftEnd = published[i].validTo == null ? Infinity : published[i].validTo;
      const rightEnd = published[j].validTo == null ? Infinity : published[j].validTo;
      if (published[i].validFrom < rightEnd && published[j].validFrom < leftEnd) {
        fail('TARIFF_INVALID', 'نسخه‌های منتشرشده هم‌پوشانی دارند.');
      }
    }
  }
  return deepFreeze({
    companyId: raw.companyId,
    currencyUnit: raw.currencyUnit,
    versions,
  });
}

function selectVersion(policy, at) {
  const instant = at instanceof Date ? at.getTime() : parseInstant(at, 'INPUT_INVALID');
  if (!Number.isFinite(instant)) fail('INPUT_INVALID', 'زمان محاسبه معتبر نیست.');
  const matches = policy.versions.filter((version) => (
    version.status === 'published'
    && instant >= version.validFrom
    && (version.validTo == null || instant < version.validTo)
  ));
  if (matches.length === 0) fail('TARIFF_VERSION_NOT_FOUND', 'تعرفه معتبری برای این زمان وجود ندارد.');
  if (matches.length > 1) fail('TARIFF_VERSION_AMBIGUOUS', 'بیش از یک تعرفه منتشرشده برای این زمان معتبر است.');
  return matches[0];
}

function isOptionValue(value) {
  return typeof value === 'boolean'
    || Number.isSafeInteger(value)
    || (typeof value === 'string' && value.trim() !== '' && value.length <= 80);
}

function allowedOptionIds(service) {
  const ids = new Set();
  for (const item of [...service.surcharges, ...service.factors, ...service.discounts]) {
    if (item.optionId) ids.add(item.optionId);
  }
  return ids;
}

function quote(policy, input) {
  if (!policy || typeof policy !== 'object' || !Object.isFrozen(policy)) {
    fail('TARIFF_INVALID', 'تعرفه باید از پیکربندی مورد اعتماد بارگذاری شده باشد.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INPUT_INVALID', 'ورودی محاسبه معتبر نیست.');
  if (Object.prototype.hasOwnProperty.call(input, 'companyId')) {
    fail('INPUT_INVALID', 'شناسه شرکت ارسال‌شده توسط کلاینت پذیرفته نمی‌شود.');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'price') || Object.prototype.hasOwnProperty.call(input, 'claimedTotal')) {
    fail('INPUT_INVALID', 'مبلغ ادعایی مشتری ورودی محاسبه نیست.');
  }
  const version = selectVersion(policy, input.at);
  if (typeof input.serviceId !== 'string' || input.serviceId.trim() === '') fail('INPUT_INVALID', 'خدمت مشخص نیست.');
  const service = version.services[input.serviceId];
  if (!service) fail('SERVICE_NOT_IN_TARIFF', 'این خدمت در تعرفه معتبر نیست.');
  const options = input.options == null ? {} : input.options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INPUT_INVALID', 'گزینه‌ها معتبر نیستند.');
  const allowed = allowedOptionIds(service);
  for (const [key, value] of Object.entries(options)) {
    if (!allowed.has(key)) fail('INPUT_INVALID', 'گزینه در تعرفه این خدمت نیست.');
    if (!isOptionValue(value)) fail('INPUT_INVALID', 'مقدار گزینه معتبر نیست.');
  }
  let quantity = 1;
  if (service.model === 'fixed') {
    if (input.quantity != null && input.quantity !== 1) fail('INPUT_INVALID', 'خدمت ثابت مقدار شمارشی نمی‌پذیرد.');
  } else {
    assertSafeInteger(input.quantity, 'INPUT_INVALID', 'مقدار محاسبه باید عدد صحیح باشد.');
    if (input.quantity < 1) fail('INPUT_INVALID', 'مقدار محاسبه باید مثبت باشد.');
    if (service.minQuantity != null && input.quantity < service.minQuantity) fail('INPUT_INVALID', 'مقدار از حداقل تعرفه کمتر است.');
    if (service.maxQuantity != null && input.quantity > service.maxQuantity) fail('INPUT_INVALID', 'مقدار از حداکثر تعرفه بیشتر است.');
    quantity = input.quantity;
  }
  let subtotal = mulDivHalfUp(service.rate, quantity, 1);
  const breakdown = [{ kind: 'base', amount: subtotal }];
  for (const factor of service.factors) {
    if (options[factor.optionId] !== factor.equals) continue;
    const next = mulDivHalfUp(subtotal, factor.basisPoints, 10000);
    breakdown.push({ kind: 'factor', id: factor.id, amount: next - subtotal });
    subtotal = next;
  }
  for (const surcharge of service.surcharges) {
    if (options[surcharge.optionId] !== true) continue;
    if (!Number.isSafeInteger(subtotal + surcharge.amount)) fail('CALCULATION_INVALID', 'جمع هزینه جانبی نامعتبر است.');
    breakdown.push({ kind: 'surcharge', id: surcharge.id, amount: surcharge.amount });
    subtotal += surcharge.amount;
  }
  let discountTotal = 0;
  for (const discount of service.discounts) {
    if (discount.optionId && options[discount.optionId] !== true) continue;
    const amount = mulDivHalfUp(subtotal, discount.basisPoints, 10000);
    if (!Number.isSafeInteger(discountTotal + amount)) fail('CALCULATION_INVALID', 'جمع تخفیف نامعتبر است.');
    discountTotal += amount;
    breakdown.push({ kind: 'discount', id: discount.id, amount: -amount });
  }
  if (discountTotal > subtotal) fail('CALCULATION_INVALID', 'تخفیف از مبلغ خدمت بیشتر است.');
  return deepFreeze({
    companyId: policy.companyId,
    currencyUnit: policy.currencyUnit,
    tariffVersionId: version.id,
    serviceId: input.serviceId,
    model: service.model,
    subtotal,
    discountTotal,
    total: subtotal - discountTotal,
    breakdown,
  });
}

function loadDeploymentTariff(env = process.env) {
  const file = env && env.PAKSHO_TARIFF_FILE;
  if (typeof file !== 'string' || file.trim() === '') {
    fail('TARIFF_NOT_CONFIGURED', 'فایل تعرفه مورد اعتماد این استقرار تنظیم نشده است.');
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail('TARIFF_INVALID', 'فایل تعرفه مورد اعتماد خوانده یا تفسیر نشد.');
  }
  return validatePolicy(parsed);
}

module.exports = {
  TariffError,
  validatePolicy,
  selectVersion,
  quote,
  loadDeploymentTariff,
};
