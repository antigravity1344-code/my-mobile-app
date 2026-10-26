const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const fieldCrypto = require('./fieldCrypto');
const { createPointsService } = require('./pointsService');
const { createOrderStart } = require('./orderStart');
const { createCommissionPolicy } = require('./commissionPolicy');
const { createCompletionPolicy } = require('./completionPolicy');
const { createOrderCompletion } = require('./orderCompletion');
const { createWorkerWallet } = require('./workerWallet');
const { createPaymentSettings } = require('./paymentSettings');
const { createServiceAreas } = require('./serviceAreas');
const { createWorkerServiceArea } = require('./workerServiceArea');
const { IMPLEMENTED_PAYMENT_PROVIDERS } = require('./paymentProviders');

const USER_FIELDS = new Set([
  'id',
  'phone',
  'role',
  'status',
  'isProfileComplete',
  'name',
  'nationalId',
  'birthDate',
  'avatar',
  'address',
  'city',
  'addresses',
  'savedAddresses',
  'skills',
  'bankSheba',
  'idDoc',
  'createdAt',
]);

const ORDER_FIELDS = new Set([
  'id',
  'customerId',
  'customerName',
  'customerPhone',
  'customerAvatar',
  'serviceTitle',
  'serviceId',
  'durationHours',
  'genderPreference',
  'serviceOptions',
  'addressNotes',
  'recurringFrequency',
  'customerTier',
  'pricing',
  'address',
  'date',
  'time',
  'price',
  'notes',
  'status',
  'paymentStatus',
  'paymentMethod',
  'cleanerId',
  'cleanerName',
  'cleanerAvatar',
  'cleanerPhone',
  'ratings',
  'createdAt',
  'completedAt',
  'cancelledAt',
  'cancelledBy',
  'cancelReason',
]);

// نوع‌های رویداد سفارش طبق D-52 سند ARCHITECTURE_DECISIONS.md. نوع جدید فقط با تصمیم ثبت‌شده در سند اضافه می‌شود.
const ORDER_EVENT_KINDS = Object.freeze([
  'START_REPORTED_BY_WORKER',
  'START_CONFIRMED_BY_CUSTOMER',
  'START_DENIED_BY_CUSTOMER',
  'START_PROMPT_SENT',
  'START_PROMPT_ANSWERED',
  'END_REPORTED_BY_WORKER',
  'END_CONFIRMED_BY_CUSTOMER',
  'END_DENIED_BY_CUSTOMER',
  'DISPUTE_OPENED',
  'ADMIN_DECISION',
  'WORKER_CANNOT_CONTINUE',
  'EXPECTED_TIME_CHANGED',
  // تاریخچه پذیرش‌ها (تصمیم صاحب محصول در مرحله ۱): هر پذیرش موفق یک رکورد؛ acceptedAt روی سفارش آخرین پذیرش است.
  'ORDER_ACCEPTED',
  // برگشت سفارش پذیرفته‌شده یا بسته به PENDING توسط مدیر (D-50): پاک شدن پذیرش و متخصص قابل بازسازی می‌شود.
  'ORDER_RETURNED_TO_PENDING',
  // مرحله ۳: درخواست لغو و لغو نهایی، هر کدام در همان تراکنش تغییر وضعیت (D-11، D-12).
  'CANCEL_REQUESTED',
  'ORDER_CANCELLED',
]);
const CANCEL_REVIEW_MS = 10 * 60 * 1000;
const CANCEL_FAULTS = Object.freeze(['customer', 'worker', 'none']);
const ORDER_EVENT_ACTOR_ROLES = Object.freeze(['customer', 'worker', 'admin', 'system']);
// مدیر فعلاً حساب کاربری و شناسه ندارد؛ برای مدیر و سیستم actorId می‌تواند خالی باشد.
const ACTOR_ROLES_WITHOUT_ID = Object.freeze(['admin', 'system']);
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_EVENT_NOTE_LENGTH = 500;
const MAX_EVENT_DATA_BYTES = 4096;
const MAX_EVENT_DATA_DEPTH = 16;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** زمان ISO 8601 با منطقه زمانی صریح را به UTC ISO تبدیل می‌کند؛ مقدار نامعتبر null برمی‌گرداند. */
function normalizeIsoTimestamp(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 40) return null;
  const match = ISO_TIMESTAMP_PATTERN.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  if (calendarDay.getUTCMonth() !== month - 1 || calendarDay.getUTCDate() !== day) return null;
  const zone = match[7];
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

// Metadata is optional, bounded JSON, never free-form text in note. Sorted object keys
// give retries a stable content comparison without rewriting historical event rows.
function encodeOrderEventData(value) {
  if (value == null) return null;
  const plain = (item) => item && typeof item === 'object' &&
    (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null);
  if (!plain(value) || Array.isArray(value)) throw new Error('INVALID_EVENT_DATA');
  const ancestors = new Set();
  function normalize(item, depth) {
    if (depth > MAX_EVENT_DATA_DEPTH) throw new Error('INVALID_EVENT_DATA');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || (!Array.isArray(item) && !plain(item)) || ancestors.has(item)) {
      throw new Error('INVALID_EVENT_DATA');
    }
    ancestors.add(item);
    const normalized = Array.isArray(item)
      ? item.map(entry => normalize(entry, depth + 1))
      : Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key], depth + 1)]));
    ancestors.delete(item);
    return normalized;
  }
  const encoded = JSON.stringify(normalize(value, 0));
  if (Buffer.byteLength(encoded, 'utf8') > MAX_EVENT_DATA_BYTES) throw new Error('INVALID_EVENT_DATA');
  return encoded;
}

function readOrderEventData(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const encoded = encodeOrderEventData(JSON.parse(raw));
    return encoded === null ? null : JSON.parse(encoded);
  } catch (error) {
    // Legacy or malformed metadata is unknown; it is never guessed or repaired.
    return null;
  }
}

function createDataStore(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename, { timeout: 5000 });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      isProfileComplete INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL DEFAULT '',
      nationalId TEXT NOT NULL DEFAULT '',
      birthDate TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      addressesJson TEXT NOT NULL DEFAULT '[]',
      savedAddressesJson TEXT NOT NULL DEFAULT '[]',
      skillsJson TEXT NOT NULL DEFAULT '[]',
      bankSheba TEXT NOT NULL DEFAULT '',
      idDoc TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      seq INTEGER NOT NULL,
      UNIQUE(phone, role)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      customerName TEXT NOT NULL,
      customerPhone TEXT NOT NULL,
      customerAvatar TEXT,
      serviceTitle TEXT NOT NULL,
      serviceId TEXT,
      durationHours INTEGER,
      genderPreference TEXT,
      serviceOptionsJson TEXT,
      addressNotes TEXT,
      recurringFrequency TEXT,
      customerTier TEXT,
      pricingJson TEXT,
      address TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      price INTEGER NOT NULL,
      notes TEXT,
      status TEXT NOT NULL,
      paymentStatus TEXT,
      paymentMethod TEXT,
      cleanerId TEXT,
      cleanerName TEXT,
      cleanerAvatar TEXT,
      cleanerPhone TEXT,
      ratingsJson TEXT,
      createdAt TEXT NOT NULL,
      completedAt TEXT,
      cancelledAt TEXT,
      cancelledBy TEXT,
      cancelReason TEXT,
      seq INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS otp_store (
      phone TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      lastSent INTEGER NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      role TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      role TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      orderId TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      readAt TEXT
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  const orderColumnNames = new Set(
    database.prepare('PRAGMA table_info(orders)').all().map((column) => column.name)
  );
  const addedOrderColumns = [
    ['serviceId', 'serviceId TEXT'],
    ['durationHours', 'durationHours INTEGER'],
    ['genderPreference', 'genderPreference TEXT'],
    ['serviceOptionsJson', 'serviceOptionsJson TEXT'],
    ['addressNotes', 'addressNotes TEXT'],
    ['recurringFrequency', 'recurringFrequency TEXT'],
    ['customerTier', 'customerTier TEXT'],
    ['pricingJson', 'pricingJson TEXT'],
    // مرحله ۱ معماری (D-50): فقط با دستورهای اختصاصی نوشته می‌شوند، نه با insert/update عمومی سفارش.
    ['acceptedAt', 'acceptedAt TEXT'],
    ['expectedStartAt', 'expectedStartAt TEXT'],
    ['agreedStartAt', 'agreedStartAt TEXT'],
    ['startStatus', "startStatus TEXT NOT NULL DEFAULT 'not_recorded'"],
    // کلید تکرارنشدنی ثبت سفارش از طرف اپ (D-07): فقط با createOrder نوشته می‌شود و در پاسخ‌ها فرستاده نمی‌شود.
    ['clientRequestId', 'clientRequestId TEXT'],
    // مرحله ۳ (D-13، D-14): فقط با دستورهای لغو نوشته می‌شوند، نه با updateOrder عمومی.
    ['cancelInitiator', 'cancelInitiator TEXT'],
    ['cancelFault', 'cancelFault TEXT'],
    ['cancelRequestedAt', 'cancelRequestedAt TEXT'],
    ['cancelQuoteJson', 'cancelQuoteJson TEXT'],
  ];
  for (const [name, definition] of addedOrderColumns) {
    if (!orderColumnNames.has(name)) {
      database.exec(`ALTER TABLE orders ADD COLUMN ${definition}`);
    }
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_request
    ON orders(customerId, clientRequestId) WHERE clientRequestId IS NOT NULL
  `);

  // رویدادهای سفارش (D-02، D-52): فقط درج. orderId عمداً کلید خارجی ندارد.
  database.exec(`
    CREATE TABLE IF NOT EXISTS order_events (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      actorId TEXT,
      actorRole TEXT NOT NULL CHECK (actorRole IN ('customer', 'worker', 'admin', 'system')),
      kind TEXT NOT NULL,
      claimedAt TEXT,
      recordedAt TEXT NOT NULL,
      correctsEventId TEXT REFERENCES order_events(id),
      note TEXT,
      idempotencyKey TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(orderId, recordedAt);
    CREATE TRIGGER IF NOT EXISTS order_events_no_update BEFORE UPDATE ON order_events
    BEGIN
      SELECT RAISE(ABORT, 'order_events is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS order_events_no_delete BEFORE DELETE ON order_events
    BEGIN
      SELECT RAISE(ABORT, 'order_events is append-only');
    END;
    -- جلوی بازنویسی با INSERT OR REPLACE / REPLACE INTO / UPSERT را هم می‌گیرد (حذف ضمنیِ REPLACE تریگر حذف را صدا نمی‌زند).
    CREATE TRIGGER IF NOT EXISTS order_events_no_overwrite BEFORE INSERT ON order_events
    WHEN EXISTS (SELECT 1 FROM order_events WHERE id = NEW.id)
      OR EXISTS (SELECT 1 FROM order_events WHERE idempotencyKey = NEW.idempotencyKey)
    BEGIN
      SELECT RAISE(ABORT, 'order_events is append-only');
    END;
  `);
  // متخصصِ موضوع رویداد به‌صورت ساختاریافته (D-06/D-52)، نه در note: متخصص پذیرنده در ORDER_ACCEPTED
  // و متخصص کنارگذاشته‌شده در ORDER_RETURNED_TO_PENDING. ردیف‌های قدیمی خالی می‌مانند.
  const eventColumnNames = new Set(database.prepare('PRAGMA table_info(order_events)').all().map((c) => c.name));
  if (!eventColumnNames.has('workerId')) database.exec('ALTER TABLE order_events ADD COLUMN workerId TEXT');
  if (!eventColumnNames.has('dataJson')) database.exec('ALTER TABLE order_events ADD COLUMN dataJson TEXT');

  let depth = 0;

  function transaction(fn) {
    if (depth > 0) return fn();
    database.exec('BEGIN IMMEDIATE');
    depth += 1;
    try {
      const result = fn();
      depth -= 1;
      database.exec('COMMIT');
      return result;
    } catch (error) {
      depth = 0;
      try {
        database.exec('ROLLBACK');
      } catch (rollbackError) {
        // تراکنش اگر قبلاً بسته شده باشد، خطای اصلی حفظ می‌شود.
      }
      throw error;
    }
  }

  function parseJson(value, fallback) {
    if (value == null || value === '') return fallback;
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  }

  function userFromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      phone: row.phone,
      role: row.role,
      status: row.status,
      isProfileComplete: row.isProfileComplete === 1,
      name: row.name || '',
      nationalId: fieldCrypto.decryptString(row.nationalId || ''),
      birthDate: row.birthDate || '',
      avatar: row.avatar || '',
      address: row.address || '',
      city: row.city || '',
      addresses: parseJson(row.addressesJson, []),
      savedAddresses: parseJson(row.savedAddressesJson, []),
      skills: parseJson(row.skillsJson, []),
      bankSheba: fieldCrypto.decryptString(row.bankSheba || ''),
      idDoc: row.idDoc || '',
      createdAt: row.createdAt,
    };
  }

  function parseCancelQuote(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function orderFromRow(row) {
    if (!row) return null;
    const order = {
      id: row.id,
      customerId: row.customerId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      serviceTitle: row.serviceTitle,
      address: row.address,
      date: row.date,
      time: row.time,
      price: row.price,
      status: row.status,
      createdAt: row.createdAt,
      durationHours: row.durationHours == null ? null : row.durationHours,
      genderPreference: row.genderPreference == null ? null : row.genderPreference,
      addressNotes: row.addressNotes == null ? null : row.addressNotes,
      recurringFrequency: row.recurringFrequency == null ? null : row.recurringFrequency,
      customerTier: row.customerTier == null ? null : row.customerTier,
      serviceOptions: parseJson(row.serviceOptionsJson, null),
      pricing: parseJson(row.pricingJson, null),
      acceptedAt: row.acceptedAt == null ? null : row.acceptedAt,
      expectedStartAt: row.expectedStartAt == null ? null : row.expectedStartAt,
      agreedStartAt: row.agreedStartAt == null ? null : row.agreedStartAt,
      startStatus: row.startStatus || 'not_recorded',
      cancelInitiator: row.cancelInitiator == null ? null : row.cancelInitiator,
      cancelFault: row.cancelFault == null ? null : row.cancelFault,
      cancelRequestedAt: row.cancelRequestedAt == null ? null : row.cancelRequestedAt,
      cancelQuote: parseCancelQuote(row.cancelQuoteJson),
    };
    const optional = [
      'customerAvatar',
      'notes',
      'serviceId',
      'paymentStatus',
      'paymentMethod',
      'cleanerId',
      'cleanerName',
      'cleanerAvatar',
      'cleanerPhone',
      'completedAt',
      'cancelledAt',
      'cancelledBy',
      'cancelReason',
    ];
    for (const key of optional) {
      order[key] = row[key] == null ? null : row[key];
    }
    if (row.ratingsJson) order.ratings = parseJson(row.ratingsJson, null);
    return order;
  }

  function jsonArray(value) {
    return JSON.stringify(Array.isArray(value) ? value : []);
  }

  const insertUser = database.prepare(`
    INSERT INTO users (
      id, phone, role, status, isProfileComplete, name, nationalId, birthDate, avatar,
      address, city, addressesJson, savedAddressesJson, skillsJson, bankSheba, idDoc, createdAt, seq
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  const updateUserStmt = database.prepare(`
    UPDATE users SET
      phone = ?, role = ?, status = ?, isProfileComplete = ?, name = ?, nationalId = ?,
      birthDate = ?, avatar = ?, address = ?, city = ?, addressesJson = ?, savedAddressesJson = ?,
      skillsJson = ?, bankSheba = ?, idDoc = ?, createdAt = ?
    WHERE id = ?
  `);
  // D-63: a residence edit must not rewrite verification, encrypted fields or documents.
  const updateWorkerAddressStmt = database.prepare(
    "UPDATE users SET address = ? WHERE id = ? AND role = 'WORKER' RETURNING address"
  );
  const updateWorkerSkillsStmt = database.prepare(
    "UPDATE users SET skillsJson = ? WHERE id = ? AND role = 'WORKER' RETURNING skillsJson"
  );
  const selectUser = database.prepare('SELECT * FROM users WHERE id = ?');
  const selectUserByPhone = database.prepare('SELECT * FROM users WHERE phone = ? AND role = ?');
  const listUsersStmt = database.prepare('SELECT * FROM users ORDER BY seq ASC');
  const listUsersByRole = database.prepare('SELECT * FROM users WHERE role = ? ORDER BY seq ASC');
  const nextUserSeq = database.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM users');

  const insertOrder = database.prepare(`
    INSERT INTO orders (
      id, customerId, customerName, customerPhone, customerAvatar, serviceTitle, serviceId,
      durationHours, genderPreference, serviceOptionsJson, addressNotes, recurringFrequency, customerTier, pricingJson, address, date, time,
      price, notes, status, paymentStatus, paymentMethod, cleanerId, cleanerName, cleanerAvatar,
      cleanerPhone, ratingsJson, createdAt, completedAt, cancelledAt, cancelledBy, cancelReason, seq
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  const updateOrderStmt = database.prepare(`
    UPDATE orders SET
      customerId = ?, customerName = ?, customerPhone = ?, customerAvatar = ?, serviceTitle = ?, serviceId = ?,
      durationHours = ?, genderPreference = ?, serviceOptionsJson = ?, addressNotes = ?,
      recurringFrequency = ?, customerTier = ?, pricingJson = ?,
      address = ?, date = ?, time = ?, price = ?, notes = ?, status = ?, paymentStatus = ?,
      paymentMethod = ?, cleanerId = ?, cleanerName = ?, cleanerAvatar = ?, cleanerPhone = ?,
      ratingsJson = ?, createdAt = ?, completedAt = ?, cancelledAt = ?, cancelledBy = ?, cancelReason = ?
    WHERE id = ?
  `);
  const selectOrder = database.prepare('SELECT * FROM orders WHERE id = ?');
  const listOrdersStmt = database.prepare('SELECT * FROM orders ORDER BY seq ASC');
  const nextOrderSeq = database.prepare('SELECT COALESCE(MIN(seq), 0) - 1 AS seq FROM orders');
  const setExpectedStartAtStmt = database.prepare('UPDATE orders SET expectedStartAt = ? WHERE id = ?');
  const setClientRequestIdStmt = database.prepare('UPDATE orders SET clientRequestId = ? WHERE id = ?');
  const selectOrderByClientRequestStmt = database.prepare(
    'SELECT * FROM orders WHERE customerId = ? AND clientRequestId = ?'
  );
  const countReturnEventsStmt = database.prepare(
    "SELECT COUNT(*) AS n FROM order_events WHERE orderId = ? AND kind = 'ORDER_RETURNED_TO_PENDING'"
  );
  const claimCancelRequestStmt = database.prepare(`
    UPDATE orders
    SET status = 'CANCEL_REQUESTED', cancelRequestedAt = ?, cancelInitiator = 'customer',
        cancelFault = 'customer', cancelReason = ?, cancelQuoteJson = ?
    WHERE id = ? AND status = ?
  `);
  const finalizeCancelRequestStmt = database.prepare(`
    UPDATE orders
    SET status = 'CANCELLED', cancelledAt = ?, cancelledBy = ?
    WHERE id = ? AND status = 'CANCEL_REQUESTED'
  `);
  const setCancelMetaStmt = database.prepare(
    'UPDATE orders SET cancelInitiator = ?, cancelFault = ? WHERE id = ?'
  );
  const setCancelFaultStmt = database.prepare(
    'UPDATE orders SET cancelFault = ? WHERE id = ? AND status = ?'
  );
  const listCancelRequestsStmt = database.prepare(
    "SELECT id, cancelRequestedAt FROM orders WHERE status = 'CANCEL_REQUESTED' AND cancelRequestedAt IS NOT NULL"
  );
  const recordAcceptanceStmt = database.prepare(
    "UPDATE orders SET acceptedAt = ?, startStatus = 'not_recorded', agreedStartAt = NULL WHERE id = ?"
  );
  const countAcceptanceEventsStmt = database.prepare(
    "SELECT COUNT(*) AS n FROM order_events WHERE orderId = ? AND kind = 'ORDER_ACCEPTED'"
  );
  // تنها مسیر پاک کردن پذیرش: برگشت سفارش فعال به PENDING (پذیرش و متخصص اختصاص‌یافته با هم پاک می‌شوند).
  const clearAcceptanceStmt = database.prepare(`
    UPDATE orders SET acceptedAt = NULL, cleanerId = NULL, cleanerName = NULL, cleanerAvatar = NULL, cleanerPhone = NULL,
      startStatus = 'not_recorded', agreedStartAt = NULL
    WHERE id = ?
  `);
  const insertOrderEventStmt = database.prepare(`
    INSERT INTO order_events (
      id, orderId, actorId, actorRole, kind, claimedAt, recordedAt, correctsEventId, note, idempotencyKey, workerId, dataJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectOrderEventStmt = database.prepare('SELECT * FROM order_events WHERE id = ?');
  const selectOrderEventByKeyStmt = database.prepare('SELECT * FROM order_events WHERE idempotencyKey = ?');
  const listOrderEventsStmt = database.prepare(
    'SELECT * FROM order_events WHERE orderId = ? ORDER BY recordedAt ASC, rowid ASC'
  );

  const upsertOtp = database.prepare(`
    INSERT INTO otp_store (phone, code, attempts, lastSent, expires)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      code = excluded.code,
      attempts = excluded.attempts,
      lastSent = excluded.lastSent,
      expires = excluded.expires
  `);
  const selectOtp = database.prepare('SELECT * FROM otp_store WHERE phone = ?');
  const deleteOtpStmt = database.prepare('DELETE FROM otp_store WHERE phone = ?');

  const insertSession = database.prepare(
    'INSERT INTO sessions (token, userId, role, expires) VALUES (?, ?, ?, ?)'
  );
  const selectSession = database.prepare('SELECT * FROM sessions WHERE token = ?');
  const deleteSessionStmt = database.prepare('DELETE FROM sessions WHERE token = ?');
  const deleteExpiredSessions = database.prepare('DELETE FROM sessions WHERE expires < ?');

  function userParams(user, seq) {
    return [
      user.id,
      user.phone,
      user.role,
      user.status,
      user.isProfileComplete ? 1 : 0,
      user.name || '',
      fieldCrypto.encryptString(user.nationalId || ''),
      user.birthDate || '',
      user.avatar || '',
      user.address || '',
      user.city || '',
      jsonArray(user.addresses),
      jsonArray(user.savedAddresses),
      jsonArray(user.skills),
      fieldCrypto.encryptString(user.bankSheba || ''),
      user.idDoc || '',
      user.createdAt,
      seq,
    ];
  }

  function orderParams(order, seq) {
    const optional = (key) => (order[key] === undefined ? null : order[key]);
    return [
      order.id,
      order.customerId,
      order.customerName,
      order.customerPhone,
      optional('customerAvatar'),
      order.serviceTitle,
      optional('serviceId'),
      Number.isInteger(order.durationHours) ? order.durationHours : null,
      typeof order.genderPreference === 'string' ? order.genderPreference : null,
      order.serviceOptions && typeof order.serviceOptions === 'object'
        ? JSON.stringify(order.serviceOptions)
        : null,
      typeof order.addressNotes === 'string' ? order.addressNotes : null,
      typeof order.recurringFrequency === 'string' ? order.recurringFrequency : null,
      typeof order.customerTier === 'string' ? order.customerTier : null,
      order.pricing && typeof order.pricing === 'object' ? JSON.stringify(order.pricing) : null,
      order.address,
      order.date,
      order.time,
      order.price,
      optional('notes'),
      order.status,
      optional('paymentStatus'),
      optional('paymentMethod'),
      optional('cleanerId'),
      optional('cleanerName'),
      optional('cleanerAvatar'),
      optional('cleanerPhone'),
      order.ratings ? JSON.stringify(order.ratings) : null,
      order.createdAt,
      optional('completedAt'),
      optional('cancelledAt'),
      optional('cancelledBy'),
      optional('cancelReason'),
      seq,
    ];
  }

  function getUser(id) {
    return userFromRow(selectUser.get(id));
  }

  function getUserByPhone(phone, role) {
    return userFromRow(selectUserByPhone.get(phone, role));
  }

  function listUsers(role) {
    const rows = role ? listUsersByRole.all(role) : listUsersStmt.all();
    return rows.map(userFromRow);
  }

  function createUser(user) {
    const seq = nextUserSeq.get().seq;
    insertUser.run(...userParams(user, seq));
    return getUser(user.id);
  }

  function updateUser(user) {
    const result = updateUserStmt.run(
      user.phone,
      user.role,
      user.status,
      user.isProfileComplete ? 1 : 0,
      user.name || '',
      fieldCrypto.encryptString(user.nationalId || ''),
      user.birthDate || '',
      user.avatar || '',
      user.address || '',
      user.city || '',
      jsonArray(user.addresses),
      jsonArray(user.savedAddresses),
      jsonArray(user.skills),
      fieldCrypto.encryptString(user.bankSheba || ''),
      user.idDoc || '',
      user.createdAt,
      user.id
    );
    if (!result.changes) {
      throw new Error('USER_NOT_FOUND');
    }
    return getUser(user.id);
  }

  function updateWorkerAddress(userId, address) {
    const row = updateWorkerAddressStmt.get(address, userId);
    if (!row) throw new Error('WORKER_NOT_FOUND');
    return row.address;
  }

  function updateWorkerSkills(userId, skills) {
    const row = updateWorkerSkillsStmt.get(jsonArray(skills), userId);
    if (!row) throw new Error('WORKER_NOT_FOUND');
    return parseJson(row.skillsJson, []);
  }

  function getOrder(id) {
    return orderFromRow(selectOrder.get(id));
  }

  function listOrders(filter) {
    return listOrdersStmt
      .all()
      .map(orderFromRow)
      .filter((order) => {
        if (!filter) return true;
        if (filter.customerId && order.customerId !== filter.customerId) return false;
        if (filter.cleanerId && order.cleanerId !== filter.cleanerId) return false;
        if (filter.status && order.status !== filter.status) return false;
        return true;
      });
  }

  /** سفارش قبلی همان مشتری با همان کلید ثبت (D-07)، یا null. */
  function findOrderByClientRequest(customerId, clientRequestId) {
    if (!customerId || !clientRequestId) return null;
    return orderFromRow(selectOrderByClientRequestStmt.get(customerId, clientRequestId));
  }

  function getOrders(filter) {
    return listOrders(filter);
  }

  function createOrder(order) {
    return transaction(() => {
      const seq = nextOrderSeq.get().seq;
      insertOrder.run(...orderParams(order, seq));
      if (order.expectedStartAt != null) {
        const expectedStartAt = normalizeIsoTimestamp(order.expectedStartAt);
        if (!expectedStartAt) throw new Error('INVALID_EXPECTED_START_AT');
        setExpectedStartAtStmt.run(expectedStartAt, order.id);
      }
      if (typeof order.clientRequestId === 'string' && order.clientRequestId) {
        setClientRequestIdStmt.run(order.clientRequestId, order.id);
      }
      return getOrder(order.id);
    });
  }

  /**
   * تنها محل ثبت پذیرش (D-50). acceptedAt سفارش زمان آخرین پذیرش معتبر می‌شود و هر پذیرش
   * در همان تراکنش یک رویداد ORDER_ACCEPTED در order_events می‌گیرد تا زمان‌های قبلی از دست نروند.
   * actor: { actorRole: 'worker' | 'admin', actorId, at? }. سفارش باید متخصص داشته باشد.
   */
  function recordAcceptance(orderId, actor) {
    const info = actor && typeof actor === 'object' ? actor : {};
    if (info.actorRole !== 'worker' && info.actorRole !== 'admin') throw new Error('INVALID_ACCEPTANCE_ACTOR');
    const acceptedAt = info.at === undefined ? new Date().toISOString() : normalizeIsoTimestamp(info.at);
    if (!acceptedAt) throw new Error('INVALID_ACCEPTED_AT');
    return transaction(() => {
      const row = selectOrder.get(orderId);
      if (!row) throw new Error('ORDER_NOT_FOUND');
      if (!row.cleanerId) throw new Error('ACCEPTANCE_WITHOUT_WORKER');
      recordAcceptanceStmt.run(acceptedAt, orderId);
      // کلید با شماره ترتیب پذیرش این سفارش ساخته می‌شود (داخل همان تراکنش BEGIN IMMEDIATE)،
      // پس دو پذیرش در یک میلی‌ثانیه هم کلید یکسان نمی‌گیرند و رویدادهای قبلی دست نمی‌خورند.
      const acceptanceNumber = countAcceptanceEventsStmt.get(orderId).n + 1;
      const event = appendOrderEvent({
        orderId,
        actorId: typeof info.actorId === 'string' ? info.actorId : null,
        actorRole: info.actorRole,
        kind: 'ORDER_ACCEPTED',
        claimedAt: acceptedAt,
        // متخصص اختصاص‌یافته به‌صورت ساختاریافته ثبت می‌شود (مسیر مدیر actorId ندارد).
        workerId: row.cleanerId,
        idempotencyKey: 'accept:' + orderId + ':' + acceptanceNumber,
      });
      if (event.code !== 'ok') throw new Error('ACCEPTANCE_EVENT_NOT_RECORDED');
      return acceptedAt;
    });
  }

  /**
   * برگشت سفارش فعال به PENDING (تصمیم صاحب محصول، D-50): acceptedAt و متخصص اختصاص‌یافته
   * در یک دستور پاک می‌شوند. این تنها مسیر پاک کردن acceptedAt است و نوشتن آن فقط در recordAcceptance است.
   * تاریخچه پذیرش‌ها در order_events می‌ماند. سفارش باید از قبل PENDING باشد.
   * returnEvent ({ actorRole, actorId, previousWorkerId }) وقتی داده شود که سفارش از وضعیت دیگری به PENDING
   * برگشته است؛ در همان تراکنش یک رویداد ORDER_RETURNED_TO_PENDING ثبت می‌شود.
   */
  function clearAcceptanceForReturnToPending(orderId, returnEvent) {
    return transaction(() => {
      const row = selectOrder.get(orderId);
      if (!row) throw new Error('ORDER_NOT_FOUND');
      if (row.status !== 'PENDING') throw new Error('ORDER_NOT_PENDING');
      clearAcceptanceStmt.run(orderId);
      if (returnEvent && typeof returnEvent === 'object') {
        const returnNumber = countReturnEventsStmt.get(orderId).n + 1;
        const event = appendOrderEvent({
          orderId,
          actorId: typeof returnEvent.actorId === 'string' ? returnEvent.actorId : null,
          actorRole: returnEvent.actorRole,
          kind: 'ORDER_RETURNED_TO_PENDING',
          claimedAt: new Date().toISOString(),
          workerId: returnEvent.previousWorkerId || null,
          idempotencyKey: 'return-pending:' + orderId + ':' + returnNumber,
        });
        if (event.code !== 'ok') throw new Error('RETURN_EVENT_NOT_RECORDED');
      }
      return getOrder(orderId);
    });
  }

  function updateOrder(order) {
    const existing = selectOrder.get(order.id);
    if (!existing) throw new Error('ORDER_NOT_FOUND');
    const optional = (key) => (order[key] === undefined ? null : order[key]);
    const result = updateOrderStmt.run(
      order.customerId,
      order.customerName,
      order.customerPhone,
      optional('customerAvatar'),
      order.serviceTitle,
      optional('serviceId'),
      Number.isInteger(order.durationHours) ? order.durationHours : null,
      typeof order.genderPreference === 'string' ? order.genderPreference : null,
      order.serviceOptions && typeof order.serviceOptions === 'object'
        ? JSON.stringify(order.serviceOptions)
        : null,
      typeof order.addressNotes === 'string' ? order.addressNotes : null,
      typeof order.recurringFrequency === 'string' ? order.recurringFrequency : null,
      typeof order.customerTier === 'string' ? order.customerTier : null,
      order.pricing && typeof order.pricing === 'object' ? JSON.stringify(order.pricing) : null,
      order.address,
      order.date,
      order.time,
      order.price,
      optional('notes'),
      order.status,
      optional('paymentStatus'),
      optional('paymentMethod'),
      optional('cleanerId'),
      optional('cleanerName'),
      optional('cleanerAvatar'),
      optional('cleanerPhone'),
      order.ratings ? JSON.stringify(order.ratings) : null,
      order.createdAt,
      optional('completedAt'),
      optional('cancelledAt'),
      optional('cancelledBy'),
      optional('cancelReason'),
      order.id
    );
    if (!result.changes) throw new Error('ORDER_NOT_FOUND');
    return getOrder(order.id);
  }

  function deleteOrder() {
    return false;
  }

  function getAddresses(userId) {
    const user = getUser(userId);
    return user && Array.isArray(user.savedAddresses) ? user.savedAddresses : [];
  }

  function updateAddresses(userId, savedAddresses) {
    return transaction(() => {
      const user = getUser(userId);
      if (!user) throw new Error('USER_NOT_FOUND');
      user.savedAddresses = savedAddresses;
      const defaultAddress = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
      if (defaultAddress) user.address = defaultAddress.fullAddress;
      updateUser(user);
      return user.savedAddresses;
    });
  }

  function getOtp(phone) {
    const row = selectOtp.get(phone);
    if (!row) return null;
    return {
      code: row.code,
      attempts: row.attempts,
      lastSent: row.lastSent,
      expires: row.expires,
    };
  }

  function saveOtp(phone, otp) {
    upsertOtp.run(phone, fieldCrypto.hashSecret(otp.code), otp.attempts, otp.lastSent, otp.expires);
  }

  function deleteOtp(phone) {
    deleteOtpStmt.run(phone);
  }

  function getSession(token) {
    // A database digest is storage metadata, never an external bearer credential.
    if (typeof token !== 'string' || !token || fieldCrypto.isHashed(token)) return null;
    const row = selectSession.get(fieldCrypto.hashSecret(token));
    if (!row) return null;
    return { userId: row.userId, role: row.role, expires: row.expires };
  }

  function createSession(token, session) {
    insertSession.run(fieldCrypto.hashSecret(token), session.userId, session.role, session.expires);
  }

  function deleteSession(token) {
    if (typeof token !== 'string' || !token || fieldCrypto.isHashed(token)) return false;
    return deleteSessionStmt.run(fieldCrypto.hashSecret(token)).changes > 0;
  }

  function pruneSessions(now) {
    deleteExpiredSessions.run(now);
  }

  function counts() {
    return {
      users: database.prepare('SELECT COUNT(*) AS count FROM users').get().count,
      orders: database.prepare('SELECT COUNT(*) AS count FROM orders').get().count,
      otps: database.prepare('SELECT COUNT(*) AS count FROM otp_store').get().count,
      sessions: database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
    };
  }

  function assertFields(record, allowed, label) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`رکورد ${label} قابل انتقال نیست.`);
    }
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) {
        throw new Error(`فیلد ناشناخته در ${label}: ${key}`);
      }
    }
  }

  function importSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('داده JSON قابل انتقال نیست.');
    }
    const users = Array.isArray(snapshot.users) ? snapshot.users : null;
    const orders = Array.isArray(snapshot.orders) ? snapshot.orders : null;
    const otpStore = snapshot.otpStore && typeof snapshot.otpStore === 'object' ? snapshot.otpStore : null;
    const sessions = snapshot.sessions && typeof snapshot.sessions === 'object' ? snapshot.sessions : {};
    if (!users || !orders || !otpStore) {
      throw new Error('ساختار JSON برای users، orders یا otpStore ناقص است.');
    }
    const expected = {
      users: users.length,
      orders: orders.length,
      otps: Object.keys(otpStore).length,
      sessions: Object.keys(sessions).length,
    };
    if (counts().users || counts().orders || counts().otps || counts().sessions) {
      throw new Error('پایگاه SQLite از قبل داده دارد و انتقال دوباره انجام نشد.');
    }

    transaction(() => {
      users.forEach((user, index) => {
        assertFields(user, USER_FIELDS, 'users');
        if (!user.id || !user.phone || !user.role || !user.status || !user.createdAt) {
          throw new Error('یک کاربر فیلد الزامی ندارد و منتقل نشد.');
        }
        insertUser.run(...userParams(user, index));
      });
      orders.forEach((order, index) => {
        assertFields(order, ORDER_FIELDS, 'orders');
        if (!order.id || !order.customerId || order.price == null || !order.status || !order.createdAt) {
          throw new Error('یک سفارش فیلد الزامی ندارد و منتقل نشد.');
        }
        if (!Number.isInteger(order.price)) {
          throw new Error('مبلغ یک سفارش عدد صحیح نیست و منتقل نشد.');
        }
        insertOrder.run(...orderParams(order, index));
      });
      for (const [phone, otp] of Object.entries(otpStore)) {
        if (!otp || typeof otp.code !== 'string' || !Number.isInteger(otp.attempts)) {
          throw new Error('یک رکورد OTP قابل انتقال نیست.');
        }
        upsertOtp.run(phone, fieldCrypto.hashSecret(otp.code), otp.attempts, otp.lastSent, otp.expires);
      }
      for (const [token, session] of Object.entries(sessions)) {
        if (!session || !session.userId || !session.role || typeof session.expires !== 'number') {
          throw new Error('یک نشست قابل انتقال نیست.');
        }
        insertSession.run(fieldCrypto.hashSecret(token), session.userId, session.role, session.expires);
      }
      const actual = counts();
      if (
        actual.users !== expected.users ||
        actual.orders !== expected.orders ||
        actual.otps !== expected.otps ||
        actual.sessions !== expected.sessions
      ) {
        throw new Error('تعداد رکوردهای SQLite با JSON برابر نیست.');
      }
    });

    return { expected, actual: counts() };
  }

  function tryAcceptOrder(orderId, cleaner) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.status !== 'PENDING') return { code: 'conflict', order };
      if (!workerWallet.read(cleaner.id).canAcceptNewOrders) return { code: 'wallet-debt' };
      order.status = 'ACCEPTED';
      order.cleanerId = cleaner.id;
      order.cleanerName = cleaner.name || '';
      order.cleanerAvatar = cleaner.avatar || '';
      order.cleanerPhone = cleaner.phone || '';
      updateOrder(order);
      recordAcceptance(order.id, { actorRole: 'worker', actorId: cleaner.id });
      addNotification(order.customerId, order.id, 'ORDER_ACCEPTED', 'سفارش پذیرفته شد', 'متخصص سفارش شما را پذیرفت.');
      addNotification(cleaner.id, order.id, 'ORDER_ACCEPTED', 'پذیرش سفارش', 'این سفارش را پذیرفتید.');
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  // Legacy callers must submit a versioned completion request; no bypass remains.
  function tryCompleteOrder() { return { code: 'invalid' }; }

  function requireOrderEvent(result) {
    if (!result || (result.code !== 'ok' && result.code !== 'duplicate')) {
      throw new Error('ORDER_EVENT_FAILED');
    }
  }

  function publicCancelQuote(quote) {
    return {
      phase: quote.phase,
      quotedPoints: quote.quotedPoints,
      deductiblePoints: quote.deductiblePoints,
      usesFreeCancel: Boolean(quote.usesFreeCancel),
      ruleVersion: quote.ruleVersion == null ? null : quote.ruleVersion,
      reasonCode: quote.reasonCode,
    };
  }

  function cancelPreviewMessage(quote) {
    if (quote.reasonCode === 'free_cancel') {
      const left = Number.isInteger(quote.freeCancelsAfter) ? quote.freeCancelsAfter : 0;
      return 'این لغو از فرصت‌های لغو بدون کسر امتیاز شما استفاده می‌کند؛ ' + left + ' فرصت باقی می‌ماند.';
    }
    if (quote.reasonCode === 'cancel_penalty') {
      const points = Number.isInteger(quote.deductiblePoints) ? quote.deductiblePoints : 0;
      return 'با لغو این سفارش ' + points + ' امتیاز از امتیاز شما کسر می‌شود. آیا موافقید؟';
    }
    return 'برای این لغو قانون امتیاز فعالی ثبت نشده است و امتیازی کسر نمی‌شود.';
  }

  function quotesMatch(confirmQuote, quote) {
    if (!confirmQuote || typeof confirmQuote !== 'object') return false;
    const shown = publicCancelQuote(quote);
    return confirmQuote.phase === shown.phase
      && confirmQuote.quotedPoints === shown.quotedPoints
      && confirmQuote.deductiblePoints === shown.deductiblePoints
      && Boolean(confirmQuote.usesFreeCancel) === shown.usesFreeCancel
      && (confirmQuote.ruleVersion == null ? null : confirmQuote.ruleVersion) === shown.ruleVersion
      && confirmQuote.reasonCode === shown.reasonCode;
  }

  /** پیش‌نمایش مشتری. قانونِ نبودِ جریمه لغو را مسدود نمی‌کند و به قفل صفر تبدیل می‌شود (D-10). */
  function customerCancelQuote(orderId, customerId) {
    const raw = pointsApi.quoteCancelPenalty({ orderId, userId: customerId });
    if (raw.code === 'rule-missing') {
      return {
        code: 'ok',
        phase: raw.phase || 'after_accept',
        quotedPoints: 0,
        deductiblePoints: 0,
        usesFreeCancel: false,
        reasonCode: 'no_penalty_rule',
        ruleKey: null,
        ruleVersion: null,
      };
    }
    return raw;
  }

  function quoteResponse(quote) {
    return { code: 'needs-confirmation', quote: publicCancelQuote(quote), message: cancelPreviewMessage(quote) };
  }

  function lockedQuote(quote) {
    return {
      quotedPoints: quote.quotedPoints,
      deductiblePoints: quote.deductiblePoints,
      usesFreeCancel: Boolean(quote.usesFreeCancel),
      reasonCode: quote.reasonCode,
      ruleKey: quote.ruleKey || null,
      ruleVersion: Number.isInteger(quote.ruleVersion) ? quote.ruleVersion : null,
    };
  }

  function notifyCancelRequested(order) {
    addNotification(order.customerId, order.id, 'CANCEL_REQUESTED', 'درخواست لغو', 'درخواست ثبت شده و در حال بررسی است.');
    if (order.cleanerId) {
      addNotification(
        order.cleanerId,
        order.id,
        'CANCEL_REQUESTED',
        'درخواست لغو',
        'درخواست لغو این سفارش در حال بررسی است. تا پایان بررسی کار را ادامه ندهید.'
      );
    }
    addNotification('admin', order.id, 'CANCEL_REQUESTED', 'درخواست لغو', 'درخواست لغو یک سفارش ثبت شده و در حال بررسی است.');
  }

  function notifyCancelFinal(order) {
    addNotification(order.customerId, order.id, 'ORDER_CANCELLED', 'سفارش لغو شد', 'سفارش شما لغو شد.');
    if (order.cleanerId) {
      addNotification(
        order.cleanerId,
        order.id,
        'ORDER_CANCELLED',
        'سفارش لغو شد',
        'این سفارش لغو شد. کار را ادامه ندهید.'
      );
    }
  }

  function pointsOutcomeOk(result) {
    return result && (result.code === 'ok' || result.code === 'duplicate' || result.code === 'nothing' || result.code === 'insufficient');
  }

  /** اثر قفل‌شده، فقط وقتی تقصیر با مشتری است. نتیجه هیچ‌وقت از عدد قفل‌شده بیشتر نمی‌شود (D-14، D-15، D-20). */
  function applyLockedCancelEffect(order, actor) {
    if (order.cancelFault !== 'customer') return;
    const lock = order.cancelQuote;
    if (!lock || !lock.ruleKey || !Number.isInteger(lock.ruleVersion)) return;
    if (lock.usesFreeCancel) {
      const account = pointsApi.getUserPoints(order.customerId);
      if (!account || account.freeCancelsRemaining <= 0) return;
      const used = pointsApi.postEntry({
        userId: order.customerId,
        role: 'CUSTOMER',
        unit: 'free_cancel',
        delta: -1,
        reasonCode: 'free_cancel_use',
        orderId: order.id,
        ruleKey: lock.ruleKey,
        ruleVersion: lock.ruleVersion,
        idempotencyKey: 'free_cancel:use:' + order.id,
        actor,
        skipGrant: true,
      });
      if (!pointsOutcomeOk(used)) throw new Error('CANCEL_POINTS_FAILED');
      return;
    }
    const lockedPoints = Number.isInteger(lock.deductiblePoints) ? lock.deductiblePoints : 0;
    if (lockedPoints <= 0) return;
    const account = pointsApi.getUserPoints(order.customerId);
    const balance = account ? account.balance : 0;
    const amount = Math.min(lockedPoints, Math.max(0, balance));
    if (amount <= 0) return;
    const worker = order.cleanerId ? getUser(order.cleanerId) : null;
    if (worker && worker.role === 'WORKER') {
      const moved = pointsApi.postTransfer({
        points: amount,
        fromUserId: order.customerId,
        fromRole: 'CUSTOMER',
        toUserId: worker.id,
        toRole: 'WORKER',
        orderId: order.id,
        ruleKey: lock.ruleKey,
        ruleVersion: lock.ruleVersion,
        transferGroupId: 'cancel:' + order.id + ':transfer',
        debitKey: 'cancel:' + order.id + ':penalty',
        creditKey: 'cancel:' + order.id + ':credit',
        debitReasonCode: 'cancel_penalty',
        creditReasonCode: 'cancel_penalty_credit',
        actor,
      });
      if (!pointsOutcomeOk(moved)) throw new Error('CANCEL_POINTS_FAILED');
      return;
    }
    const debit = pointsApi.postEntry({
      userId: order.customerId,
      role: 'CUSTOMER',
      unit: 'points',
      delta: -amount,
      reasonCode: 'cancel_penalty',
      orderId: order.id,
      ruleKey: lock.ruleKey,
      ruleVersion: lock.ruleVersion,
      idempotencyKey: 'cancel:' + order.id + ':penalty',
      actor,
      skipGrant: true,
    });
    if (!pointsOutcomeOk(debit)) throw new Error('CANCEL_POINTS_FAILED');
  }

  function cancelImmediately(order, customerId, reason, nowIso) {
    order.status = 'CANCELLED';
    order.cancelledAt = nowIso;
    order.cancelledBy = customerId;
    order.cancelReason = reason;
    updateOrder(order);
    setCancelMetaStmt.run('customer', 'customer', order.id);
    requireOrderEvent(appendOrderEvent({
      orderId: order.id,
      actorId: customerId,
      actorRole: 'customer',
      kind: 'ORDER_CANCELLED',
      idempotencyKey: 'cancel-final:' + order.id,
      workerId: order.cleanerId || null,
    }));
    addNotification(order.customerId, order.id, 'ORDER_CANCELLED', 'سفارش لغو شد', 'سفارش شما لغو شد.');
    if (order.cleanerId) {
      addNotification(order.cleanerId, order.id, 'ORDER_CANCELLED', 'سفارش لغو شد', 'مشتری این سفارش را لغو کرد.');
    }
    return { code: 'ok', order: getOrder(order.id) };
  }

  function tryCancelOrder(orderId, customerId, allowedStatuses, reason, options) {
    const requested = getOrder(orderId);
    if (!requested) return { code: 'missing' };
    if (requested.customerId !== customerId) return { code: 'forbidden' };
    if (!allowedStatuses.includes(requested.status)) return { code: 'bad-status' };
    if (requested.status === 'PENDING') {
      const nowIso = new Date().toISOString();
      return transaction(() => {
        const order = getOrder(orderId);
        if (!order) return { code: 'missing' };
        if (order.customerId !== customerId) return { code: 'forbidden' };
        if (order.status !== 'PENDING') return { code: 'bad-status' };
        return cancelImmediately(order, customerId, reason, nowIso);
      });
    }

    const quoted = customerCancelQuote(orderId, customerId);
    if (quoted.code !== 'ok') return { code: quoted.code === 'forbidden' ? 'forbidden' : 'bad-status' };
    const confirmQuote = options && options.confirmQuote;
    if (!quotesMatch(confirmQuote, quoted)) return quoteResponse(quoted);

    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.customerId !== customerId) return { code: 'forbidden' };
      if (!allowedStatuses.includes(order.status) || order.status === 'PENDING') return { code: 'bad-status' };
      const fresh = customerCancelQuote(orderId, customerId);
      if (fresh.code !== 'ok') return { code: 'bad-status' };
      if (!quotesMatch(confirmQuote, fresh)) return quoteResponse(fresh);
      const requestedAt = new Date().toISOString();
      const claimed = claimCancelRequestStmt.run(
        requestedAt,
        reason,
        JSON.stringify(lockedQuote(fresh)),
        orderId,
        order.status
      );
      if (claimed.changes !== 1) return { code: 'bad-status' };
      const saved = getOrder(orderId);
      requireOrderEvent(appendOrderEvent({
        orderId,
        actorId: customerId,
        actorRole: 'customer',
        kind: 'CANCEL_REQUESTED',
        idempotencyKey: 'cancel-request:' + orderId,
        workerId: saved.cleanerId || null,
      }));
      notifyCancelRequested(saved);
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function finalizeCancelRequest(orderId, options) {
    const actor = options && options.actor === 'admin' ? 'admin' : 'system';
    const nowMs = options && Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.status === 'CANCELLED') return { code: 'already-final', order };
      if (order.status !== 'CANCEL_REQUESTED') return { code: 'not-requested', order };
      const cancelledBy = order.cancelInitiator === 'customer' ? order.customerId : actor;
      const claimed = finalizeCancelRequestStmt.run(new Date(nowMs).toISOString(), cancelledBy, orderId);
      if (claimed.changes !== 1) {
        const current = getOrder(orderId);
        return { code: current && current.status === 'CANCELLED' ? 'already-final' : 'conflict', order: current };
      }
      const saved = getOrder(orderId);
      applyLockedCancelEffect(saved, actor);
      requireOrderEvent(appendOrderEvent({
        orderId,
        actorRole: actor,
        kind: 'ORDER_CANCELLED',
        idempotencyKey: 'cancel-final:' + orderId,
        workerId: saved.cleanerId || null,
      }));
      notifyCancelFinal(saved);
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function finalizeDueCancelRequests(nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const due = listCancelRequestsStmt.all().filter((row) => {
      const requestedAt = Date.parse(row.cancelRequestedAt);
      return Number.isFinite(requestedAt) && now >= requestedAt + CANCEL_REVIEW_MS;
    });
    return due.map((row) => finalizeCancelRequest(row.id, { actor: 'system', nowMs: now }));
  }

  function setCancelFault(orderId, fault, onlyStatus) {
    if (!CANCEL_FAULTS.includes(fault)) return { code: 'invalid' };
    return transaction(() => {
      const claimed = setCancelFaultStmt.run(fault, orderId, onlyStatus);
      if (claimed.changes !== 1) return { code: 'conflict', order: getOrder(orderId) };
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function relaxCancelFault(orderId, fault) {
    if (!CANCEL_FAULTS.includes(fault)) return { code: 'invalid' };
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order || order.status !== 'CANCELLED') return { code: 'bad-status' };
      if (fault === 'customer' && order.cancelFault !== 'customer') return { code: 'fault-increase-unsupported' };
      if (order.cancelFault === 'customer' && fault !== 'customer') {
        const rows = pointsApi.listLedger().filter((entry) =>
          entry.orderId === orderId &&
          !entry.reversalOf &&
          (entry.idempotencyKey === 'free_cancel:use:' + orderId ||
            entry.idempotencyKey === 'cancel:' + orderId + ':penalty' ||
            entry.idempotencyKey === 'cancel:' + orderId + ':credit')
        );
        for (const entry of rows) {
          const reversed = pointsApi.reverseEntry({
            entryId: entry.id,
            idempotencyKey: 'reversal:' + entry.idempotencyKey,
            reasonCode: 'cancel_fault_reversed',
            actor: 'admin',
          });
          if (!reversed || (reversed.code !== 'ok' && reversed.code !== 'duplicate')) {
            throw new Error('CANCEL_REVERSE_FAILED');
          }
        }
      }
      if (order.cancelFault !== fault) setCancelFaultStmt.run(fault, orderId, 'CANCELLED');
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function recordImmediateAdminCancel(orderId) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order || order.status !== 'CANCELLED') return { code: 'bad-status' };
      if (!order.cancelInitiator) setCancelMetaStmt.run('admin', 'none', orderId);
      requireOrderEvent(appendOrderEvent({
        orderId,
        actorRole: 'admin',
        kind: 'ORDER_CANCELLED',
        idempotencyKey: 'cancel-final:' + orderId,
        workerId: order.cleanerId || null,
      }));
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function createRating(orderId, customerId, ratings) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.customerId !== customerId) return { code: 'forbidden' };
      if (order.status !== 'COMPLETED') return { code: 'bad-status' };
      if (!order.cleanerId) return { code: 'no-cleaner' };
      if (order.ratings && order.ratings.customerRating) return { code: 'duplicate' };
      order.ratings = { ...ratings, cleanerId: order.cleanerId };
      updateOrder(order);
      pointsApi.onOrderEvent({ name: 'rated', order: getOrder(orderId), raterUserId: customerId });
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function orderEventFromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.orderId,
      actorId: row.actorId == null ? null : row.actorId,
      actorRole: row.actorRole,
      kind: row.kind,
      claimedAt: row.claimedAt == null ? null : row.claimedAt,
      recordedAt: row.recordedAt,
      correctsEventId: row.correctsEventId == null ? null : row.correctsEventId,
      note: row.note == null ? null : row.note,
      idempotencyKey: row.idempotencyKey,
      workerId: row.workerId == null ? null : row.workerId,
      data: readOrderEventData(row.dataJson),
    };
  }

  /**
   * ثبت یک رویداد سفارش (فقط درج). نتیجه:
   * ok | duplicate (همان کلید با همان محتوا) | key-conflict (همان کلید با محتوای دیگر)
   * | invalid (فیلد نامعتبر) | missing-order | missing-correction (رکورد اصلاح‌شده نیست یا مال سفارش دیگری است).
   */
  function appendOrderEvent(input) {
    const data = input && typeof input === 'object' ? input : {};
    const orderId = typeof data.orderId === 'string' ? data.orderId.trim() : '';
    const actorRole = data.actorRole;
    const actorId = typeof data.actorId === 'string' && data.actorId.trim() ? data.actorId.trim() : null;
    const kind = data.kind;
    const idempotencyKey = typeof data.idempotencyKey === 'string' ? data.idempotencyKey.trim() : '';
    if (!orderId) return { code: 'invalid', field: 'orderId' };
    if (!ORDER_EVENT_ACTOR_ROLES.includes(actorRole)) return { code: 'invalid', field: 'actorRole' };
    if (!actorId && !ACTOR_ROLES_WITHOUT_ID.includes(actorRole)) return { code: 'invalid', field: 'actorId' };
    if (data.actorId != null && typeof data.actorId !== 'string') return { code: 'invalid', field: 'actorId' };
    if (!ORDER_EVENT_KINDS.includes(kind)) return { code: 'invalid', field: 'kind' };
    if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return { code: 'invalid', field: 'idempotencyKey' };
    }
    let claimedAt = null;
    if (data.claimedAt != null) {
      claimedAt = normalizeIsoTimestamp(data.claimedAt);
      if (!claimedAt) return { code: 'invalid', field: 'claimedAt' };
    }
    let correctsEventId = null;
    if (data.correctsEventId != null) {
      if (typeof data.correctsEventId !== 'string' || !data.correctsEventId.trim()) {
        return { code: 'invalid', field: 'correctsEventId' };
      }
      correctsEventId = data.correctsEventId.trim();
    }
    let note = null;
    if (data.note != null) {
      if (typeof data.note !== 'string' || data.note.length > MAX_EVENT_NOTE_LENGTH) {
        return { code: 'invalid', field: 'note' };
      }
      note = data.note;
    }
    let workerId = null;
    if (data.workerId != null) {
      if (typeof data.workerId !== 'string' || !data.workerId.trim()) return { code: 'invalid', field: 'workerId' };
      workerId = data.workerId.trim();
    }
    let eventDataJson;
    try {
      eventDataJson = encodeOrderEventData(data.data);
    } catch (error) {
      return { code: 'invalid', field: 'data' };
    }

    return transaction(() => {
      const candidate = { orderId, actorId, actorRole, kind, claimedAt, correctsEventId, note, idempotencyKey, workerId };
      const sameContent = (event) =>
        event.orderId === candidate.orderId &&
        event.actorId === candidate.actorId &&
        event.actorRole === candidate.actorRole &&
        event.kind === candidate.kind &&
        event.claimedAt === candidate.claimedAt &&
        event.correctsEventId === candidate.correctsEventId &&
        event.note === candidate.note &&
        event.workerId === candidate.workerId &&
        encodeOrderEventData(event.data) === eventDataJson;

      const existing = orderEventFromRow(selectOrderEventByKeyStmt.get(idempotencyKey));
      if (existing) return { code: sameContent(existing) ? 'duplicate' : 'key-conflict', event: existing };
      if (!selectOrder.get(orderId)) return { code: 'missing-order' };
      if (correctsEventId) {
        const corrected = selectOrderEventStmt.get(correctsEventId);
        if (!corrected || corrected.orderId !== orderId) return { code: 'missing-correction' };
      }

      // کلید تکراری بالاتر در همین تراکنش BEGIN IMMEDIATE بررسی شده؛ تریگر جلوی هر بازنویسی را هم می‌گیرد.
      const id = newRecordId('EVT-');
      const recordedAt = new Date().toISOString();
      insertOrderEventStmt.run(
        id, orderId, actorId, actorRole, kind, claimedAt, recordedAt, correctsEventId, note, idempotencyKey, workerId, eventDataJson
      );
      return { code: 'ok', event: orderEventFromRow(selectOrderEventStmt.get(id)) };
    });
  }

  function listOrderEvents(orderId) {
    if (typeof orderId !== 'string' || !orderId) return [];
    return listOrderEventsStmt.all(orderId).map(orderEventFromRow);
  }

  function newRecordId(prefix) {
    return prefix + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  }

  const insertSupport = database.prepare(
    'INSERT INTO support_messages (id, userId, role, subject, body, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const listSupportForUser = database.prepare(
    'SELECT * FROM support_messages WHERE userId = ? ORDER BY createdAt DESC'
  );
  const listSupportAll = database.prepare(
    'SELECT * FROM support_messages ORDER BY createdAt DESC'
  );
  const insertNotification = database.prepare(
    'INSERT INTO notifications (id, userId, orderId, kind, title, body, createdAt, readAt) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)'
  );
  const listNotificationsForUser = database.prepare(
    'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50'
  );
  const markNotificationReadStmt = database.prepare(
    'UPDATE notifications SET readAt = ? WHERE id = ? AND userId = ? AND readAt IS NULL'
  );
  const listWalletForUser = database.prepare(
    'SELECT * FROM wallet_transactions WHERE userId = ? ORDER BY createdAt DESC'
  );

  function addSupportMessage(userId, role, subject, body) {
    const row = {
      id: newRecordId('SUP-'),
      userId,
      role,
      subject,
      body,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    insertSupport.run(row.id, row.userId, row.role, row.subject, row.body, row.status, row.createdAt);
    return row;
  }

  function listSupportMessages(userId) {
    if (!userId) return [];
    return listSupportForUser.all(userId);
  }

  function listAllSupportMessages() {
    return listSupportAll.all();
  }

  function addNotification(userId, orderId, kind, title, body) {
    if (!userId) return null;
    const row = {
      id: newRecordId('NTF-'),
      userId,
      orderId: orderId || '',
      kind,
      title,
      body,
      createdAt: new Date().toISOString(),
    };
    insertNotification.run(row.id, row.userId, row.orderId, row.kind, row.title, row.body, row.createdAt);
    return row;
  }

  function listNotifications(userId) {
    return listNotificationsForUser.all(userId).map((row) => ({
      id: row.id,
      userId: row.userId,
      orderId: row.orderId || null,
      kind: row.kind,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      readAt: row.readAt,
    }));
  }

  function markNotificationRead(id, userId) {
    const result = markNotificationReadStmt.run(new Date().toISOString(), id, userId);
    return result.changes > 0;
  }

  function walletFor(userId) {
    const transactions = listWalletForUser.all(userId).map((row) => ({
      id: row.id,
      amount: row.amount,
      type: row.type,
      description: row.description,
      status: row.status,
      date: row.createdAt,
    }));
    const balance = transactions.reduce((sum, row) => {
      if (row.status !== 'SUCCESS') return sum;
      return row.type === 'WITHDRAW' ? sum - row.amount : sum + row.amount;
    }, 0);
    return { balance, transactions };
  }

  const LOYALTY_TIER_FROM_POINTS = {
    gray: { tier: 'NEW', title: 'عضو جدید' },
    silver: { tier: 'SILVER', title: 'نقره‌ای' },
    gold: { tier: 'GOLD', title: 'طلایی' },
    gold_plus: { tier: 'VIP', title: 'ویژه' },
  };

  function loyaltyFor(userId) {
    const completed = getOrders({ customerId: userId, status: 'COMPLETED' });
    const ratings = completed
      .map((order) => order.ratings && order.ratings.customerRating)
      .filter((value) => typeof value === 'number');
    const average = ratings.length
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : 0;
    const account = pointsApi.getUserPoints(userId);
    const legacy = (account && LOYALTY_TIER_FROM_POINTS[account.tierKey]) || LOYALTY_TIER_FROM_POINTS.gray;
    return {
      tier: legacy.tier,
      title: legacy.title,
      discountPercentage: 0,
      completedOrdersCount: completed.length,
      nextTierOrderTarget: 0,
      ratingAverage: Math.round(average * 10) / 10,
      ratingCount: ratings.length,
    };
  }

  function backupTo(dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const escaped = dest.replace(/\\/g, '/').replace(/'/g, "''");
    database.exec(`VACUUM INTO '${escaped}'`);
  }

  function migrateSensitiveFields(options = {}) {
    return transaction(() => {
      const converted = { nationalIds: 0, bankShebas: 0, otps: 0, sessions: 0 };
      const updateSensitive = database.prepare('UPDATE users SET nationalId = ?, bankSheba = ? WHERE id = ?');
      for (const user of database.prepare('SELECT id, nationalId, bankSheba FROM users').all()) {
        let nationalId = user.nationalId || '';
        let bankSheba = user.bankSheba || '';
        let changed = false;
        if (nationalId && !fieldCrypto.isEncrypted(nationalId)) {
          nationalId = fieldCrypto.encryptString(nationalId);
          converted.nationalIds += 1;
          changed = true;
        }
        if (bankSheba && !fieldCrypto.isEncrypted(bankSheba)) {
          bankSheba = fieldCrypto.encryptString(bankSheba);
          converted.bankShebas += 1;
          changed = true;
        }
        if (changed) updateSensitive.run(nationalId, bankSheba, user.id);
      }
      const updateOtpCode = database.prepare('UPDATE otp_store SET code = ? WHERE phone = ?');
      for (const otp of database.prepare('SELECT phone, code FROM otp_store').all()) {
        if (!fieldCrypto.isHashed(otp.code)) {
          updateOtpCode.run(fieldCrypto.hashSecret(otp.code), otp.phone);
          converted.otps += 1;
        }
      }
      for (const session of database.prepare('SELECT token, userId, role, expires FROM sessions').all()) {
        if (!fieldCrypto.isHashed(session.token)) {
          insertSession.run(
            fieldCrypto.hashSecret(session.token),
            session.userId,
            session.role,
            session.expires
          );
          deleteSessionStmt.run(session.token);
          converted.sessions += 1;
        }
      }
      if (typeof options.beforeCommit === 'function') options.beforeCommit();
      return converted;
    });
  }

  function close() {
    database.close();
  }

  const serviceAreas = createServiceAreas({ database, transaction });
  const workerServiceArea = createWorkerServiceArea({ database, transaction, areas: serviceAreas, getUser });
  const completionPolicy = createCompletionPolicy({ database, transaction });
  const commissionPolicy = createCommissionPolicy({ database, transaction });
  const workerWallet = createWorkerWallet({database,transaction,commissionPolicy});
  const paymentSettings = createPaymentSettings({
    database,
    transaction,
    providers: IMPLEMENTED_PAYMENT_PROVIDERS,
    wallet: workerWallet,
    getUser,
  });
  const pointsApi = createPointsService({ database, transaction, getUser, getOrder });
  // Start-of-work events remain separate from the order's primary status and pricing.
  const orderStart = createOrderStart({
    database, transaction, getOrder, appendOrderEvent, addNotification, rulesFor: pointsApi.rulesFor,
    readEventData: readOrderEventData,
  });

  const orderCompletion = createOrderCompletion({database,transaction,getOrder,updateOrder,policy:completionPolicy,appendOrderEvent,addNotification,
    onCompleted: (order,completion) => {
      workerWallet.chargeCompletion(order,completion);
      pointsApi.onOrderEvent({name: 'completed',order});
    }});

  return {
    ...orderCompletion,
    completionPolicy,
    ...orderStart,
    commissionPolicy,
    workerWallet,
    paymentSettings,
    serviceAreas,
    workerServiceArea,
    transaction,
    getUser,
    getUserByPhone,
    listUsers,
    createUser,
    updateUser,
    updateWorkerAddress,
    updateWorkerSkills,
    getOrder,
    getOrders,
    listOrders,
    createOrder,
    updateOrder,
    deleteOrder,
    getAddresses,
    updateAddresses,
    getOtp,
    saveOtp,
    deleteOtp,
    getSession,
    createSession,
    deleteSession,
    pruneSessions,
    counts,
    importSnapshot,
    backupTo,
    migrateSensitiveFields,
    recordAcceptance,
    clearAcceptanceForReturnToPending,
    findOrderByClientRequest,
    appendOrderEvent,
    listOrderEvents,
    tryAcceptOrder,
    tryCompleteOrder,
    tryCancelOrder,
    finalizeCancelRequest,
    finalizeDueCancelRequests,
    setCancelFault,
    relaxCancelFault,
    recordImmediateAdminCancel,
    createRating,
    addSupportMessage,
    listSupportMessages,
    listAllSupportMessages,
    addNotification,
    listNotifications,
    markNotificationRead,
    walletFor,
    loyaltyFor,
    publishRule: pointsApi.publishRule,
    rulesFor: pointsApi.rulesFor,
    listPointRules: pointsApi.listPointRules,
    postEntry: pointsApi.postEntry,
    postTransfer: pointsApi.postTransfer,
    reverseEntry: pointsApi.reverseEntry,
    recomputeTier: pointsApi.recomputeTier,
    workerTierProgress: pointsApi.workerTierProgress,
    effectiveTierRule: pointsApi.effectiveTierRule,
    effectiveEarnRule: pointsApi.effectiveEarnRule,
    workerRatingStats: pointsApi.workerRatingStats,
    quoteCancelPenalty: pointsApi.quoteCancelPenalty,
    onOrderEvent: pointsApi.onOrderEvent,
    ensureAccount: pointsApi.ensureAccount,
    getUserPoints: pointsApi.getUserPoints,
    listLedger: pointsApi.listLedger,
    close,
  };
}

module.exports = {
  createDataStore,
  ORDER_EVENT_KINDS,
  ORDER_EVENT_ACTOR_ROLES,
  CANCEL_REVIEW_MS,
  normalizeIsoTimestamp,
};
