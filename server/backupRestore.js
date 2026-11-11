'use strict';

// پشتیبان‌گیری و بازیابی کامل داده‌های پاک‌شو.
// محتوا: نسخهٔ سازگار دیتابیس SQLite، فایل تعرفه، و (اختیاری) مدارک کارگران.
// کلیدهای محرمانه (مثل PAKSHO_DATA_ENCRYPTION_KEY و رمزهای مدیر) هرگز در پشتیبان نیستند؛
// برای بازیابی باید جداگانه و امن منتقل شوند.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const FORMAT = 'paksho-backup';
const FORMAT_VERSION = 1;
const MANIFEST = 'manifest.json';
const DB_FILE = 'paksho.sqlite';
const TARIFF_FILE = 'tariff.json';
const DOCS_DIR = 'worker-docs';

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFilesRecursive(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function tableCounts(dbFile) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const counts = {};
    for (const { name } of tables) {
      counts[name] = db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n;
    }
    return counts;
  } finally {
    db.close();
  }
}

function integrityOk(dbFile) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    return db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok';
  } finally {
    db.close();
  }
}

function isNonEmptyDir(dir) {
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

/**
 * پشتیبان کامل می‌سازد. outDir نباید از قبل وجود داشته باشد یا خالی نباشد.
 */
function createBackup({ dbPath, tariffPath, workerDocDir, outDir, includeWorkerDocs = true }) {
  if (isNonEmptyDir(outDir)) throw new Error('پوشهٔ مقصد پشتیبان باید خالی باشد.');
  if (!fs.existsSync(dbPath)) throw new Error('فایل دیتابیس پیدا نشد.');
  fs.mkdirSync(outDir, { recursive: true });

  const files = [];

  // نسخهٔ سازگار از دیتابیس زنده (شامل داده‌های WAL)
  const dbOut = path.join(outDir, DB_FILE);
  const source = new DatabaseSync(dbPath, { timeout: 5000 });
  try {
    source.prepare('VACUUM INTO ?').run(dbOut);
  } finally {
    source.close();
  }
  if (!integrityOk(dbOut)) throw new Error('نسخهٔ پشتیبان دیتابیس سالم نیست؛ پشتیبان ساخته نشد.');
  files.push(DB_FILE);

  if (tariffPath && fs.existsSync(tariffPath)) {
    JSON.parse(fs.readFileSync(tariffPath, 'utf8'));
    fs.copyFileSync(tariffPath, path.join(outDir, TARIFF_FILE));
    files.push(TARIFF_FILE);
  }

  if (includeWorkerDocs && workerDocDir && fs.existsSync(workerDocDir)) {
    const docsOut = path.join(outDir, DOCS_DIR);
    fs.cpSync(workerDocDir, docsOut, { recursive: true });
    for (const rel of listFilesRecursive(docsOut)) files.push(`${DOCS_DIR}/${rel}`);
  }

  const manifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    tableCounts: tableCounts(dbOut),
    files: files.map((rel) => {
      const full = path.join(outDir, ...rel.split('/'));
      return { path: rel, bytes: fs.statSync(full).size, sha256: sha256File(full) };
    }),
    notIncluded: ['PAKSHO_DATA_ENCRYPTION_KEY', 'PAKSHO_ADMIN_PASSWORD', 'کلیدهای پیامک و پرداخت', 'فایل .env'],
  };
  fs.writeFileSync(path.join(outDir, MANIFEST), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

function readManifest(backupDir) {
  const file = path.join(backupDir, MANIFEST);
  if (!fs.existsSync(file)) throw new Error('فایل manifest.json در پشتیبان پیدا نشد.');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.format !== FORMAT || manifest.formatVersion !== FORMAT_VERSION) {
    throw new Error('قالب پشتیبان پشتیبانی نمی‌شود.');
  }
  return manifest;
}

/** صحت همهٔ فایل‌های فهرست‌شده در manifest را بررسی می‌کند (اندازه و sha256). */
function verifyBackup(backupDir) {
  const manifest = readManifest(backupDir);
  for (const entry of manifest.files) {
    const full = path.join(backupDir, ...entry.path.split('/'));
    if (!fs.existsSync(full)) throw new Error(`فایل پشتیبان نیست: ${entry.path}`);
    if (fs.statSync(full).size !== entry.bytes || sha256File(full) !== entry.sha256) {
      throw new Error(`فایل پشتیبان دستکاری یا خراب شده است: ${entry.path}`);
    }
  }
  if (!manifest.files.some((f) => f.path === DB_FILE)) throw new Error('دیتابیس در پشتیبان نیست.');
  return manifest;
}

/**
 * بازیابی امن: اول صحت بررسی می‌شود، سپس مقصد بازنویسی نمی‌شود مگر force باشد.
 */
function restoreBackup({ backupDir, dbPath, tariffPath, workerDocDir, force = false }) {
  const manifest = verifyBackup(backupDir);
  const targets = [
    ['دیتابیس', dbPath, fs.existsSync(dbPath)],
    ['تعرفه', tariffPath, tariffPath && fs.existsSync(tariffPath)],
    ['مدارک کارگران', workerDocDir, isNonEmptyDir(workerDocDir || '')],
  ];
  if (!force) {
    const existing = targets.filter(([, , exists]) => exists).map(([label]) => label);
    if (existing.length) throw new Error(`مقصد از قبل داده دارد (${existing.join('، ')}). برای بازنویسی force را بدهید.`);
  }

  const tmpDb = `${dbPath}.restore-tmp`;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.copyFileSync(path.join(backupDir, DB_FILE), tmpDb);
  if (!integrityOk(tmpDb)) {
    fs.rmSync(tmpDb, { force: true });
    throw new Error('دیتابیس بازیابی‌شده سالم نیست؛ چیزی جایگزین نشد.');
  }
  fs.renameSync(tmpDb, dbPath);
  for (const suffix of ['-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });

  if (tariffPath && manifest.files.some((f) => f.path === TARIFF_FILE)) {
    JSON.parse(fs.readFileSync(path.join(backupDir, TARIFF_FILE), 'utf8'));
    fs.mkdirSync(path.dirname(tariffPath), { recursive: true });
    fs.copyFileSync(path.join(backupDir, TARIFF_FILE), tariffPath);
  }

  if (workerDocDir) {
    const docs = manifest.files.filter((f) => f.path.startsWith(`${DOCS_DIR}/`));
    if (docs.length) {
      fs.rmSync(workerDocDir, { recursive: true, force: true });
      fs.cpSync(path.join(backupDir, DOCS_DIR), workerDocDir, { recursive: true });
    }
  }

  return { tableCounts: manifest.tableCounts, createdAt: manifest.createdAt, files: manifest.files.length };
}

module.exports = { createBackup, verifyBackup, restoreBackup, readManifest, MANIFEST, DB_FILE, TARIFF_FILE, DOCS_DIR };
