'use strict';
// روشن/خاموش‌کردن انواع خدمت برای کل شرکت. پیش‌فرض همه روشن است؛ هر تغییر در گزارش تغییرناپذیر ثبت می‌شود.
// خاموش‌کردن فقط سفارش و پیشنهاد تازه را می‌بندد؛ سفارش‌های موجود دست‌نخورده می‌مانند.
const SERVICE_LABELS = Object.freeze({
  home_unit_cleaning: 'نظافت داخل منزل / واحد',
  staircase_common_areas: 'نظافت راه‌پله و مشاعات',
  office_company_cleaning: 'نظافت دفاتر اداری و شرکت‌ها',
  sofa_carpet_washing: 'مبل‌شویی و فرش‌شویی در محل',
  hourly_labor: 'کارگر ساعتی',
  building_painting: 'نقاشی ساختمان',
});

function createServiceSwitches({ database, transaction }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS service_switches (
      serviceId TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feature_switch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL, subjectId TEXT NOT NULL, feature TEXT NOT NULL,
      enabled INTEGER NOT NULL, actor TEXT NOT NULL, createdAt TEXT NOT NULL
    );
  `);
  const upsert = database.prepare(`INSERT INTO service_switches (serviceId, enabled, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(serviceId) DO UPDATE SET enabled = excluded.enabled, updatedAt = excluded.updatedAt`);
  const log = database.prepare("INSERT INTO feature_switch_log (scope, subjectId, feature, enabled, actor, createdAt) VALUES ('SERVICE', ?, 'service', ?, ?, ?)");
  const all = database.prepare('SELECT serviceId, enabled FROM service_switches');
  const disabledSet = () => new Set(all.all().filter((row) => row.enabled === 0).map((row) => row.serviceId));
  const known = (id) => typeof id === 'string' && Object.hasOwn(SERVICE_LABELS, id);

  return {
    SERVICE_LABELS,
    /** شناسه ناشناخته (خدمت سفارشی/قدیمی) خاموش‌شده حساب نمی‌شود مگر صریحاً خاموش شده باشد. */
    isEnabled: (serviceId) => !disabledSet().has(serviceId),
    disabledIds: () => [...disabledSet()],
    snapshot() {
      const off = disabledSet();
      return { services: Object.entries(SERVICE_LABELS).map(([id, title]) => ({ id, title, enabled: !off.has(id) })) };
    },
    /** نتیجه: {code:'ok'|'invalid'} */
    set({ serviceId, enabled, actor }) {
      if (!known(serviceId) || typeof enabled !== 'boolean') return { code: 'invalid' };
      const now = new Date().toISOString();
      transaction(() => {
        upsert.run(serviceId, enabled ? 1 : 0, now);
        log.run(serviceId, enabled ? 1 : 0, actor || 'admin', now);
      });
      return { code: 'ok' };
    },
  };
}

module.exports = { createServiceSwitches, SERVICE_LABELS };
