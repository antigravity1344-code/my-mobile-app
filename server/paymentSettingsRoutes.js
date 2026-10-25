'use strict';

function registerPaymentSettingsRoutes(app, { settings, requireAdmin }) {
  function noQuery(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, message: 'پارامتر اضافی مجاز نیست.' });
    next();
  }
  app.get('/api/admin/payment-settings', requireAdmin, noQuery, (req, res) => {
    try {
      const resolved = settings.resolve();
      return res.json({
        success: true,
        settings: settings.read(),
        resolved: resolved.code === 'ok' ? resolved.settings : null,
        resolution: resolved.code,
      });
    } catch {
      return res.status(500).json({ success: false, message: 'دریافت تنظیمات پرداخت انجام نشد. دوباره تلاش کنید.' });
    }
  });
  app.put('/api/admin/payment-settings', requireAdmin, noQuery, (req, res) => {
    try {
      const result = settings.publish(req.body);
      if (result.code === 'invalid') return res.status(400).json({ success: false, message: 'تنظیمات پرداخت معتبر نیست.' });
      if (result.code === 'provider_unavailable') {
        return res.status(400).json({
          success: false,
          code: 'PROVIDER_NOT_IMPLEMENTED',
          message: 'درگاه انتخاب‌شده پیاده‌سازی نشده است. نام درگاه یا شماره حساب به‌تنهایی اتصال بانکی ایجاد نمی‌کند.',
          settings: result.settings,
        });
      }
      if (result.code === 'conflict') {
        return res.status(409).json({
          success: false,
          message: 'تنظیمات پرداخت قبلاً تغییر کرده است. مقدار جدید را بازخوانی کنید.',
          settings: result.settings,
        });
      }
      return res.json({ success: true, settings: result.settings });
    } catch {
      return res.status(500).json({ success: false, message: 'ذخیره تنظیمات پرداخت انجام نشد. دوباره تلاش کنید.' });
    }
  });
}

module.exports = { registerPaymentSettingsRoutes };
