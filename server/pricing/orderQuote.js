'use strict';

// Trust boundary: the deployment operator owns PAKSHO_TARIFF_FILE and PAKSHO_QUOTE_SECRET.
// Object.freeze protects the loaded snapshot in memory only. Replacing the file is a new
// publication; this stage does not add an admin panel or a disk lock. A published version
// already stored on an order is never recalculated.

const crypto = require('crypto');
const {
  TariffError,
  quote,
  loadDeploymentTariff,
} = require('./tariffEngine');

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
  return {
    serviceId: body.serviceId,
    quantity,
    options,
  };
}

function trustedQuote(selection, now) {
  const secret = quoteSecret();
  if (!secret) throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  let policy;
  try {
    policy = loadDeploymentTariff();
  } catch (error) {
    if (error instanceof TariffError) throw error;
    throw new QuoteError('QUOTE_UNAVAILABLE', 'محاسبه قیمت این استقرار آماده نیست.');
  }
  const priced = quote(policy, {
    serviceId: selection.serviceId,
    quantity: selection.quantity,
    options: selection.options,
    at: now,
  });
  return { priced, secret };
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
  const { priced, secret } = trustedQuote(selection, now);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS).toISOString();
  const payload = {
    serviceId: priced.serviceId,
    quantity: selection.quantity == null ? 1 : selection.quantity,
    options: stable(selection.options || {}),
    tariffVersionId: priced.tariffVersionId,
    subtotal: priced.subtotal,
    discountTotal: priced.discountTotal,
    total: priced.total,
    currencyUnit: priced.currencyUnit,
    issuedAt,
    expiresAt,
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
    && JSON.stringify(stable(signed.options || {})) === JSON.stringify(stable(selection.options || {}));
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

function storedServerFingerprint(order) {
  const pricing = order && order.pricing;
  if (!pricing || pricing.source !== 'server') return null;
  return JSON.stringify(stable({
    serviceId: pricing.serviceId,
    quantity: pricing.quantity,
    options: pricing.options,
    tariffVersionId: pricing.tariffVersionId,
    total: pricing.total,
  }));
}

function requestFingerprint(priced) {
  return JSON.stringify(stable({
    serviceId: priced.pricing.serviceId,
    quantity: priced.pricing.quantity,
    options: priced.pricing.options,
    tariffVersionId: priced.pricing.tariffVersionId,
    total: priced.price,
  }));
}

function serverRequestConflicts(existing, priced) {
  const stored = storedServerFingerprint(existing);
  if (!stored) return true;
  return stored !== requestFingerprint(priced);
}

module.exports = {
  QUOTE_TTL_MS,
  NO_TARIFF_MESSAGE,
  QuoteError,
  MAX_QUOTE_TOKEN_CHARS,
  issueOrderQuote,
  confirmOrderQuote,
  matchExistingServerOrder,
  mapPricingError,
  serverRequestConflicts,
};
