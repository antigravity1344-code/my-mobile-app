'use strict';
// کدهای تخفیف درصدی. مدیر از پنل می‌سازد و غیرفعال می‌کند. تاریخ انقضا و سقف استفاده اختیاری‌اند
// (تصمیم مالک، ۱۰ نوامبر ۲۰۲۶). درصد به‌صورت basis point ذخیره می‌شود: ۱۰٪ = 1000.
const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

function createDiscountCodes({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS discount_codes (
      code TEXT PRIMARY KEY,
      basisPoints INTEGER NOT NULL CHECK (basisPoints BETWEEN 1 AND 10000),
      expiresAt TEXT,
      maxUses INTEGER CHECK (maxUses IS NULL OR maxUses >= 1),
      usedCount INTEGER NOT NULL DEFAULT 0 CHECK (usedCount >= 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  const insert = database.prepare(`INSERT INTO discount_codes (code, basisPoints, expiresAt, maxUses, usedCount, active, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 0, 1, ?, ?)`);
  const find = database.prepare('SELECT * FROM discount_codes WHERE code = ?');
  const all = database.prepare('SELECT * FROM discount_codes ORDER BY createdAt DESC');
  const setActiveStmt = database.prepare('UPDATE discount_codes SET active = ?, updatedAt = ? WHERE code = ?');
  // مصرف اتمی: فقط وقتی کد هنوز معتبر و زیر سقف است، یک واحد اضافه می‌شود.
  const consumeStmt = database.prepare(`UPDATE discount_codes SET usedCount = usedCount + 1, updatedAt = ?
    WHERE code = ? AND active = 1 AND (maxUses IS NULL OR usedCount < maxUses) AND (expiresAt IS NULL OR expiresAt > ?)`);
  const releaseStmt = database.prepare('UPDATE discount_codes SET usedCount = usedCount - 1, updatedAt = ? WHERE code = ? AND usedCount > 0');

  const normalize = (raw) => String(raw || '').trim().toUpperCase();
  const toView = (row) => row && ({
    code: row.code,
    percent: row.basisPoints / 100,
    basisPoints: row.basisPoints,
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    active: row.active === 1,
    createdAt: row.createdAt,
  });

  return {
    normalizeCode: normalize,
    isValidCodeShape: (code) => CODE_PATTERN.test(code),
    /** نتیجه: {code:'ok', view} یا {code:'invalid'|'exists'}. */
    create({ code, percent, expiresAt, maxUses, now = new Date() }) {
      const clean = normalize(code);
      if (!CODE_PATTERN.test(clean)) return { code: 'invalid' };
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) return { code: 'invalid' };
      let expires = null;
      if (expiresAt != null && expiresAt !== '') {
        const ms = Date.parse(expiresAt);
        if (!Number.isFinite(ms) || ms <= now.getTime()) return { code: 'invalid' };
        expires = new Date(ms).toISOString();
      }
      let max = null;
      if (maxUses != null && maxUses !== '') {
        if (!Number.isInteger(maxUses) || maxUses < 1) return { code: 'invalid' };
        max = maxUses;
      }
      if (find.get(clean)) return { code: 'exists' };
      const stamp = now.toISOString();
      insert.run(clean, percent * 100, expires, max, stamp, stamp);
      return { code: 'ok', view: toView(find.get(clean)) };
    },
    list() {
      return all.all().map(toView);
    },
    setActive(code, active, now = new Date()) {
      const clean = normalize(code);
      if (!find.get(clean)) return { code: 'not_found' };
      setActiveStmt.run(active ? 1 : 0, now.toISOString(), clean);
      return { code: 'ok', view: toView(find.get(clean)) };
    },
    /** برای اعتبارسنجی نقل‌قول: کد خام ردیف یا null. */
    find(code) {
      return find.get(normalize(code)) || null;
    },
    /** مصرف یک استفاده هنگام ثبت سفارش؛ false یعنی کد دیگر معتبر نیست. */
    consume(code, now = new Date()) {
      return transaction(() => consumeStmt.run(now.toISOString(), normalize(code), now.toISOString()).changes === 1);
    },
    release(code, now = new Date()) {
      releaseStmt.run(now.toISOString(), normalize(code));
    },
    toView,
  };
}

module.exports = { createDiscountCodes };
