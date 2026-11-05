'use strict';
const crypto = require('node:crypto');

// حدود قیمت پیشنهادی متخصص نسبت به تعرفهٔ شرکت (بر حسب basis points؛ ۱۰۰۰۰ = خود تعرفه).
// متخصص عادی فقط می‌تواند ارزان‌تر بگذارد؛ طلایی تا ۱۳۰٪ تعرفه. این حدود پیش‌فرض‌اند و در یک جا قابل تغییرند.
const MIN_BASIS_POINTS = 5000;
const DEFAULT_MAX_BASIS_POINTS = 10000;
const GOLD_MAX_BASIS_POINTS = 13000;
const STEP_BASIS_POINTS = 100;
const MIN_WINDOW_MS = 60 * 60 * 1000;
const MAX_WINDOW_MS = 16 * 60 * 60 * 1000;
const MAX_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_OPEN_OFFERS = 30;

class OfferError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OfferError';
    this.code = code;
  }
}

function maxBasisPointsForTier(tierKey) {
  return tierKey === 'gold' ? GOLD_MAX_BASIS_POINTS : DEFAULT_MAX_BASIS_POINTS;
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** ورودی ثبت پیشنهاد را اعتبارسنجی می‌کند و مقدار پاک‌شده برمی‌گرداند؛ در خطا OfferError می‌اندازد. */
function validateOfferInput(body, { tierKey, now }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OfferError('INPUT_INVALID', 'پیشنهاد معتبر نیست.');
  const serviceId = typeof body.serviceId === 'string' ? body.serviceId.trim() : '';
  if (!serviceId || serviceId.length > 80) throw new OfferError('INPUT_INVALID', 'خدمت پیشنهاد مشخص نیست.');
  const startAt = isoOrNull(body.startAt);
  const endAt = isoOrNull(body.endAt);
  if (!startAt || !endAt) throw new OfferError('INPUT_INVALID', 'زمان شروع و پایان معتبر نیست.');
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (startMs <= now.getTime()) throw new OfferError('INPUT_INVALID', 'زمان شروع باید در آینده باشد.');
  if (startMs - now.getTime() > MAX_HORIZON_MS) throw new OfferError('INPUT_INVALID', 'زمان پیشنهاد بیش از حد دور است.');
  if (endMs - startMs < MIN_WINDOW_MS) throw new OfferError('INPUT_INVALID', 'بازهٔ کاری باید دست‌کم یک ساعت باشد.');
  if (endMs - startMs > MAX_WINDOW_MS) throw new OfferError('INPUT_INVALID', 'بازهٔ کاری نباید بیشتر از ۱۶ ساعت باشد.');
  const bp = body.adjustmentBasisPoints;
  if (!Number.isSafeInteger(bp) || bp % STEP_BASIS_POINTS !== 0) throw new OfferError('INPUT_INVALID', 'درصد قیمت معتبر نیست.');
  if (bp < MIN_BASIS_POINTS) throw new OfferError('PRICE_OUT_OF_RANGE', 'قیمت پیشنهادی از حداقل مجاز (۵۰٪ تعرفه) کمتر است.');
  const max = maxBasisPointsForTier(tierKey);
  if (bp > max) {
    throw new OfferError('PRICE_OUT_OF_RANGE', max <= 10000
      ? 'قیمت پیشنهادی نمی‌تواند از تعرفهٔ شرکت بالاتر باشد.'
      : 'قیمت پیشنهادی از حداکثر مجاز درجهٔ شما بیشتر است.');
  }
  return { serviceId, startAt, endAt, adjustmentBasisPoints: bp };
}

function createWorkerOffers({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS worker_offers (
      id TEXT PRIMARY KEY,
      workerId TEXT NOT NULL,
      serviceId TEXT NOT NULL,
      startAt TEXT NOT NULL,
      endAt TEXT NOT NULL,
      adjustmentBasisPoints INTEGER NOT NULL CHECK (adjustmentBasisPoints BETWEEN 1 AND 100000),
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'BOOKED', 'CANCELLED')),
      bookedOrderId TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_worker_offers_worker ON worker_offers(workerId, startAt);
    CREATE INDEX IF NOT EXISTS idx_worker_offers_open ON worker_offers(status, startAt);
  `);
  const insert = database.prepare(`INSERT INTO worker_offers
    (id, workerId, serviceId, startAt, endAt, adjustmentBasisPoints, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)`);
  const byId = database.prepare('SELECT * FROM worker_offers WHERE id = ?');
  const byWorker = database.prepare('SELECT * FROM worker_offers WHERE workerId = ? ORDER BY startAt DESC LIMIT 200');
  const openFuture = database.prepare(`SELECT * FROM worker_offers
    WHERE status = 'OPEN' AND endAt > ? ORDER BY startAt ASC LIMIT 200`);
  const openCount = database.prepare(`SELECT COUNT(*) AS n FROM worker_offers
    WHERE workerId = ? AND status = 'OPEN' AND endAt > ?`);
  const overlapping = database.prepare(`SELECT id FROM worker_offers
    WHERE workerId = ? AND status = 'OPEN' AND startAt < ? AND endAt > ? LIMIT 1`);
  const cancel = database.prepare(`UPDATE worker_offers SET status = 'CANCELLED'
    WHERE id = ? AND workerId = ? AND status = 'OPEN'`);
  const book = database.prepare(`UPDATE worker_offers SET status = 'BOOKED', bookedOrderId = ?
    WHERE id = ? AND status = 'OPEN'`);

  function create(workerId, input, now) {
    return transaction(() => {
      if (openCount.get(workerId, now.toISOString()).n >= MAX_OPEN_OFFERS) {
        throw new OfferError('TOO_MANY_OFFERS', 'تعداد پیشنهادهای باز شما به سقف رسیده است.');
      }
      if (overlapping.get(workerId, input.endAt, input.startAt)) {
        throw new OfferError('OVERLAP', 'این بازه با پیشنهاد باز دیگری از شما هم‌پوشانی دارد.');
      }
      const id = 'OFR-' + crypto.randomBytes(8).toString('hex');
      insert.run(id, workerId, input.serviceId, input.startAt, input.endAt, input.adjustmentBasisPoints, now.toISOString());
      return byId.get(id);
    });
  }

  return {
    create,
    get: (id) => byId.get(String(id)) || null,
    listForWorker: (workerId) => byWorker.all(workerId),
    listOpen: (now) => openFuture.all(now.toISOString()),
    cancel: (id, workerId) => cancel.run(id, workerId).changes === 1,
    /** رزرو اتمی: فقط یک سفارش می‌تواند پیشنهاد باز را بگیرد. */
    book: (id, orderId) => book.run(orderId, id).changes === 1,
  };
}

module.exports = {
  OfferError,
  MIN_BASIS_POINTS,
  maxBasisPointsForTier,
  validateOfferInput,
  createWorkerOffers,
};
