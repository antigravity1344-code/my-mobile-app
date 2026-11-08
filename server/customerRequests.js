'use strict';
const crypto = require('node:crypto');
const { validateOfferInput, OfferError } = require('./workerOffers');

// درخواست ساعت دلخواه مشتری (تبصرهٔ مصوب ۸ نوامبر ۲۰۲۶).
// تنها استثنای قاعدهٔ «قیمت فقط از سرور»: مشتری درصد را در همین بازهٔ مدیر انتخاب می‌کند و سرور آن را ذخیره می‌کند.
// این حدود پیش‌فرض‌اند و جدا از حدود متخصص‌اند؛ تنظیم مدیر در مرحلهٔ بعد اضافه می‌شود.
const CUSTOMER_POLICY = Object.freeze({ minBps: 7000, maxBps: 13000, goldMaxBps: 13000 });
const MAX_OPEN_PER_CUSTOMER = 5;

function createCustomerRequests({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_requests (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      serviceId TEXT NOT NULL,
      startAt TEXT NOT NULL,
      endAt TEXT NOT NULL,
      adjustmentBasisPoints INTEGER NOT NULL CHECK (adjustmentBasisPoints BETWEEN 1 AND 100000),
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'CANCELLED')),
      acceptedWorkerId TEXT,
      orderId TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_requests_customer ON customer_requests(customerId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_customer_requests_open ON customer_requests(status, startAt);
  `);
  // ستون‌های آدرس و ترجیح جنسیت (additive): جدول قدیمی‌تر را امن تکمیل می‌کند.
  const columns = new Set(database.prepare("PRAGMA table_info(customer_requests)").all().map((c) => c.name));
  for (const [name, def] of [['address', 'address TEXT'], ['addressNotes', 'addressNotes TEXT'], ['genderPreference', 'genderPreference TEXT']]) {
    if (!columns.has(name)) database.exec("ALTER TABLE customer_requests ADD COLUMN " + def);
  }
  const insert = database.prepare(`INSERT INTO customer_requests
    (id, customerId, serviceId, startAt, endAt, adjustmentBasisPoints, status, createdAt, address, addressNotes, genderPreference)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`);
  const openForWorker = database.prepare(`SELECT * FROM customer_requests
    WHERE status = 'OPEN' AND endAt > ? ORDER BY startAt ASC LIMIT 200`);
  const byId = database.prepare('SELECT * FROM customer_requests WHERE id = ?');
  const byCustomer = database.prepare('SELECT * FROM customer_requests WHERE customerId = ? ORDER BY createdAt DESC LIMIT 100');
  const openCount = database.prepare(`SELECT COUNT(*) AS n FROM customer_requests
    WHERE customerId = ? AND status = 'OPEN' AND endAt > ?`);
  const cancel = database.prepare(`UPDATE customer_requests SET status = 'CANCELLED'
    WHERE id = ? AND customerId = ? AND status = 'OPEN'`);
  const openFuture = database.prepare(`SELECT * FROM customer_requests
    WHERE status = 'OPEN' AND endAt > ? ORDER BY startAt ASC LIMIT 200`);

  /** اعتبارسنجی ورودی با همان قواعد زمان و درصد پیشنهاد متخصص، ولی با حدود مشتری. */
  function validate(body, now) {
    return validateOfferInput(body, { tierKey: 'gold', now, policy: CUSTOMER_POLICY });
  }

  function create(customerId, input, now, extra = {}) {
    return transaction(() => {
      if (openCount.get(customerId, now.toISOString()).n >= MAX_OPEN_PER_CUSTOMER) {
        throw new OfferError('TOO_MANY_REQUESTS', 'تعداد درخواست‌های باز شما به سقف رسیده است.');
      }
      const id = 'CRQ-' + crypto.randomBytes(8).toString('hex');
      insert.run(id, customerId, input.serviceId, input.startAt, input.endAt, input.adjustmentBasisPoints, now.toISOString(),
        extra.address || null, extra.addressNotes || null, extra.genderPreference || null);
      return byId.get(id);
    });
  }

  return {
    CUSTOMER_POLICY,
    validate,
    create,
    get: (id) => byId.get(String(id)) || null,
    listForCustomer: (customerId) => byCustomer.all(customerId),
    listOpen: (now) => openFuture.all(now.toISOString()),
    /** درخواست‌های باز برای متخصص: فقط خدمت‌هایی که صلاحیتش را دارد و جنسیتی که مشتری خواسته (یا بدون ترجیح). */
    listOpenForWorker: (now, worker, qualifies) => openForWorker.all(now.toISOString())
      .filter((r) => qualifies(r.serviceId, worker))
      .filter((r) => !r.genderPreference || r.genderPreference === 'NO_PREFERENCE' || r.genderPreference === worker.gender),
    /** لغو فقط توسط همان مشتری و فقط تا پیش از پذیرش. */
    cancel: (id, customerId) => cancel.run(id, customerId).changes === 1,
  };
}

module.exports = { createCustomerRequests, CUSTOMER_POLICY, MAX_OPEN_PER_CUSTOMER };
