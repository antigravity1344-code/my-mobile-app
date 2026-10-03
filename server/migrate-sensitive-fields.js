const fs = require('fs');
const path = require('path');
const { createDataStore } = require('./dataStore');
const { assertKeyConfigured } = require('./fieldCrypto');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

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

loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '..', '.env'));
assertKeyConfigured();

const sqlitePath = path.join(__dirname, 'data', 'paksho.sqlite');
const backupPath = path.join(__dirname, 'data', 'backups', 'paksho-' + stamp() + '.sqlite');
const store = createDataStore(sqlitePath);
try {
  store.backupTo(backupPath);
  const converted = store.migrateSensitiveFields();
  console.log(JSON.stringify({ backup: path.basename(backupPath), converted }));
} finally {
  store.close();
}
