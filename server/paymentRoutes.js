'use strict';
function registerPaymentRoutes(app, { store, requireUser, requireAdmin }) {
  function noQuery(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, message: 'پارامتر اضافی مجاز نیست.' });
    next();
  }
  function worker(req, res) {
    res.set('Cache-Control', 'no-store');
    const user = requireUser(req, res);
    if (!user) return null;
    if (user.role !== 'WORKER') { res.status(403).json({ success: false, message: 'این بخش مخصوص متخصص است.' }); return null; }
    if (Object.keys(req.query).length) { res.status(400).json({ success: false, message: 'پارامتر اضافی مجاز نیست.' }); return null; }
    return user;
  }
  app.get('/api/admin/payment-settings', requireAdmin, noQuery, (req, res) => {
    try {
      return res.json({
        success: true,
        settings: store.paymentSettings.read(),
        providers: store.paymentSettings.listProviders(),
        message: 'شماره حساب به‌تنهایی مقصد تسویه را عوض نمی‌کند. شارژ تا اتصال درگاه پیاده‌شده و تأیید حساب نزد ارائه‌دهنده غیرفعال است.',
      });
    } catch {
      return res.status(500).json({ success: false, message: 'دریافت تنظیمات پرداخت انجام نشد. دوباره تلاش کنید.' });
    }
  });
  app.put('/api/admin/payment-settings', requireAdmin, noQuery, (req, res) => {
    try {
      const result = store.paymentSettings.publish(req.body);
      if (result.code === 'invalid') {
        return res.status(400).json({ success: false, message: 'فقط درگاه پیاده‌شده، شناسه پذیرنده، رمز اتصال و حساب تسویه معتبر پذیرفته می‌شود.' });
      }
      if (result.code === 'conflict') {
        return res.status(409).json({ success: false, message: 'تنظیمات قبلاً تغییر کرده است. مقدار جاری را بازخوانی کنید.', settings: result.settings });
      }
      return res.json({ success: true, settings: result.settings, providers: store.paymentSettings.listProviders() });
    } catch {
      return res.status(500).json({ success: false, message: 'ذخیره تنظیمات پرداخت انجام نشد. دوباره تلاش کنید.' });
    }
  });
  app.post('/api/workers/me/wallet/topup', async (req, res) => {
    const user = worker(req, res); if (!user) return;
    try {
      const result = await store.paymentCharges.startTopup(user.id, req.body);
      if (result.code === 'not_configured') {
        return res.status(501).json({ success: false, code: 'PAYMENT_NOT_CONFIGURED', message: 'درگاه شرکت متصل نیست؛ موجودی کیف پول تغییر نکرد.' });
      }
      if (result.code === 'invalid') return res.status(400).json({ success: false, message: 'مبلغ و واحد پولی شارژ نامعتبر است.' });
      if (result.code === 'provider_error') return res.status(502).json({ success: false, message: 'درگاه پاسخ معتبر نداد؛ موجودی تغییر نکرد.' });
      return res.json({ success: true, intent: result.intent, message: 'پرداخت باید در درگاه تأیید شود؛ پاسخ مرورگر اعتبار نیست.' });
    } catch {
      return res.status(500).json({ success: false, message: 'شروع شارژ انجام نشد؛ موجودی تغییر نکرد.' });
    }
  });
  app.post('/api/workers/me/wallet/topup/confirm', async (req, res) => {
    const user = worker(req, res); if (!user) return;
    try {
      const result = await store.paymentCharges.confirmTopup(user.id, req.body);
      if (result.code === 'invalid') return res.status(400).json({ success: false, message: 'شناسه پرداخت نامعتبر است.' });
      if (result.code === 'not_found') return res.status(404).json({ success: false, message: 'این پرداخت متعلق به نشست جاری نیست.' });
      if (result.code === 'unverified') return res.status(409).json({ success: false, message: 'پرداخت نزد درگاه تأیید نشد؛ موجودی تغییر نکرد.' });
      if (result.code === 'provider_error') return res.status(502).json({ success: false, message: 'راستی‌آزمایی درگاه ممکن نشد؛ موجودی تغییر نکرد.' });
      return res.json({ success: true, wallet: result.wallet, intent: result.intent });
    } catch {
      return res.status(500).json({ success: false, message: 'ثبت شارژ انجام نشد؛ دوباره تلاش کنید.' });
    }
  });
}
module.exports = { registerPaymentRoutes };
