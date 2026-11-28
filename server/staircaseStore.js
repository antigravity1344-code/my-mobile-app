const { createHash } = require('node:crypto');
const { validRates, DEFAULT_RATES } = require('./pricing/staircase');

// Each published tariff refers to an immutable SQLite snapshot, including after a retry.
function createStaircaseStore(database) {
  database.exec('CREATE TABLE IF NOT EXISTS staircase_tariffs (id TEXT PRIMARY KEY, rates TEXT NOT NULL)');
  const select = database.prepare('SELECT rates FROM staircase_tariffs WHERE id = ?');
  const insert = database.prepare('INSERT OR IGNORE INTO staircase_tariffs (id, rates) VALUES (?, ?)');
  function save(rates) {
    if (!validRates(rates)) throw new RangeError('تعرفهٔ راه‌پله معتبر نیست.');
    const body = JSON.stringify(Object.fromEntries(Object.keys(DEFAULT_RATES).map(key => [key, rates[key]])));
    const id = createHash('sha256').update(body).digest('hex');
    insert.run(id, body);
    return id;
  }
  function read(id) {
    const row = select.get(id);
    if (!row) throw new Error('تعرفهٔ راه‌پله در پایگاه داده پیدا نشد.');
    const rates = JSON.parse(row.rates);
    return Object.fromEntries(Object.keys(DEFAULT_RATES).map(key => [key, rates[key]]));
  }
  return { save, read, defaultId: save(DEFAULT_RATES) };
}
module.exports = { createStaircaseStore };
