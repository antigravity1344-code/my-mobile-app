'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createDataStore } = require('./dataStore');
const { createBackup, verifyBackup, restoreBackup, MANIFEST } = require('./backupRestore');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-backup-test-'));
  const dbPath = path.join(root, 'live', 'paksho.sqlite');
  const tariffPath = path.join(root, 'live', 'tariff.json');
  const docDir = path.join(root, 'live', 'worker-docs');
  const store = createDataStore(dbPath);
  void store;
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE IF NOT EXISTS backup_probe (id INTEGER PRIMARY KEY, label TEXT)');
  db.prepare('INSERT INTO backup_probe (label) VALUES (?)').run('ردیف یک');
  db.prepare('INSERT INTO backup_probe (label) VALUES (?)').run('ردیف دو');
  db.close();
  fs.writeFileSync(tariffPath, JSON.stringify({ records: [{ id: 'r1' }] }), 'utf8');
  fs.mkdirSync(path.join(docDir, 'w1'), { recursive: true });
  fs.writeFileSync(path.join(docDir, 'w1', 'id.bin'), 'مدرک');
  return { root, dbPath, tariffPath, docDir, backupDir: path.join(root, 'backup') };
}

test('backup creates a verified copy with counts, tariff and worker docs', () => {
  const s = setup();
  const manifest = createBackup({ dbPath: s.dbPath, tariffPath: s.tariffPath, workerDocDir: s.docDir, outDir: s.backupDir });
  assert.equal(manifest.tableCounts.backup_probe, 2);
  assert.ok(manifest.files.some(f => f.path === 'worker-docs/w1/id.bin'));
  assert.ok(manifest.files.some(f => f.path === 'tariff.json'));
  assert.ok(verifyBackup(s.backupDir));
  assert.ok(fs.existsSync(path.join(s.backupDir, MANIFEST)));
});

test('backup refuses a non-empty destination', () => {
  const s = setup();
  fs.mkdirSync(s.backupDir, { recursive: true });
  fs.writeFileSync(path.join(s.backupDir, 'x.txt'), 'x');
  assert.throws(() => createBackup({ dbPath: s.dbPath, tariffPath: s.tariffPath, workerDocDir: s.docDir, outDir: s.backupDir }), /خالی باشد/);
});

test('restore into a fresh location reproduces data and files', () => {
  const s = setup();
  createBackup({ dbPath: s.dbPath, tariffPath: s.tariffPath, workerDocDir: s.docDir, outDir: s.backupDir });
  const newDb = path.join(s.root, 'new', 'paksho.sqlite');
  const newTariff = path.join(s.root, 'new', 'tariff.json');
  const newDocs = path.join(s.root, 'new', 'worker-docs');
  const result = restoreBackup({ backupDir: s.backupDir, dbPath: newDb, tariffPath: newTariff, workerDocDir: newDocs });
  assert.equal(result.tableCounts.backup_probe, 2);
  const db = new DatabaseSync(newDb, { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM backup_probe').get().n, 2);
  db.close();
  assert.equal(JSON.parse(fs.readFileSync(newTariff, 'utf8')).records[0].id, 'r1');
  assert.equal(fs.readFileSync(path.join(newDocs, 'w1', 'id.bin'), 'utf8'), 'مدرک');
});

test('restore refuses to overwrite existing data unless forced', () => {
  const s = setup();
  createBackup({ dbPath: s.dbPath, tariffPath: s.tariffPath, workerDocDir: s.docDir, outDir: s.backupDir });
  assert.throws(() => restoreBackup({ backupDir: s.backupDir, dbPath: s.dbPath, tariffPath: s.tariffPath, workerDocDir: s.docDir }), /force/);
  assert.doesNotThrow(() => restoreBackup({ backupDir: s.backupDir, dbPath: s.dbPath, tariffPath: s.tariffPath, workerDocDir: s.docDir, force: true }));
});

test('tampered backup is rejected before anything is restored', () => {
  const s = setup();
  createBackup({ dbPath: s.dbPath, tariffPath: s.tariffPath, workerDocDir: s.docDir, outDir: s.backupDir });
  fs.appendFileSync(path.join(s.backupDir, 'tariff.json'), ' ');
  const newDb = path.join(s.root, 'new', 'paksho.sqlite');
  assert.throws(() => restoreBackup({ backupDir: s.backupDir, dbPath: newDb }), /دستکاری|خراب/);
  assert.equal(fs.existsSync(newDb), false);
});

test('backup never includes secret environment values', () => {
  const s = setup();
  process.env.PAKSHO_DATA_ENCRYPTION_KEY = 'secret-key-should-not-leak';
  try {
    createBackup({ dbPath: s.dbPath, tariffPath: s.tariffPath, workerDocDir: s.docDir, outDir: s.backupDir });
    const manifestText = fs.readFileSync(path.join(s.backupDir, MANIFEST), 'utf8');
    assert.equal(manifestText.includes('secret-key-should-not-leak'), false);
    assert.ok(manifestText.includes('PAKSHO_DATA_ENCRYPTION_KEY'));
  } finally {
    delete process.env.PAKSHO_DATA_ENCRYPTION_KEY;
  }
});
