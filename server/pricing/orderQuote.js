'use strict';

// Trust boundary: the deployment operator owns PAKSHO_TARIFF_FILE and PAKSHO_QUOTE_SECRET.
// Quote and confirmation read only a tariff whose bytes match a committed publication record.
// A published version already stored on an order is never recalculated.

const crypto = require('crypto');
const { TariffError, quote } = require('./tariffEngine');
const { loadCommittedTariff } = require('./tariffPublication');

// Technical quote lifetime, not a tariff and not a price.
const QUOTE_TTL_MS = 15 * 60 * 1000;
// The JSON body limit is 12mb. A quote token is a short signed selection, so reject oversized tokens before HMAC.
const MAX_QUOTE_TOKEN_CHARS = 32768;
const NO_TARIFF_MESSAGE = 'تعرفه این خدمت هنوز تعیین نشده است.';

class QuoteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QuoteError';
    this.code = code;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = stable(value[key]);
    return sorted;
  }
  return value;
}

function quoteSecret(env = process.env) {
  const secret = env && env.PAKSHO_QUOTE_SECRET;
  if (typeof secret !== 'string' || secret.trim() === '') return null;
  return secret;
}

function signQuote(payload, secret) {
  const body = Buffer.from(JSON.stringify(stable(payload))).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readSignedQuote(token, secret) {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_QUOTE_TOKEN_CHARS || !token.includes('.')) {
    throw new QuoteError('QUOTE_INVALID', 'نقل‌قول قیمت معتبر نیست.');
  }
  const splitAt = token.lastIndexOf('.');
  const body = token.slice(0, splitAt);
  const mac = token.slice(splitAt + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new QuoteError('QUOTE_INVALID', 'نقل‌قول قیمت معتبر نیست.');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (error) {
    throw new QuoteError('QUOTE_INVALID', 'نقل‌قول قیمت معتبر نیست.');
  }
  return payload;
}

function selectionFromBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new QuoteError('INPUT_INVALID', 'درخواست محاسبه معتبر نیست.');
  }
  const forbidden = ['companyId', 'rate', 'basisPoints', 'at', 'validFrom', 'tariffVersionId', 'currencyUnit'];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new QuoteError('INPUT_INVALID', 'این فیلد از مشتری پذیرفته نمی‌شود.');
    }
  }
  const quantity = body.quantity != null ? body.quantity : body.durationHours;
  const options = body.options != null ? body.options : (body.serviceOptions != null ? body.serviceOptions : {});
  let workerTier = null;
  if (Object.prototype.hasOwnProperty.call(body, 'workerTier') && body.workerTier != null && body.workerTier !== '') {
    if (typeof body.workerTier !== 'string' || !WORKER_TIERS.has(body.workerTier)) {
      throw new QuoteError('INPUT_INVALID', 'سطح متخصص معتبر نیست.');
    }
    workerTier = body.workerTier;
  }
  const hasOffer = options && typeof options === 'object' && !Array.isArray(options) && Object.hasOwn(options, 'offerId');
  if (hasOffer) workerTier = null;
  if (workerTier && workerTier !== 'gray' && body.serviceId === FIXED_PRICE_SERVICE) {
    throw new QuoteError('INPUT_INVALID', 'نظافت راه‌پله و مشاعات قیمت ثابت دارد و سطح متخصص روی آن اعمال نمی‌شود.');
  }
  let directRequestWorkerId = null;
  if (Object.prototype.hasOwnProperty.call(body, 'directRequestWorkerId') && body.directRequestWorkerId != null && body.directRequestWorkerId !== '') {
    if (typeof body.directRequestWorkerId !== 'string' || body.directRequestWorkerId.trim() === '' || body.directRequestWorkerId.length > 80) {
      throw new QuoteError('INPUT_INVALID', 'متخصص درخواست طلایی معتبر نیست.');
    }
    directRequestWorkerId = body.directRequestWorkerId.trim();
  }
  if (directRequestWorkerId && hasOffer) {
    throw new QuoteError('INPUT_INVALID', 'درخواست طلایی با پیشنهاد متخصص جمع نمی‌شود.');
  }
  if (directRequestWorkerId && workerTier) {
    throw new QuoteError('INPUT_INVALID', 'درخواست طلایی سطح جداگانه نمی‌گیرد؛ قیمتش مستقل است.');
  }
  let discountCode = null;
  if (Object.prototype.hasOwnProperty.call(body, 'discountCode') && body.discountCode != null && body.discountCode !== '') {
    if (typeof body.discountCode !== 'string') throw new QuoteError('INPUT_INVALID', 'کد تخفیف معتبر نیست.');
    discountCode = body.discountCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(discountCode)) throw new QuoteError('INPUT_INVALID', 'کد تخفیف معتبر نیست.');
  }
  return {
    serviceId: body.serviceId,
    quantity,
    options,
    ...(workerTier ? { workerTier } : {}),
    ...(directRequestWorkerId ? { directRequestWorkerId } : {}),
    ...(discountCode ? { discountCode } : {}),
  };
}

function directForSelection(selection, offerAdjustment) {
  if (!selection.directRequestWorkerId) return null;
  if (offerAdjustment) throw new QuoteError('INPUT_INVALID', 'درخواست طلایی با پیشنهاد متخصص جمع نمی‌شود.');
  if (!directRequestResolver) throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  const resolved = directRequestResolver(selection.directRequestWorkerId);
  if (!resolved || !Number.isSafeInteger(resolved.basisPoints) || !Number.isSafeInteger(resolved.version) || !Number.isSafeInteger(resolved.windowMinutes)) {
    throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  }
  return resolved;
}

function tierForSelection(selection, offerAdjustment) {
  if (!selection.workerTier || offerAdjustment) return null;
  if (!tierResolver) throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  const resolved = tierResolver(selection.serviceId === FIXED_PRICE_SERVICE ? 'gray' : selection.workerTier);
  if (!resolved || !Number.isSafeInteger(resolved.basisPoints) || !Number.isSafeInteger(resolved.version)) {
    throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  }
  return {
    workerTier: selection.workerTier,
    version: resolved.version,
    basisPoints: selection.serviceId === FIXED_PRICE_SERVICE ? null : resolved.basisPoints,
  };
}

// پیشنهاد متخصص: شناسهٔ پیشنهاد فقط یک گزینهٔ امضاشده است؛ درصد قیمت را هرگز از مشتری نمی‌گیریم.
// فراخوان‌دهنده (index.js) تابع تصمیم‌گیر را می‌دهد تا این ماژول به پایگاه‌داده وابسته نشود.
let offerResolver = null;
let tierResolver = null;
let directRequestResolver = null;
let promoResolver = null;
const WORKER_TIERS = new Set(['gray', 'silver', 'gold']);
const FIXED_PRICE_SERVICE = 'staircase_common_areas';
// درخواست ساعت دلخواه مشتری: شناسهٔ CRQ- فقط در پذیرش متخصص (داخل withCustomerRequestAcceptance) قابل نقل‌قول است.
let acceptingCustomerRequest = false;
function withCustomerRequestAcceptance(fn) {
  acceptingCustomerRequest = true;
  try { return fn(); } finally { acceptingCustomerRequest = false; }
}
function isAcceptingCustomerRequest() { return acceptingCustomerRequest; }
/** تعداد واحد خدمت برای یک بازهٔ زمانی: خدمت‌های ثابت بدون تعداد؛ ساعتی حداقل تعداد تعرفه یا ساعت‌های بازه. */
function quantityForWindow(serviceId, startAt, endAt, now = new Date()) {
  const policy = loadCommittedTariff();
  const version = require("./tariffEngine").selectVersion(policy, now);
  const service = version.services[serviceId];
  if (!service) return null;
  if (service.model === "fixed") return undefined;
  const hours = Math.max(1, Math.ceil((Date.parse(endAt) - Date.parse(startAt)) / 3600000));
  return Math.max(hours, service.minQuantity || 1);
}
function setOfferResolver(resolver) {
  offerResolver = typeof resolver === 'function' ? resolver : null;
}

function setTierResolver(resolver) {
  tierResolver = typeof resolver === 'function' ? resolver : null;
}

function setDirectRequestResolver(resolver) {
  directRequestResolver = typeof resolver === 'function' ? resolver : null;
}

/** resolver(code) → {id, basisPoints} یا QuoteError. */
function setPromoResolver(resolver) {
  promoResolver = typeof resolver === 'function' ? resolver : null;
}

function promoForSelection(selection) {
  if (!selection.discountCode) return null;
  if (!promoResolver) throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  const resolved = promoResolver(selection.discountCode);
  if (!resolved || typeof resolved.id !== 'string' || !Number.isSafeInteger(resolved.basisPoints)) {
    throw new QuoteError('PROMO_INVALID', 'کد تخفیف معتبر نیست.');
  }
  return resolved;
}

function splitOfferOption(selection, now) {
  const source = selection.options;
  if (!source || typeof source !== 'object' || !Object.hasOwn(source, 'offerId')) {
    return { options: source, adjustment: null };
  }
  const options = { ...source };
  const offerId = options.offerId;
  delete options.offerId;
  if (typeof offerId !== 'string' || offerId === '' || !offerResolver) {
    throw new QuoteError('OFFER_UNAVAILABLE', 'این پیشنهاد دیگر در دسترس نیست.');
  }
  const resolved = offerResolver({ offerId, serviceId: selection.serviceId, now });
  return { options, adjustment: { id: 'worker-offer', basisPoints: resolved.basisPoints } };
}

/** قیمت نمایشی یک پیشنهاد برای فهرست مشتری؛ فقط اطلاعات است و هیچ سفارشی را تثبیت نمی‌کند. */
function previewOfferPrice(serviceId, basisPoints, now = new Date()) {
  try {
    const policy = loadCommittedTariff();
    const version = require('./tariffEngine').selectVersion(policy, now);
    const service = version.services[serviceId];
    if (!service) return null;
    const quantity = service.model === 'fixed' ? undefined : (service.minQuantity || 1);
    const base = quote(policy, { serviceId, quantity, options: {}, at: now });
    const offered = quote(policy, { serviceId, quantity, options: {}, at: now, priceAdjustment: { id: 'worker-offer', basisPoints } });
    return { currencyUnit: base.currencyUnit, quantity: quantity == null ? 1 : quantity, tariffTotal: base.total, total: offered.total };
  } catch (error) {
    return null;
  }
}

function trustedQuote(selection, now) {
  const secret = quoteSecret();
  if (!secret) throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  let policy;
  try {
    policy = loadCommittedTariff();
  } catch (error) {
    if (error instanceof TariffError) throw error;
    throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  }
  const split = splitOfferOption(selection, now);
  const direct = directForSelection(selection, split.adjustment);
  const tier = direct ? null : tierForSelection(selection, split.adjustment);
  const basisPoints = direct ? direct.basisPoints : (tier && tier.basisPoints != null ? tier.basisPoints : null);
  const promo = promoForSelection(selection);
  const priced = quote(policy, {
    serviceId: selection.serviceId,
    quantity: selection.quantity,
    options: split.options,
    at: now,
    ...(split.adjustment ? { priceAdjustment: split.adjustment } : {}),
    ...(basisPoints != null ? { baseRateBasisPoints: basisPoints } : {}),
    ...(promo ? { promoDiscount: promo } : {}),
  });
  return { priced, secret, tier, direct };
}

function publicQuote(priced, token, expiresAt) {
  return {
    quoteToken: token,
    subtotal: priced.subtotal,
    surcharges: priced.breakdown.filter((line) => line.kind === 'surcharge').map((line) => ({ id: line.id, amount: line.amount })),
    discounts: priced.breakdown.filter((line) => line.kind === 'discount').map((line) => ({ id: line.id, amount: -line.amount })),
    total: priced.total,
    currencyUnit: priced.currencyUnit,
    tariffVersionId: priced.tariffVersionId,
    expiresAt,
  };
}

function issueOrderQuote(body, now = new Date()) {
  const selection = selectionFromBody(body);
  const { priced, secret, tier, direct } = trustedQuote(selection, now);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS).toISOString();
  const payload = {
    serviceId: priced.serviceId,
    quantity: selection.quantity == null ? 1 : selection.quantity,
    options: stable(selection.options || {}),
    ...(selection.discountCode ? { discountCode: selection.discountCode } : {}),
    tariffVersionId: priced.tariffVersionId,
    subtotal: priced.subtotal,
    discountTotal: priced.discountTotal,
    total: priced.total,
    currencyUnit: priced.currencyUnit,
    issuedAt,
    expiresAt,
    ...(tier ? { workerTier: tier.workerTier, tierPolicyVersion: tier.version } : {}),
    ...(direct ? {
      directRequestWorkerId: selection.directRequestWorkerId,
      tierPolicyVersion: direct.version,
      goldenRequestWindowMinutes: direct.windowMinutes,
    } : {}),
  };
  const token = signQuote(payload, secret);
  if (token.length > MAX_QUOTE_TOKEN_CHARS) {
    throw new QuoteError('QUOTE_INVALID', 'نقل‌قول قیمت معتبر نیست.');
  }
  return publicQuote(priced, token, expiresAt);
}

function sameSelection(signed, selection) {
  return signed.serviceId === selection.serviceId
    && signed.quantity === (selection.quantity == null ? 1 : selection.quantity)
    && (signed.workerTier || null) === (selection.workerTier || null)
    && (signed.directRequestWorkerId || null) === (selection.directRequestWorkerId || null)
    && (signed.discountCode || null) === (selection.discountCode || null)
    && JSON.stringify(stable(signed.options || {})) === JSON.stringify(stable(selection.options || {}));
}

function signedTierFields(signed) {
  if (!signed || typeof signed.workerTier !== 'string') return {};
  return {
    requestedWorkerTier: signed.workerTier,
    tierPolicyVersion: Number.isSafeInteger(signed.tierPolicyVersion) ? signed.tierPolicyVersion : 0,
  };
}

function signedDirectFields(signed) {
  if (!signed || typeof signed.directRequestWorkerId !== 'string') return {};
  return {
    directRequestWorkerId: signed.directRequestWorkerId,
    goldenRequestWindowMinutes: Number.isSafeInteger(signed.goldenRequestWindowMinutes) ? signed.goldenRequestWindowMinutes : 30,
    tierPolicyVersion: Number.isSafeInteger(signed.tierPolicyVersion) ? signed.tierPolicyVersion : 0,
  };
}

function acknowledgementMatches(body, total) {
  if (!Object.prototype.hasOwnProperty.call(body, 'confirmedTotal') || body.confirmedTotal !== total) return false;
  if (Object.prototype.hasOwnProperty.call(body, 'price') && body.price !== total) return false;
  if (body.pricing && typeof body.pricing === 'object' && Object.prototype.hasOwnProperty.call(body.pricing, 'total') && body.pricing.total !== total) {
    return false;
  }
  return true;
}

function readQuoteReplay(body) {
  const selection = selectionFromBody(body);
  const secret = quoteSecret();
  if (!secret) throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  const signed = readSignedQuote(body.quoteToken, secret);
  if (!signed || !sameSelection(signed, selection) || !acknowledgementMatches(body, signed.total)) {
    throw new QuoteError('REPLAY_MISMATCH', 'این درخواست با سفارش ثبت‌شده یکسان نیست.');
  }
  return {
    price: signed.total,
    pricing: {
      serviceId: signed.serviceId,
      quantity: signed.quantity,
      options: stable(signed.options || {}),
      tariffVersionId: signed.tariffVersionId,
      total: signed.total,
      ...signedTierFields(signed),
      ...signedDirectFields(signed),
    },
  };
}

function matchExistingServerOrder(body, existing) {
  if (!storedServerFingerprint(existing)) return { conflict: true };
  let replay;
  try {
    replay = readQuoteReplay(body);
  } catch (error) {
    if (error instanceof QuoteError && error.code === 'REPLAY_MISMATCH') return { conflict: true };
    throw error;
  }
  if (serverRequestConflicts(existing, replay)) return { conflict: true };
  return { duplicate: true };
}

function confirmOrderQuote(body, now = new Date()) {
  const selection = selectionFromBody(body);
  const { priced, secret } = trustedQuote(selection, now);
  const signed = readSignedQuote(body.quoteToken, secret);
  if (!signed || !sameSelection(signed, selection)) {
    throw new QuoteError('PRICE_CHANGED', 'قیمت تغییر کرده است. مبلغ جدید را ببینید و دوباره تأیید کنید.');
  }
  if (typeof signed.expiresAt !== 'string' || Date.parse(signed.expiresAt) <= now.getTime()) {
    throw new QuoteError('QUOTE_EXPIRED', 'اعتبار نمایش قیمت تمام شده است. قیمت را دوباره دریافت کنید.');
  }
  const unchanged = priced.tariffVersionId === signed.tariffVersionId
    && priced.total === signed.total
    && priced.subtotal === signed.subtotal
    && priced.discountTotal === signed.discountTotal
    && priced.currencyUnit === signed.currencyUnit;
  if (!unchanged) {
    throw new QuoteError('PRICE_CHANGED', 'قیمت تغییر کرده است. مبلغ جدید را ببینید و دوباره تأیید کنید.');
  }
  if (!acknowledgementMatches(body, priced.total)) {
    throw new QuoteError('PRICE_NOT_CONFIRMED', 'سفارش فقط با تأیید همان قیمت نمایش‌داده‌شده ثبت می‌شود.');
  }
  return {
    price: priced.total,
    pricing: {
      source: 'server',
      companyId: priced.companyId,
      currencyUnit: priced.currencyUnit,
      tariffVersionId: priced.tariffVersionId,
      serviceId: priced.serviceId,
      quantity: selection.quantity == null ? 1 : selection.quantity,
      options: stable(selection.options || {}),
      subtotal: priced.subtotal,
      discountTotal: priced.discountTotal,
      total: priced.total,
      surcharges: priced.breakdown.filter((line) => line.kind === 'surcharge'),
      discounts: priced.breakdown.filter((line) => line.kind === 'discount'),
      ...signedTierFields(signed),
      ...signedDirectFields(signed),
    },
  };
}

function mapPricingError(error) {
  if (error instanceof TariffError) {
    if (error.code === 'TARIFF_NOT_CONFIGURED' || error.code === 'TARIFF_VERSION_NOT_FOUND' || error.code === 'SERVICE_NOT_IN_TARIFF' || error.code === 'TARIFF_INVALID') {
      return { status: 409, body: { success: false, code: 'NO_TARIFF', message: NO_TARIFF_MESSAGE } };
    }
    if (error.code === 'INPUT_INVALID') {
      return { status: 400, body: { success: false, code: 'INPUT_INVALID', message: error.message } };
    }
    return { status: 409, body: { success: false, code: error.code, message: 'محاسبه قیمت انجام نشد.' } };
  }
  if (error instanceof QuoteError) {
    const status = error.code === 'INPUT_INVALID' || error.code === 'QUOTE_INVALID' || error.code === 'PRICE_NOT_CONFIRMED'
      ? 400
      : 409;
    const message = error.code === 'QUOTE_UNAVAILABLE' ? NO_TARIFF_MESSAGE : error.message;
    return { status, body: { success: false, code: error.code, message } };
  }
  return { status: 500, body: { success: false, code: 'PRICING_FAILED', message: 'محاسبه قیمت انجام نشد.' } };
}

function fingerprintBody(fields, requestedWorkerTier, directRequestWorkerId) {
  const body = { ...fields };
  if (typeof requestedWorkerTier === 'string' && requestedWorkerTier) body.requestedWorkerTier = requestedWorkerTier;
  if (typeof directRequestWorkerId === 'string' && directRequestWorkerId) body.directRequestWorkerId = directRequestWorkerId;
  return JSON.stringify(stable(body));
}

function storedServerFingerprint(order) {
  const pricing = order && order.pricing;
  if (!pricing || pricing.source !== 'server') return null;
  return fingerprintBody({
    serviceId: pricing.serviceId,
    quantity: pricing.quantity,
    options: pricing.options,
    tariffVersionId: pricing.tariffVersionId,
    total: pricing.total,
  }, order.requestedWorkerTier, order.directRequestWorkerId);
}

function requestFingerprint(priced) {
  return fingerprintBody({
    serviceId: priced.pricing.serviceId,
    quantity: priced.pricing.quantity,
    options: priced.pricing.options,
    tariffVersionId: priced.pricing.tariffVersionId,
    total: priced.price,
  }, priced.pricing.requestedWorkerTier, priced.pricing.directRequestWorkerId);
}

function serverRequestConflicts(existing, priced) {
  const stored = storedServerFingerprint(existing);
  if (!stored) return true;
  return stored !== requestFingerprint(priced);
}

module.exports = {
  setOfferResolver,
  setTierResolver,
  setDirectRequestResolver,
  setPromoResolver,
  previewOfferPrice,
  QUOTE_TTL_MS,
  NO_TARIFF_MESSAGE,
  QuoteError,
  MAX_QUOTE_TOKEN_CHARS,
  issueOrderQuote,
  confirmOrderQuote,
  matchExistingServerOrder,
  mapPricingError,
  serverRequestConflicts,
  withCustomerRequestAcceptance,
  isAcceptingCustomerRequest,
  quantityForWindow,
};
