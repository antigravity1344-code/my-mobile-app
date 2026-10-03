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
  ];
  for (const [name, definition] of addedOrderColumns) {
    if (!orderColumnNames.has(name)) {
      database.exec(`ALTER TABLE orders ADD COLUMN ${definition}`);
    }
  }

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
    const seq = nextOrderSeq.get().seq;
    insertOrder.run(...orderParams(order, seq));
    return getOrder(order.id);
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

module.exports = { createDataStore };
