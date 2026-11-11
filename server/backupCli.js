#!/usr/bin/env node
'use strict';

// استفاده:
//   node backupCli.js backup <پوشهٔ مقصد>
//   node backupCli.js verify <پوشهٔ پشتیبان>
//   node backupCli.js restore <پوشهٔ پشتیبان> [--force]
// مسیرها از همان متغیرهای محیطی سرور خوانده می‌شوند: PAKSHO_SQLITE_PATH، PAKSHO_TARIFF_FILE، PAKSHO_WORKER_DOC_DIR.

const path = require('node:path');
const { createBackup, verifyBackup, restoreBackup } = require('./backupRestore');

const paths = {
  dbPath: process.env.PAKSHO_SQLITE_PATH
    ? path.resolve(process.env.PAKSHO_SQLITE_PATH)
    : path.join(__dirname, 'data', 'paksho.sqlite'),
  tariffPath: process.env.PAKSHO_TARIFF_FILE ? path.resolve(process.env.PAKSHO_TARIFF_FILE) : null,
  workerDocDir: process.env.PAKSHO_WORKER_DOC_DIR
    ? path.resolve(process.env.PAKSHO_WORKER_DOC_DIR)
    : path.join(__dirname, 'uploads', 'worker-docs'),
};

function main(argv) {
  const [command, target, ...rest] = argv;
  if (command === 'backup' && target) {
    const manifest = createBackup({ ...paths, outDir: path.resolve(target) });
    console.log(`پشتیبان ساخته شد: ${manifest.files.length} فایل، ${new Date(manifest.createdAt).toISOString()}`);
    console.log('جدول‌ها:', JSON.stringify(manifest.tableCounts));
    return 0;
  }
  if (command === 'verify' && target) {
    const manifest = verifyBackup(path.resolve(target));
    console.log(`پشتیبان سالم است: ${manifest.files.length} فایل تأیید شد.`);
    return 0;
  }
  if (command === 'restore' && target) {
    const force = rest.includes('--force');
    const result = restoreBackup({ backupDir: path.resolve(target), ...paths, force });
    console.log(`بازیابی انجام شد: ${result.files} فایل از پشتیبان ${result.createdAt}.`);
    console.log('یادآوری: کلید PAKSHO_DATA_ENCRYPTION_KEY باید همان کلید منبع باشد، وگرنه داده‌های رمزشده خوانده نمی‌شوند.');
    return 0;
  }
  console.error('دستور نامعتبر. از backup <پوشه>، verify <پوشه> یا restore <پوشه> [--force] استفاده کنید.');
  return 1;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`خطا: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
