'use strict';
function registerPaymentRoutes(app, { store, requireUser }) {
  function worker(req, res) {
    res.set('Cache-Control', 'no-store');
    const user = requireUser(req, res);
    if (!user) return null;
    if (user.role !== 'WORKER') { res.status(403).json({ success: false, message: 'این بخش مخصوص متخصص است.' }); return null; }
    if (Object.keys(req.query).length) { res.status(400).json({ success: false, message: 'پارامتر اضافی مجاز نیست.' }); return null; }
    return user;
  }
  function failure(res, code) {
    const status = { not_configured: 501, invalid: 400, not_found: 404,
      unverified: 409, conflict: 409, provider_error: 502 }[code] || 500;
    return res.status(status).json({
      success: false, code: code === 'not_configured' ? 'PAYMENT_NOT_CONFIGURED' : code,
      message: code === 'not_configured' ? 'درگاه شرکت متصل نیست؛ موجودی کیف پول تغییر نکرد.'
        : 'تأیید معتبر پرداخت دریافت نشد. موجودی را بازخوانی کنید و دوباره تلاش کنید.',
    });
  }
  app.post('/api/workers/me/wallet/topup', async (req, res) => {
    const user = worker(req, res); if (!user) return;
    try {
      const result = await store.paymentCharges.startTopup(user.id, req.body);
      if (result.code !== 'ok') return failure(res, result.code);
      return res.json({ success: true, intent: result.intent, redirectUrl: result.redirectUrl });
    } catch { return failure(res, 'storage_error'); }
  });
  app.post('/api/workers/me/wallet/topup/confirm', async (req, res) => {
    const user = worker(req, res); if (!user) return;
    try {
      const result = await store.paymentCharges.confirmTopup(user.id, req.body);
      if (result.code !== 'ok') return failure(res, result.code);
      return res.json({ success: true, wallet: result.wallet, intent: result.intent });
    } catch { return failure(res, 'storage_error'); }
  });
}
module.exports = { registerPaymentRoutes };
