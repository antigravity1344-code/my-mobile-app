const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const fieldCrypto = require('./fieldCrypto');

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
]);
const ORDER_EVENT_ACTOR_ROLES = Object.freeze(['customer', 'worker', 'admin', 'system']);
// مدیر فعلاً حساب کاربری و شناسه ندارد؛ برای مدیر و سیستم actorId می‌تواند خالی باشد.
const ACTOR_ROLES_WITHOUT_ID = Object.freeze(['admin', 'system']);
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_EVENT_NOTE_LENGTH = 500;
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
  ];
  for (const [name, definition] of addedOrderColumns) {
    if (!orderColumnNames.has(name)) {
      database.exec(`ALTER TABLE orders ADD COLUMN ${definition}`);
    }
  }

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
  const deleteOrderStmt = database.prepare('DELETE FROM orders WHERE id = ?');
  const setExpectedStartAtStmt = database.prepare('UPDATE orders SET expectedStartAt = ? WHERE id = ?');
  const recordAcceptanceStmt = database.prepare('UPDATE orders SET acceptedAt = ? WHERE id = ?');
  const countAcceptanceEventsStmt = database.prepare(
    "SELECT COUNT(*) AS n FROM order_events WHERE orderId = ? AND kind = 'ORDER_ACCEPTED'"
  );
  // تنها مسیر پاک کردن پذیرش: برگشت سفارش فعال به PENDING (پذیرش و متخصص اختصاص‌یافته با هم پاک می‌شوند).
  const clearAcceptanceStmt = database.prepare(`
    UPDATE orders SET acceptedAt = NULL, cleanerId = NULL, cleanerName = NULL, cleanerAvatar = NULL, cleanerPhone = NULL
    WHERE id = ?
  `);
  const insertOrderEventStmt = database.prepare(`
    INSERT INTO order_events (
      id, orderId, actorId, actorRole, kind, claimedAt, recordedAt, correctsEventId, note, idempotencyKey
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        idempotencyKey: 'accept:' + orderId + ':' + acceptanceNumber,
      });
      if (event.code !== 'ok') throw new Error('ACCEPTANCE_EVENT_NOT_RECORDED');
      return acceptedAt;
    });
  }

  /**
   * برگشت سفارش فعال به PENDING (تصمیم صاحب محصول، D-50): acceptedAt و متخصص اختصاص‌یافته
   * در یک دستور پاک می‌شوند. این تنها مسیر پاک کردن acceptedAt است و نوشتن آن فقط در recordAcceptance است.
   * تاریخچه پذیرش‌ها در order_events می‌ماند و رویدادی اضافه نمی‌شود. سفارش باید از قبل PENDING باشد.
   */
  function clearAcceptanceForReturnToPending(orderId) {
    return transaction(() => {
      const row = selectOrder.get(orderId);
      if (!row) throw new Error('ORDER_NOT_FOUND');
      if (row.status !== 'PENDING') throw new Error('ORDER_NOT_PENDING');
      clearAcceptanceStmt.run(orderId);
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

  function deleteOrder(id) {
    return deleteOrderStmt.run(id).changes > 0;
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
    if (!token) return null;
    const row = selectSession.get(fieldCrypto.hashSecret(token));
    if (!row) return null;
    return { userId: row.userId, role: row.role, expires: row.expires };
  }

  function createSession(token, session) {
    insertSession.run(fieldCrypto.hashSecret(token), session.userId, session.role, session.expires);
  }

  function deleteSession(token) {
    if (!token) return false;
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
      order.status = 'ACCEPTED';
      order.cleanerId = cleaner.id;
      order.cleanerName = cleaner.name || '';
      order.cleanerAvatar = cleaner.avatar || '';
      order.cleanerPhone = cleaner.phone || '';
      updateOrder(order);
      recordAcceptance(order.id, { actorRole: 'worker', actorId: cleaner.id });
      addNotification(order.customerId, order.id, 'ORDER_ACCEPTED', 'سفارش پذیرفته شد', 'سفارش ' + order.id + ' توسط متخصص پذیرفته شد.');
      addNotification(cleaner.id, order.id, 'ORDER_ACCEPTED', 'پذیرش سفارش', 'سفارش ' + order.id + ' را پذیرفتید.');
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function tryCompleteOrder(orderId, cleaner) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.status !== 'ACCEPTED') return { code: 'bad-status' };
      if (order.cleanerId !== cleaner.id) return { code: 'forbidden' };
      order.status = 'COMPLETED';
      order.completedAt = new Date().toISOString();
      order.cleanerName = cleaner.name || '';
      order.cleanerAvatar = cleaner.avatar || '';
      order.cleanerPhone = cleaner.phone || '';
      updateOrder(order);
      addNotification(order.customerId, order.id, 'ORDER_COMPLETED', 'سفارش تکمیل شد', 'سفارش ' + order.id + ' تکمیل شد.');
      addNotification(cleaner.id, order.id, 'ORDER_COMPLETED', 'تکمیل سفارش', 'سفارش ' + order.id + ' را تکمیل کردید.');
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function tryCancelOrder(orderId, customerId, allowedStatuses, reason) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.customerId !== customerId) return { code: 'forbidden' };
      if (!allowedStatuses.includes(order.status)) return { code: 'bad-status' };
      order.status = 'CANCELLED';
      order.cancelledAt = new Date().toISOString();
      order.cancelledBy = customerId;
      order.cancelReason = reason;
      updateOrder(order);
      addNotification(order.customerId, order.id, 'ORDER_CANCELLED', 'سفارش لغو شد', 'سفارش ' + order.id + ' لغو شد.');
      if (order.cleanerId) {
        addNotification(order.cleanerId, order.id, 'ORDER_CANCELLED', 'سفارش لغو شد', 'مشتری سفارش ' + order.id + ' را لغو کرد.');
      }
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

    return transaction(() => {
      const candidate = { orderId, actorId, actorRole, kind, claimedAt, correctsEventId, note, idempotencyKey };
      const sameContent = (event) =>
        event.orderId === candidate.orderId &&
        event.actorId === candidate.actorId &&
        event.actorRole === candidate.actorRole &&
        event.kind === candidate.kind &&
        event.claimedAt === candidate.claimedAt &&
        event.correctsEventId === candidate.correctsEventId &&
        event.note === candidate.note;

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
        id, orderId, actorId, actorRole, kind, claimedAt, recordedAt, correctsEventId, note, idempotencyKey
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

  function loyaltyFor(userId) {
    const completed = getOrders({ customerId: userId, status: 'COMPLETED' });
    const ratings = completed
      .map((order) => order.ratings && order.ratings.customerRating)
      .filter((value) => typeof value === 'number');
    const average = ratings.length
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : 0;
    const count = completed.length;
    let tier = 'NEW';
    if (count >= 20 && average >= 4.7) tier = 'VIP';
    else if (count >= 10 && average >= 4.5) tier = 'GOLD';
    else if (count >= 3 && average >= 4) tier = 'SILVER';
    const titles = { NEW: 'عضو جدید', SILVER: 'نقره‌ای', GOLD: 'طلایی', VIP: 'ویژه' };
    const discounts = { NEW: 0, SILVER: 3, GOLD: 5, VIP: 8 };
    const nextTarget = { NEW: 3, SILVER: 10, GOLD: 20, VIP: 20 };
    return {
      tier,
      title: titles[tier],
      discountPercentage: discounts[tier],
      completedOrdersCount: count,
      nextTierOrderTarget: nextTarget[tier],
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

  return {
    transaction,
    getUser,
    getUserByPhone,
    listUsers,
    createUser,
    updateUser,
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
    appendOrderEvent,
    listOrderEvents,
    tryAcceptOrder,
    tryCompleteOrder,
    tryCancelOrder,
    createRating,
    addSupportMessage,
    listSupportMessages,
    listAllSupportMessages,
    addNotification,
    listNotifications,
    markNotificationRead,
    walletFor,
    loyaltyFor,
    close,
  };
}

module.exports = { createDataStore, ORDER_EVENT_KINDS, ORDER_EVENT_ACTOR_ROLES, normalizeIsoTimestamp };
