/**
 * هسته امتیاز (مرحله ۲ معماری، D-03 / D-04 / D-30).
 * هیچ مبلغ، جریمه، آستانه یا تعداد فرصتی در این فایل ثابت نشده است.
 * اثر امتیازی فقط وقتی رخ می‌دهد که قانون فعالِ همان کلید در point_rules منتشر شده باشد.
 * سطح‌بندی جریمه بر اساس زمان لغو نهایی نشده و اینجا اعمال نمی‌شود؛ اگر قانون cancel.penalty منتشر شود فقط یک مقدار amount خوانده می‌شود.
 */
const crypto = require('crypto');

const LEDGER_UNITS = new Set(['points', 'free_cancel']);
const ACTORS = new Set(['system', 'admin']);
const TIER_RANKS = Object.freeze({ gray: 0, silver: 1, gold: 2, gold_plus: 3 });
const ACTIVE_ORDER_STATUSES = Object.freeze(['ACCEPTED', 'IN_PROGRESS', 'CONFIRMED', 'ASSIGNED']);
const RULE_KEY_PATTERN = /^[a-z][A-Za-z0-9.]{0,63}$/;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_KEY_LENGTH = 128;
const MAX_NOTE_LENGTH = 500;
const MAX_RULE_JSON = 4000;

function createPointsService({ database, transaction, getUser, getOrder }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS point_rules (
      id TEXT PRIMARY KEY,
      ruleKey TEXT NOT NULL,
      version INTEGER NOT NULL,
      valueJson TEXT NOT NULL,
      active INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      actor TEXT NOT NULL,
      UNIQUE(ruleKey, version)
    );
    CREATE INDEX IF NOT EXISTS idx_point_rules_key ON point_rules(ruleKey, version);
    CREATE TRIGGER IF NOT EXISTS point_rules_no_update BEFORE UPDATE ON point_rules
    BEGIN
      SELECT RAISE(ABORT, 'point_rules is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS point_rules_no_delete BEFORE DELETE ON point_rules
    BEGIN
      SELECT RAISE(ABORT, 'point_rules is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS point_rules_no_overwrite BEFORE INSERT ON point_rules
    WHEN EXISTS (SELECT 1 FROM point_rules WHERE id = NEW.id)
      OR EXISTS (SELECT 1 FROM point_rules WHERE ruleKey = NEW.ruleKey AND version = NEW.version)
    BEGIN
      SELECT RAISE(ABORT, 'point_rules is append-only');
    END;

    CREATE TABLE IF NOT EXISTS points_ledger (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      role TEXT NOT NULL,
      unit TEXT NOT NULL CHECK (unit IN ('points', 'free_cancel')),
      delta INTEGER NOT NULL CHECK (delta != 0),
      balanceBefore INTEGER NOT NULL,
      balanceAfter INTEGER NOT NULL,
      reasonCode TEXT NOT NULL,
      orderId TEXT,
      ruleKey TEXT NOT NULL,
      ruleVersion INTEGER NOT NULL,
      idempotencyKey TEXT NOT NULL UNIQUE,
      transferGroupId TEXT,
      reversalOf TEXT,
      actor TEXT NOT NULL CHECK (actor IN ('system', 'admin')),
      createdAt TEXT NOT NULL,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON points_ledger(userId, createdAt);
    CREATE TRIGGER IF NOT EXISTS points_ledger_no_update BEFORE UPDATE ON points_ledger
    BEGIN
      SELECT RAISE(ABORT, 'points_ledger is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS points_ledger_no_delete BEFORE DELETE ON points_ledger
    BEGIN
      SELECT RAISE(ABORT, 'points_ledger is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS points_ledger_no_overwrite BEFORE INSERT ON points_ledger
    WHEN EXISTS (SELECT 1 FROM points_ledger WHERE id = NEW.id)
      OR EXISTS (SELECT 1 FROM points_ledger WHERE idempotencyKey = NEW.idempotencyKey)
    BEGIN
      SELECT RAISE(ABORT, 'points_ledger is append-only');
    END;

    CREATE TABLE IF NOT EXISTS user_points (
      userId TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      balance INTEGER NOT NULL,
      freeCancelsRemaining INTEGER NOT NULL,
      tierKey TEXT NOT NULL,
      tierSince TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  const insertRule = database.prepare(`
    INSERT INTO point_rules (id, ruleKey, version, valueJson, active, createdAt, actor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const selectLatestRule = database.prepare(`
    SELECT * FROM point_rules WHERE ruleKey = ? ORDER BY version DESC LIMIT 1
  `);
  const selectRuleVersion = database.prepare(`
    SELECT * FROM point_rules WHERE ruleKey = ? AND version = ?
  `);
  const nextRuleVersion = database.prepare(`
    SELECT COALESCE(MAX(version), 0) + 1 AS version FROM point_rules WHERE ruleKey = ?
  `);
  const listRules = database.prepare('SELECT * FROM point_rules ORDER BY ruleKey ASC, version ASC');

  const insertLedger = database.prepare(`
    INSERT INTO points_ledger (
      id, userId, role, unit, delta, balanceBefore, balanceAfter, reasonCode, orderId,
      ruleKey, ruleVersion, idempotencyKey, transferGroupId, reversalOf, actor, createdAt, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectLedgerByKey = database.prepare('SELECT * FROM points_ledger WHERE idempotencyKey = ?');
  const selectLedgerById = database.prepare('SELECT * FROM points_ledger WHERE id = ?');
  const listLedgerForUser = database.prepare(
    'SELECT * FROM points_ledger WHERE userId = ? ORDER BY createdAt ASC, rowid ASC'
  );
  const listLedgerAll = database.prepare('SELECT * FROM points_ledger ORDER BY createdAt ASC, rowid ASC');

  const insertAccount = database.prepare(`
    INSERT INTO user_points (userId, role, balance, freeCancelsRemaining, tierKey, tierSince, updatedAt)
    VALUES (?, ?, 0, 0, 'gray', ?, ?)
    ON CONFLICT(userId) DO NOTHING
  `);
  const selectAccount = database.prepare('SELECT * FROM user_points WHERE userId = ?');
  const updateBalances = database.prepare(`
    UPDATE user_points SET balance = ?, freeCancelsRemaining = ?, updatedAt = ? WHERE userId = ?
  `);
  const updateTier = database.prepare(`
    UPDATE user_points SET tierKey = ?, tierSince = ?, updatedAt = ? WHERE userId = ?
  `);
  const countCustomerCompleted = database.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE customerId = ? AND status = 'COMPLETED'"
  );
  const countWorkerCompleted = database.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE cleanerId = ? AND status = 'COMPLETED'"
  );

  function newId(prefix) {
    return prefix + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function ruleFromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      ruleKey: row.ruleKey,
      version: row.version,
      value: JSON.parse(row.valueJson),
      active: row.active === 1,
      createdAt: row.createdAt,
      actor: row.actor,
    };
  }

  function ledgerFromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      role: row.role,
      unit: row.unit,
      delta: row.delta,
      balanceBefore: row.balanceBefore,
      balanceAfter: row.balanceAfter,
      reasonCode: row.reasonCode,
      orderId: row.orderId == null ? null : row.orderId,
      ruleKey: row.ruleKey,
      ruleVersion: row.ruleVersion,
      idempotencyKey: row.idempotencyKey,
      transferGroupId: row.transferGroupId == null ? null : row.transferGroupId,
      reversalOf: row.reversalOf == null ? null : row.reversalOf,
      actor: row.actor,
      createdAt: row.createdAt,
      note: row.note == null ? null : row.note,
    };
  }

  function accountFromRow(row) {
    if (!row) return null;
    return {
      userId: row.userId,
      role: row.role,
      balance: row.balance,
      freeCancelsRemaining: row.freeCancelsRemaining,
      tierKey: row.tierKey,
      tierSince: row.tierSince,
      updatedAt: row.updatedAt,
    };
  }

  function rulesFor(ruleKey) {
    if (typeof ruleKey !== 'string' || !RULE_KEY_PATTERN.test(ruleKey)) return null;
    return ruleFromRow(selectLatestRule.get(ruleKey));
  }

  function listPointRules() {
    return listRules.all().map(ruleFromRow);
  }

  function getUserPoints(userId) {
    if (typeof userId !== 'string' || !userId) return null;
    return accountFromRow(selectAccount.get(userId));
  }

  function listLedger(userId) {
    const rows = userId ? listLedgerForUser.all(userId) : listLedgerAll.all();
    return rows.map(ledgerFromRow);
  }

  function publishRule(input) {
    const data = input && typeof input === 'object' ? input : {};
    const ruleKey = typeof data.ruleKey === 'string' ? data.ruleKey.trim() : '';
    if (!RULE_KEY_PATTERN.test(ruleKey)) return { code: 'invalid', field: 'ruleKey' };
    if (!isPlainObject(data.value)) return { code: 'invalid', field: 'value' };
    let encoded;
    try {
      encoded = JSON.stringify(data.value);
    } catch (error) {
      return { code: 'invalid', field: 'value' };
    }
    if (!encoded || encoded === '{}' || encoded.length > MAX_RULE_JSON) return { code: 'invalid', field: 'value' };
    if (!valueMatchesKey(ruleKey, data.value)) return { code: 'invalid', field: 'value' };
    const active = data.active === undefined ? true : data.active;
    if (typeof active !== 'boolean') return { code: 'invalid', field: 'active' };
    if (!ACTORS.has(data.actor)) return { code: 'invalid', field: 'actor' };

    return transaction(() => {
      const version = nextRuleVersion.get(ruleKey).version;
      const createdAt = new Date().toISOString();
      const id = newId('RUL-');
      insertRule.run(id, ruleKey, version, encoded, active ? 1 : 0, createdAt, data.actor);
      return { code: 'ok', rule: ruleFromRow(selectRuleVersion.get(ruleKey, version)) };
    });
  }

  function knownRule(ruleKey, ruleVersion) {
    if (!RULE_KEY_PATTERN.test(ruleKey) || !Number.isInteger(ruleVersion) || ruleVersion < 1) return null;
    return ruleFromRow(selectRuleVersion.get(ruleKey, ruleVersion));
  }

  function ensureRow(user) {
    const now = new Date().toISOString();
    insertAccount.run(user.id, user.role, now, now);
  }

  function sameEntry(entry, candidate) {
    return (
      entry.userId === candidate.userId &&
      entry.role === candidate.role &&
      entry.unit === candidate.unit &&
      entry.delta === candidate.delta &&
      entry.reasonCode === candidate.reasonCode &&
      entry.orderId === candidate.orderId &&
      entry.ruleKey === candidate.ruleKey &&
      entry.ruleVersion === candidate.ruleVersion &&
      entry.transferGroupId === candidate.transferGroupId &&
      entry.reversalOf === candidate.reversalOf &&
      entry.actor === candidate.actor &&
      entry.note === candidate.note
    );
  }

  function resultFromExisting(existing, candidate) {
    const entry = ledgerFromRow(existing);
    if (!sameEntry(entry, candidate)) return { code: 'key-conflict', entry };
    return { code: 'duplicate', entry, account: getUserPoints(entry.userId) };
  }

  function writeEntry(input) {
    const user = getUser(input.userId);
    if (!user) return { code: 'missing-user' };
    if (input.role !== user.role) return { code: 'role-mismatch' };
    if (!LEDGER_UNITS.has(input.unit)) return { code: 'invalid', field: 'unit' };
    if (!Number.isInteger(input.delta) || input.delta === 0) return { code: 'invalid', field: 'delta' };
    if (typeof input.reasonCode !== 'string' || !REASON_CODE_PATTERN.test(input.reasonCode)) {
      return { code: 'invalid', field: 'reasonCode' };
    }
    const orderId = input.orderId == null || input.orderId === '' ? null : input.orderId;
    if (orderId != null && (typeof orderId !== 'string' || orderId.length > MAX_KEY_LENGTH)) {
      return { code: 'invalid', field: 'orderId' };
    }
    const rule = knownRule(input.ruleKey, input.ruleVersion);
    if (!rule) return { code: 'invalid', field: 'ruleVersion' };
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!idempotencyKey || idempotencyKey.length > MAX_KEY_LENGTH) return { code: 'invalid', field: 'idempotencyKey' };
    const transferGroupId =
      input.transferGroupId == null || input.transferGroupId === '' ? null : input.transferGroupId;
    if (transferGroupId != null && (typeof transferGroupId !== 'string' || transferGroupId.length > MAX_KEY_LENGTH)) {
      return { code: 'invalid', field: 'transferGroupId' };
    }
    const reversalOf = input.reversalOf == null || input.reversalOf === '' ? null : input.reversalOf;
    if (reversalOf != null && (typeof reversalOf !== 'string' || !selectLedgerById.get(reversalOf))) {
      return { code: 'invalid', field: 'reversalOf' };
    }
    if (!ACTORS.has(input.actor)) return { code: 'invalid', field: 'actor' };
    let note = null;
    if (input.note != null) {
      if (typeof input.note !== 'string' || input.note.length > MAX_NOTE_LENGTH) return { code: 'invalid', field: 'note' };
      note = input.note;
    }

    const candidate = {
      userId: user.id,
      role: user.role,
      unit: input.unit,
      delta: input.delta,
      reasonCode: input.reasonCode,
      orderId,
      ruleKey: input.ruleKey,
      ruleVersion: input.ruleVersion,
      transferGroupId,
      reversalOf,
      actor: input.actor,
      note,
    };

    return transaction(() => {
      ensureRow(user);
      if (!input.skipGrant && user.role === 'CUSTOMER') grantInitial(user);

      const existing = selectLedgerByKey.get(idempotencyKey);
      if (existing) return resultFromExisting(existing, candidate);

      const account = getUserPoints(user.id);
      const current = input.unit === 'points' ? account.balance : account.freeCancelsRemaining;
      const next = current + input.delta;
      if (next < 0) return { code: 'insufficient', balance: current };

      const createdAt = new Date().toISOString();
      const id = newId('PTS-');
      const balanceBefore = current;
      const balanceAfter = next;
      try {
        insertLedger.run(
          id,
          user.id,
          user.role,
          input.unit,
          input.delta,
          balanceBefore,
          balanceAfter,
          input.reasonCode,
          orderId,
          input.ruleKey,
          input.ruleVersion,
          idempotencyKey,
          transferGroupId,
          reversalOf,
          input.actor,
          createdAt,
          note
        );
      } catch (error) {
        const message = String(error && error.message);
        if (!message.includes('append-only') && !message.includes('UNIQUE')) throw error;
        const raced = selectLedgerByKey.get(idempotencyKey);
        if (!raced) throw error;
        return resultFromExisting(raced, candidate);
      }

      const balance = input.unit === 'points' ? balanceAfter : account.balance;
      const freeCancels = input.unit === 'free_cancel' ? balanceAfter : account.freeCancelsRemaining;
      updateBalances.run(balance, freeCancels, createdAt, user.id);
      if (input.unit === 'points') recomputeTier(user.id);
      return { code: 'ok', entry: ledgerFromRow(selectLedgerById.get(id)), account: getUserPoints(user.id) };
    });
  }

  function parseAllowance(value) {
    if (!isPlainObject(value)) return null;
    const allowed = new Set(['initial', 'earnEveryCompleted', 'earnAmount', 'cap']);
    if (Object.keys(value).some((key) => !allowed.has(key))) return null;
    const read = (key, minimum) => {
      if (value[key] == null) return null;
      if (!Number.isInteger(value[key]) || value[key] < minimum) return undefined;
      return value[key];
    };
    const initial = read('initial', 0);
    const earnEveryCompleted = read('earnEveryCompleted', 1);
    const earnAmount = read('earnAmount', 0);
    const cap = read('cap', 0);
    if ([initial, earnEveryCompleted, earnAmount, cap].includes(undefined)) return null;
    return { initial, earnEveryCompleted, earnAmount, cap };
  }

  function grantInitial(user) {
    const rule = rulesFor('cancel.freeAllowance');
    if (!rule || !rule.active) return null;
    const parsed = parseAllowance(rule.value);
    if (!parsed || parsed.initial == null || parsed.initial === 0) return null;
    const amount = parsed.cap == null ? parsed.initial : Math.min(parsed.initial, parsed.cap);
    if (amount <= 0) return null;
    return writeEntry({
      userId: user.id,
      role: user.role,
      unit: 'free_cancel',
      delta: amount,
      reasonCode: 'free_cancel_grant',
      ruleKey: rule.ruleKey,
      ruleVersion: rule.version,
      idempotencyKey: 'free_cancel:grant:' + user.id,
      actor: 'system',
      skipGrant: true,
    });
  }

  function postEntry(input) {
    const data = input && typeof input === 'object' ? input : {};
    return writeEntry(data);
  }

  function ensureAccount(userId) {
    return transaction(() => {
      const user = getUser(userId);
      if (!user) return { code: 'missing-user' };
      ensureRow(user);
      if (user.role === 'CUSTOMER') grantInitial(user);
      return { code: 'ok', account: getUserPoints(userId) };
    });
  }

  function countCompleted(userId, role) {
    const stmt = role === 'WORKER' ? countWorkerCompleted : countCustomerCompleted;
    return stmt.get(userId).n;
  }

  function parseTierRule(value) {
    if (!isPlainObject(value) || Object.keys(value).length !== 1 || !Array.isArray(value.levels)) return null;
    if (value.levels.length === 0) return null;
    const levels = [];
    for (const level of value.levels) {
      if (!isPlainObject(level)) return null;
      if (Object.keys(level).some((key) => !['tierKey', 'minPoints', 'minCompleted'].includes(key))) return null;
      if (!Object.prototype.hasOwnProperty.call(TIER_RANKS, level.tierKey)) return null;
      if (level.tierKey === 'gray') {
        levels.push({ tierKey: 'gray', minPoints: 0, minCompleted: 0, rank: 0 });
        continue;
      }
      if (!Number.isInteger(level.minPoints) || level.minPoints < 0) return null;
      if (!Number.isInteger(level.minCompleted) || level.minCompleted < 0) return null;
      levels.push({
        tierKey: level.tierKey,
        minPoints: level.minPoints,
        minCompleted: level.minCompleted,
        rank: TIER_RANKS[level.tierKey],
      });
    }
    return levels;
  }

  function recomputeTier(userId) {
    return transaction(() => {
      const user = getUser(userId);
      if (!user) return { code: 'missing-user' };
      const account = getUserPoints(userId);
      if (!account) return { code: 'no-account' };
      const ruleKey = user.role === 'WORKER' ? 'tiers.worker' : 'tiers.customer';
      const rule = rulesFor(ruleKey);
      if (!rule || !rule.active) return { code: 'ok', tierKey: account.tierKey, changed: false };
      const levels = parseTierRule(rule.value);
      if (!levels) return { code: 'rule-unsupported', tierKey: account.tierKey, changed: false };
      const completed = countCompleted(userId, user.role);
      let best = { tierKey: 'gray', rank: 0 };
      for (const level of levels) {
        if (account.balance >= level.minPoints && completed >= level.minCompleted && level.rank >= best.rank) {
          best = level;
        }
      }
      const currentRank = Object.prototype.hasOwnProperty.call(TIER_RANKS, account.tierKey)
        ? TIER_RANKS[account.tierKey]
        : 0;
      if (best.rank <= currentRank) return { code: 'ok', tierKey: account.tierKey, changed: false };
      const now = new Date().toISOString();
      updateTier.run(best.tierKey, now, now, userId);
      return { code: 'ok', tierKey: best.tierKey, changed: true, ruleKey, ruleVersion: rule.version };
    });
  }

  function isPenaltyValue(value) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length === 1 && keys[0] === 'amount' && Number.isInteger(value.amount) && value.amount >= 0;
  }

  function valueMatchesKey(ruleKey, value) {
    if (ruleKey === 'cancel.penalty') return isPenaltyValue(value);
    if (ruleKey === 'cancel.freeAllowance') return parseAllowance(value) != null;
    if (ruleKey === 'earn.orderCompleted') return isEarnValue(value);
    if (ruleKey === 'tiers.customer' || ruleKey === 'tiers.worker') return parseTierRule(value) != null;
    return true;
  }

  function isEarnValue(value) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    const allowed = new Set(['customerAmount', 'workerAmount']);
    if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return false;
    return keys.every((key) => Number.isInteger(value[key]) && value[key] >= 0);
  }

  function cancelPhase(order) {
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return 'closed';
    if (order.status === 'PENDING') return 'before_accept';
    if (ACTIVE_ORDER_STATUSES.includes(order.status) || order.acceptedAt) return 'after_accept';
    return 'closed';
  }

  function prospectiveFreeCancels() {
    const rule = rulesFor('cancel.freeAllowance');
    if (!rule || !rule.active) return { remaining: 0, rule: null };
    const parsed = parseAllowance(rule.value);
    if (!parsed || parsed.initial == null || parsed.initial === 0) return { remaining: 0, rule };
    const remaining = parsed.cap == null ? parsed.initial : Math.min(parsed.initial, parsed.cap);
    return { remaining, rule };
  }

  function quoteCancelPenalty(input) {
    const data = input && typeof input === 'object' ? input : {};
    const order = typeof data.orderId === 'string' ? getOrder(data.orderId) : null;
    if (!order) return { code: 'missing' };
    if (!data.userId || order.customerId !== data.userId) return { code: 'forbidden' };
    const phase = cancelPhase(order);
    if (phase === 'closed') return { code: 'bad-status' };
    if (phase === 'before_accept') {
      return {
        code: 'ok',
        phase,
        quotedPoints: 0,
        deductiblePoints: 0,
        usesFreeCancel: false,
        reasonCode: 'cancel_before_accept',
        ruleKey: null,
        ruleVersion: null,
        locks: false,
      };
    }

    const account = getUserPoints(order.customerId);
    const allowance = rulesFor('cancel.freeAllowance');
    const remaining = account
      ? account.freeCancelsRemaining
      : prospectiveFreeCancels().remaining;
    if (remaining > 0) {
      return {
        code: 'ok',
        phase,
        quotedPoints: 0,
        deductiblePoints: 0,
        usesFreeCancel: true,
        freeCancelsRemaining: remaining,
        freeCancelsAfter: remaining - 1,
        reasonCode: 'free_cancel',
        ruleKey: allowance && allowance.active ? allowance.ruleKey : null,
        ruleVersion: allowance && allowance.active ? allowance.version : null,
        locks: false,
      };
    }

    const penalty = rulesFor('cancel.penalty');
    if (!penalty || !penalty.active || !isPenaltyValue(penalty.value)) {
      return { code: 'rule-missing', phase, locks: false };
    }
    const balance = account ? account.balance : 0;
    return {
      code: 'ok',
      phase,
      quotedPoints: penalty.value.amount,
      deductiblePoints: Math.min(penalty.value.amount, Math.max(0, balance)),
      usesFreeCancel: false,
      balance,
      reasonCode: 'cancel_penalty',
      ruleKey: penalty.ruleKey,
      ruleVersion: penalty.version,
      locks: false,
    };
  }

  function postTransfer(input) {
    const data = input && typeof input === 'object' ? input : {};
    if (!Number.isInteger(data.points) || data.points < 0) return { code: 'invalid', field: 'points' };
    if (data.points === 0) return { code: 'nothing', transferred: 0 };
    if (!data.transferGroupId || !data.debitKey || !data.creditKey || data.debitKey === data.creditKey) {
      return { code: 'invalid', field: 'idempotencyKey' };
    }
    if (data.fromUserId === data.toUserId) return { code: 'invalid', field: 'userId' };

    return transaction(() => {
      const debitExisting = selectLedgerByKey.get(data.debitKey);
      const creditExisting = selectLedgerByKey.get(data.creditKey);
      if (debitExisting || creditExisting) {
        if (
          debitExisting &&
          creditExisting &&
          debitExisting.transferGroupId === data.transferGroupId &&
          creditExisting.transferGroupId === data.transferGroupId &&
          debitExisting.delta < 0 &&
          creditExisting.delta === -debitExisting.delta &&
          debitExisting.userId === data.fromUserId &&
          creditExisting.userId === data.toUserId
        ) {
          return { code: 'duplicate', transferred: creditExisting.delta };
        }
        return { code: 'key-conflict' };
      }

      const fromUser = getUser(data.fromUserId);
      const toUser = getUser(data.toUserId);
      if (!fromUser || !toUser) return { code: 'missing-user' };
      if (fromUser.role !== data.fromRole || toUser.role !== data.toRole) return { code: 'role-mismatch' };
      ensureRow(fromUser);
      if (fromUser.role === 'CUSTOMER') grantInitial(fromUser);
      ensureRow(toUser);
      const available = getUserPoints(fromUser.id).balance;
      const transferred = Math.min(data.points, available);
      if (transferred === 0) return { code: 'nothing', transferred: 0 };

      const shared = {
        unit: 'points',
        orderId: data.orderId || null,
        ruleKey: data.ruleKey,
        ruleVersion: data.ruleVersion,
        transferGroupId: data.transferGroupId,
        actor: data.actor,
        skipGrant: true,
      };
      const debit = writeEntry({
        ...shared,
        userId: fromUser.id,
        role: fromUser.role,
        delta: -transferred,
        reasonCode: data.debitReasonCode,
        idempotencyKey: data.debitKey,
      });
      if (debit.code !== 'ok') return debit;
      const credit = writeEntry({
        ...shared,
        userId: toUser.id,
        role: toUser.role,
        delta: transferred,
        reasonCode: data.creditReasonCode,
        idempotencyKey: data.creditKey,
      });
      if (credit.code !== 'ok') throw new Error('TRANSFER_CREDIT_FAILED');
      return { code: 'ok', transferred };
    });
  }

  function reverseEntry(input) {
    const data = input && typeof input === 'object' ? input : {};
    return transaction(() => {
      const original = ledgerFromRow(selectLedgerById.get(data.entryId));
      if (!original) return { code: 'missing' };
      const idempotencyKey = typeof data.idempotencyKey === 'string' ? data.idempotencyKey.trim() : '';
      const existing = idempotencyKey ? selectLedgerByKey.get(idempotencyKey) : null;
      if (existing) {
        const entry = ledgerFromRow(existing);
        if (entry.reversalOf === original.id && entry.delta === -original.delta && entry.userId === original.userId) {
          return { code: 'duplicate', entry, account: getUserPoints(entry.userId) };
        }
        return { code: 'key-conflict', entry };
      }
      return writeEntry({
        userId: original.userId,
        role: original.role,
        unit: original.unit,
        delta: -original.delta,
        reasonCode: data.reasonCode || 'reversal',
        orderId: original.orderId,
        ruleKey: original.ruleKey,
        ruleVersion: original.ruleVersion,
        idempotencyKey,
        reversalOf: original.id,
        actor: data.actor,
        skipGrant: true,
      });
    });
  }

  function earnFreeCancel(order) {
    const rule = rulesFor('cancel.freeAllowance');
    if (!rule || !rule.active || !order.customerId) return null;
    const parsed = parseAllowance(rule.value);
    if (!parsed) return { code: 'rule-unsupported' };
    const ensured = ensureAccount(order.customerId);
    if (ensured.code !== 'ok') return ensured;
    if (parsed.earnEveryCompleted == null || parsed.earnAmount == null || parsed.cap == null || parsed.earnAmount === 0) {
      return null;
    }
    const completed = countCompleted(order.customerId, 'CUSTOMER');
    if (completed <= 0 || completed % parsed.earnEveryCompleted !== 0) return null;
    const account = getUserPoints(order.customerId);
    const room = parsed.cap - account.freeCancelsRemaining;
    if (room <= 0) return { code: 'capped' };
    return writeEntry({
      userId: order.customerId,
      role: 'CUSTOMER',
      unit: 'free_cancel',
      delta: Math.min(parsed.earnAmount, room),
      reasonCode: 'free_cancel_earn',
      orderId: order.id,
      ruleKey: rule.ruleKey,
      ruleVersion: rule.version,
      idempotencyKey: 'free_cancel:earn:' + order.id,
      actor: 'system',
      skipGrant: true,
    });
  }

  function onOrderEvent(event) {
    if (!event || (event.name !== 'completed' && event.name !== 'rated')) return { code: 'invalid' };
    return transaction(() => {
      if (event.name === 'rated') return { code: 'ok', effects: [] };
      const order = event.order;
      if (!order || typeof order.id !== 'string' || !order.id) return { code: 'invalid' };
      const effects = [];
      const earn = rulesFor('earn.orderCompleted');
      if (earn && earn.active && isEarnValue(earn.value)) {
        if (order.customerId && earn.value.customerAmount > 0) {
          effects.push(
            postEntry({
              userId: order.customerId,
              role: 'CUSTOMER',
              unit: 'points',
              delta: earn.value.customerAmount,
              reasonCode: 'order_completed',
              orderId: order.id,
              ruleKey: earn.ruleKey,
              ruleVersion: earn.version,
              idempotencyKey: 'earn:completed:' + order.id + ':customer',
              actor: 'system',
            })
          );
        }
        if (order.cleanerId && earn.value.workerAmount > 0) {
          effects.push(
            postEntry({
              userId: order.cleanerId,
              role: 'WORKER',
              unit: 'points',
              delta: earn.value.workerAmount,
              reasonCode: 'order_completed',
              orderId: order.id,
              ruleKey: earn.ruleKey,
              ruleVersion: earn.version,
              idempotencyKey: 'earn:completed:' + order.id + ':worker',
              actor: 'system',
            })
          );
        }
      } else if (earn && earn.active) {
        effects.push({ code: 'rule-unsupported', ruleKey: earn.ruleKey });
      }
      const free = earnFreeCancel(order);
      if (free) effects.push(free);
      if (order.customerId && rulesFor('tiers.customer') && rulesFor('tiers.customer').active) {
        ensureAccount(order.customerId);
        effects.push(recomputeTier(order.customerId));
      }
      if (order.cleanerId && rulesFor('tiers.worker') && rulesFor('tiers.worker').active) {
        const worker = getUser(order.cleanerId);
        if (worker) {
          ensureRow(worker);
          effects.push(recomputeTier(order.cleanerId));
        }
      }
      return { code: 'ok', effects };
    });
  }

  return {
    publishRule,
    rulesFor,
    listPointRules,
    postEntry,
    postTransfer,
    reverseEntry,
    recomputeTier,
    quoteCancelPenalty,
    onOrderEvent,
    ensureAccount,
    getUserPoints,
    listLedger,
  };
}

module.exports = { createPointsService };
