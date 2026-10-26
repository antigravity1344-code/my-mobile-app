'use strict';

function registerWorkerBankRoutes(app, { store, requireUser, requireAdmin }) {
  function worker(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const user = requireUser(req, res); if (!user) return;
    if (user.role !== 'WORKER') return res.status(403).json({ success: false, code: 'forbidden', message: 'این بخش فقط برای متخصص است.' });
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, code: 'invalid', message: 'پارامتر اضافی مجاز نیست.' });
    res.locals.workerBankId = user.id; next();
  }
  const messages = {
    invalid: 'اطلاعات واردشده معتبر نیست؛ شبا و رمز شش‌رقمی را بررسی کنید.',
    forbidden: 'دسترسی به این حساب مجاز نیست.', conflict: 'اطلاعات تغییر کرده است؛ ابتدا بازخوانی کنید.',
    locked: 'پس از پنج رمز اشتباه، تغییرات برای پانزده دقیقه قفل می‌شود.',
    pin_invalid: 'رمز فعلی اشتباه است.', pin_required: 'رمز فعلی لازم است؛ در صورت فراموشی با پشتیبانی تماس بگیرید.',
    otp_required: 'کد پیامکی مخصوص همین عملیات لازم است.', otp_invalid: 'کد پیامکی اشتباه یا منقضی است.',
    otp_locked: 'تعداد تلاش کد پیامکی بیش از حد مجاز است.', rate_limited: 'کمی صبر کنید و دوباره کد بخواهید.',
    sms_unavailable: 'ارسال کد پیامکی انجام نشد.', identity_missing: 'مدارک هویتی ثبت‌شده برای این حساب موجود نیست.',
    storage_error: 'ذخیره تأیید نشد؛ اطلاعات را بازخوانی کنید.',
    pin_change_required: 'ابتدا رمز موقت را به رمز شخصی خود تغییر دهید.',
    temporary_expired: 'رمز موقت منقضی شده است؛ از پشتیبانی بازنشانی دوباره بخواهید.',
  };
  function reply(res, result) {
    if (result.code === 'ok') {
      const { code, ...publicResult } = result;
      return res.json({ success: true, ...publicResult });
    }
    const status = { invalid: 400, forbidden: 403, conflict: 409, locked: 423, pin_invalid: 400,
      pin_required: 409, otp_required: 400, otp_invalid: 400, otp_locked: 429, rate_limited: 429,
      sms_unavailable: 503, identity_missing: 409, pin_change_required: 409, temporary_expired: 409 }[result.code] || 500;
    return res.status(status).json({ success: false, code: result.code, message: messages[result.code] || messages.storage_error,
      ...(result.lockedUntil ? { lockedUntil: result.lockedUntil } : {}) });
  }
  const run = operation => async (req, res) => {
    try { return reply(res, await operation(req, res)); }
    catch { return reply(res, { code: 'storage_error' }); }
  };
  app.get('/api/workers/me/bank-details', worker, run((_req, res) => store.workerBank.read(res.locals.workerBankId)));
  app.put('/api/workers/me/bank-details', worker, run((req, res) => store.workerBank.saveBank(res.locals.workerBankId, req.body)));
  app.put('/api/workers/me/bank-pin', worker, run((req, res) => store.workerBank.savePin(res.locals.workerBankId, req.body)));
  app.post('/api/workers/me/bank-otp', worker, run((req, res) => store.workerBank.sendOtp(res.locals.workerBankId, req.body)));
  function adminNoQuery(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return reply(res, { code: 'invalid' });
    next();
  }
  app.get('/api/admin/workers/:id/bank-details', requireAdmin, adminNoQuery, run(req => store.workerBank.read(req.params.id)));
  app.post('/api/admin/workers/:id/bank-pin/reset', requireAdmin, adminNoQuery, run((req, res) => store.workerBank.resetPin(req.params.id, req.body, res.locals.adminAuditActor)));
}
module.exports = { registerWorkerBankRoutes };
