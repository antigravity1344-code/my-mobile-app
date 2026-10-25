'use strict';
const crypto = require('node:crypto');
const { rateToBasisPoints } = require('./commissionPolicy');

function createWorkerWallet({ database, transaction, commissionPolicy }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS worker_commission_snapshots (
      orderId TEXT PRIMARY KEY, requestId TEXT UNIQUE NOT NULL, workerId TEXT NOT NULL,
      grossAmount INTEGER NOT NULL CHECK(grossAmount >= 0), actualHours REAL,
      currencyUnit TEXT NOT NULL, policyVersion INTEGER NOT NULL,
      rateBps INTEGER NOT NULL CHECK(rateBps BETWEEN 0 AND 10000),
      commissionAmount INTEGER NOT NULL CHECK(commissionAmount >= 0),
      netAmount INTEGER NOT NULL CHECK(netAmount >= 0), createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS worker_wallet_entries (
      id TEXT PRIMARY KEY, workerId TEXT NOT NULL, sourceKey TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('COMMISSION','TOPUP')),
      amount INTEGER NOT NULL, currencyUnit TEXT NOT NULL, orderId TEXT,
      createdAt TEXT NOT NULL,
      CHECK((type='COMMISSION' AND amount<=0 AND orderId IS NOT NULL)
         OR (type='TOPUP' AND amount>0 AND orderId IS NULL))
    );
    CREATE INDEX IF NOT EXISTS worker_wallet_by_worker ON worker_wallet_entries(workerId);
  `);
  for (const table of ['worker_commission_snapshots', 'worker_wallet_entries']) {
    for (const operation of ['UPDATE', 'DELETE']) database.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_no_${operation.toLowerCase()}
      BEFORE ${operation} ON ${table}
      BEGIN SELECT RAISE(ABORT, 'worker financial history is immutable'); END;
    `);
    const duplicate = table === 'worker_commission_snapshots'
      ? 'orderId=NEW.orderId OR requestId=NEW.requestId'
      : 'id=NEW.id OR sourceKey=NEW.sourceKey';
    database.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_replace
      BEFORE INSERT ON ${table} WHEN EXISTS (SELECT 1 FROM ${table} WHERE ${duplicate})
      BEGIN SELECT RAISE(ABORT, 'worker financial history is immutable'); END;`);
  }
  const rows = database.prepare(`SELECT e.*, s.grossAmount, s.commissionAmount, s.netAmount, s.rateBps
    FROM worker_wallet_entries e LEFT JOIN worker_commission_snapshots s ON s.orderId=e.orderId
    WHERE e.workerId=? ORDER BY e.rowid DESC`);
  const existing = database.prepare('SELECT * FROM worker_commission_snapshots WHERE orderId=?');
  const save = database.prepare(`INSERT INTO worker_commission_snapshots
    (orderId,requestId,workerId,grossAmount,actualHours,currencyUnit,policyVersion,rateBps,commissionAmount,netAmount,createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const debit = database.prepare(`INSERT INTO worker_wallet_entries
    (id,workerId,sourceKey,type,amount,currencyUnit,orderId,createdAt) VALUES (?,?,?,'COMMISSION',?,?,?,?)`);
  const credit = database.prepare(`INSERT INTO worker_wallet_entries
    (id,workerId,sourceKey,type,amount,currencyUnit,orderId,createdAt) VALUES (?,?,?,'TOPUP',?,?,NULL,?)`);
  const bySource = database.prepare('SELECT * FROM worker_wallet_entries WHERE sourceKey=?');

  function read(workerId) {
    const transactions = rows.all(workerId);
    const totals = new Map();
    for (const row of transactions) {
      if (!Number.isSafeInteger(row.amount)) throw new Error('INVALID_WALLET_AMOUNT');
      totals.set(row.currencyUnit, (totals.get(row.currencyUnit) || 0n) + BigInt(row.amount));
    }
    const balances = Array.from(totals, ([currencyUnit, value]) => {
      const balance = Number(value);
      if (!Number.isSafeInteger(balance)) throw new Error('WALLET_BALANCE_OVERFLOW');
      return { currencyUnit, balance };
    });
    return {
      balances,
      canAcceptNewOrders: balances.every(item => item.balance >= 0),
      topUpAvailable: false,
      transactions: transactions.map(row => ({
        id: row.id, type: row.type, amount: row.amount, currencyUnit: row.currencyUnit,
        orderId: row.orderId, createdAt: row.createdAt,
        grossAmount: row.grossAmount, commissionAmount: row.commissionAmount,
        netAmount: row.netAmount, ratePercent: row.rateBps == null ? null : row.rateBps / 100,
      })),
    };
  }

  function chargeCompletion(order, completion) {
    return transaction(() => {
      const prior = existing.get(order.id);
      if (prior) {
        if (prior.requestId !== completion.id || prior.workerId !== completion.workerId || prior.grossAmount !== completion.finalAmount)
          throw new Error('COMMISSION_SNAPSHOT_CONFLICT');
        return prior;
      }
      if (order.cleanerId !== completion.workerId || !Number.isSafeInteger(completion.finalAmount) || completion.finalAmount < 0)
        throw new Error('INVALID_COMPLETION_AMOUNT');
      // Keep stored units distinct. Historical no-unit orders retain their existing toman convention.
      const storedUnit = order.pricing && order.pricing.currencyUnit;
      const currencyUnit = typeof storedUnit === 'string' && storedUnit.trim() ? storedUnit.trim() : 'تومان';
      if (currencyUnit.length > 64) throw new Error('INVALID_CURRENCY_UNIT');
      const policy = commissionPolicy.read();
      const rateBps = rateToBasisPoints(policy.ratePercent);
      if (rateBps === null) throw new Error('INVALID_COMMISSION_POLICY');
      // Integer half-up rounding in the stored monetary unit, without floating point multiplication.
      const fee = Number((BigInt(completion.finalAmount) * BigInt(rateBps) + 5000n) / 10000n);
      const now = new Date().toISOString();
      save.run(order.id, completion.id, completion.workerId, completion.finalAmount, completion.actualHours,
        currencyUnit, policy.version, rateBps, fee, completion.finalAmount - fee, now);
      debit.run(crypto.randomUUID(), completion.workerId, 'commission:' + order.id, -fee, currencyUnit, order.id, now);
      // Fail the whole completion transaction if the resulting balance cannot be represented safely.
      read(completion.workerId);
      return existing.get(order.id);
    });
  }
  function creditVerifiedTopup({ workerId, amount, currencyUnit, sourceKey }) {
    if (typeof workerId !== 'string' || !workerId) throw new Error('INVALID_TOPUP_WORKER');
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_TOPUP_AMOUNT');
    if (typeof currencyUnit !== 'string' || !currencyUnit.trim() || currencyUnit.trim().length > 64) throw new Error('INVALID_CURRENCY_UNIT');
    if (typeof sourceKey !== 'string' || !sourceKey.startsWith('topup:') || sourceKey.length > 200) throw new Error('INVALID_TOPUP_KEY');
    const unit = currencyUnit.trim();
    return transaction(() => {
      const existing = bySource.get(sourceKey);
      if (existing) {
        if (existing.workerId !== workerId || existing.amount !== amount || existing.currencyUnit !== unit || existing.type !== 'TOPUP') {
          throw new Error('TOPUP_CONFLICT');
        }
        return existing;
      }
      credit.run(crypto.randomUUID(), workerId, sourceKey, amount, unit, new Date().toISOString());
      read(workerId);
      return bySource.get(sourceKey);
    });
  }
  return { read, chargeCompletion, creditVerifiedTopup };
}
module.exports = { createWorkerWallet };
