'use strict';
// کلیدهای روشن/خاموش قابلیت‌ها که مدیر از پنل می‌زند: برای کل شرکت (GLOBAL) یا برای یک متخصص (WORKER).
// پیش‌فرض همه روشن است. افزودن قابلیت تازه فقط یک ردیف در FEATURES است. هر تغییر در گزارش ثبت می‌شود.
const FEATURES = Object.freeze({
  offers: 'قیمت پیشنهاد متخصص',
  patient_companion: 'صلاحیت همراه مریض',
});
// کلیدهای متخصصی که پیش‌فرضشان خاموش است و فقط مدیر روشن می‌کند (صلاحیت).
const WORKER_DEFAULT_OFF = Object.freeze(new Set(['patient_companion']));

function createFeatureSwitches({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS feature_switches (
      scope TEXT NOT NULL CHECK (scope IN ('GLOBAL', 'WORKER')),
      subjectId TEXT NOT NULL,
      feature TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (scope, subjectId, feature)
    );
    CREATE TABLE IF NOT EXISTS feature_switch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL, subjectId TEXT NOT NULL, feature TEXT NOT NULL,
      enabled INTEGER NOT NULL, actor TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS feature_switch_log_no_update BEFORE UPDATE ON feature_switch_log
    BEGIN SELECT RAISE(ABORT, 'feature switch log is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS feature_switch_log_no_delete BEFORE DELETE ON feature_switch_log
    BEGIN SELECT RAISE(ABORT, 'feature switch log is immutable'); END;
  `);
  const get = database.prepare('SELECT enabled FROM feature_switches WHERE scope = ? AND subjectId = ? AND feature = ?');
  const upsert = database.prepare(`INSERT INTO feature_switches (scope, subjectId, feature, enabled, updatedAt)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(scope, subjectId, feature) DO UPDATE SET enabled = excluded.enabled, updatedAt = excluded.updatedAt`);
  const log = database.prepare('INSERT INTO feature_switch_log (scope, subjectId, feature, enabled, actor, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
  const allWorker = database.prepare("SELECT subjectId, feature, enabled FROM feature_switches WHERE scope = 'WORKER'");
  const allGlobal = database.prepare("SELECT feature, enabled FROM feature_switches WHERE scope = 'GLOBAL'");

  const known = (feature) => Object.hasOwn(FEATURES, feature);
  const state = (scope, subjectId, feature) => {
    const row = get.get(scope, subjectId, feature);
    return row ? row.enabled === 1 : !(scope === 'WORKER' && WORKER_DEFAULT_OFF.has(feature));
  };

  return {
    FEATURES,
    isGlobalEnabled: (feature) => state('GLOBAL', '', feature),
    isWorkerEnabled: (feature, workerId) => state('GLOBAL', '', feature) && state('WORKER', String(workerId), feature),
    /** وضعیت کلیدهای یک متخصص (بدون درنظرگرفتن کلید کلی)؛ برای کارت مدیر. */
    forWorker(workerId) {
      const out = {};
      for (const feature of Object.keys(FEATURES)) out[feature] = state('WORKER', String(workerId), feature);
      return out;
    },
    snapshot() {
      const global = {};
      for (const feature of Object.keys(FEATURES)) global[feature] = true;
      for (const row of allGlobal.all()) if (known(row.feature)) global[row.feature] = row.enabled === 1;
      return { features: Object.entries(FEATURES).map(([key, label]) => ({ key, label })), global };
    },
    /** نتیجه: {code:'ok'} یا {code:'invalid'}. */
    set({ scope, workerId, feature, enabled, actor }) {
      if (!known(feature) || typeof enabled !== 'boolean' || (scope !== 'GLOBAL' && scope !== 'WORKER')) return { code: 'invalid' };
      const subjectId = scope === 'GLOBAL' ? '' : (typeof workerId === 'string' ? workerId : '');
      if (scope === 'WORKER' && !subjectId) return { code: 'invalid' };
      const now = new Date().toISOString();
      transaction(() => {
        upsert.run(scope, subjectId, feature, enabled ? 1 : 0, now);
        log.run(scope, subjectId, feature, enabled ? 1 : 0, actor || 'admin', now);
      });
      return { code: 'ok' };
    },
  };
}

module.exports = { createFeatureSwitches, FEATURES };
