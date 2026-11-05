const { isMainThread, workerData, parentPort, Worker } = require('node:worker_threads');

if (!isMainThread) {
  // Each worker opens the same database file the way a second process would.
  const { createDataStore } = require('./dataStore');
  try {
    const db = createDataStore(workerData.sqlite);
    db.close();
    parentPort.postMessage({ ok: true });
  } catch (error) {
    parentPort.postMessage({ ok: false, message: String(error && error.message) });
  }
} else {
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  test('opening one existing database from several connections at once never fails on payment triggers', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-init-race-'));
    process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
    process.env.NODE_ENV = 'test';
    const file = path.join(tmp, 'paksho.sqlite');
    try {
      const { createDataStore } = require('./dataStore');
      createDataStore(file).close();

      const open = () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(__filename, { workerData: { sqlite: file } });
          worker.on('message', resolve);
          worker.on('error', reject);
        });

      for (let round = 0; round < 8; round += 1) {
        const results = await Promise.all(Array.from({ length: 12 }, open));
        const failures = results.filter((item) => !item.ok).map((item) => item.message);
        assert.deepEqual(failures, [], 'round ' + round);
      }

      const check = createDataStore(file);
      check.close();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}
