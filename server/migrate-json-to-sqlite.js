const fs = require('fs');
const path = require('path');
const { createDataStore } = require('./dataStore');

const jsonPath = path.join(__dirname, 'db.json');
const sqlitePath = path.join(__dirname, 'data', 'paksho.sqlite');

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function main() {
  if (!fs.existsSync(jsonPath)) {
    throw new Error('server/db.json پیدا نشد.');
  }
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const snapshot = JSON.parse(raw);
  const before = {
    users: Array.isArray(snapshot.users) ? snapshot.users.length : 0,
    orders: Array.isArray(snapshot.orders) ? snapshot.orders.length : 0,
    otps: snapshot.otpStore ? Object.keys(snapshot.otpStore).length : 0,
    sessions: snapshot.sessions ? Object.keys(snapshot.sessions).length : 0,
  };

  const backupDir = path.join(__dirname, 'data', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, 'db-' + stamp() + '.json');
  fs.writeFileSync(backupPath, raw);

  const store = createDataStore(sqlitePath);
  try {
    const result = store.importSnapshot(snapshot);
    if (
      result.actual.users !== before.users ||
      result.actual.orders !== before.orders ||
      result.actual.otps !== before.otps ||
      result.actual.sessions !== before.sessions
    ) {
      throw new Error('تعداد رکوردها بعد از انتقال برابر نیست.');
    }
    console.log(
      JSON.stringify({
        backup: path.basename(backupPath),
        before,
        after: result.actual,
      })
    );
  } finally {
    store.close();
  }
}

main();
