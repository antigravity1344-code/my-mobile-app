'use strict';
function registerWorkerWalletRoutes(app, {store, requireUser}) {
  function worker(req, res) {
    res.set('Cache-Control', 'no-store');
    const user = requireUser(req, res);
    if (!user) return null;
    if (user.role !== 'WORKER') { res.status(403).json({success:false,message:'این بخش مخصوص متخصص است.'}); return null; }
    if (Object.keys(req.query).length) { res.status(400).json({success:false,message:'پارامتر اضافی مجاز نیست.'}); return null; }
    return user;
  }
  app.get('/api/workers/me/wallet', (req,res) => {
    const user = worker(req,res); if (!user) return;
    try {
      const wallet = store.workerWallet.read(user.id);
      const topUpAvailable = store.paymentSettings.chargeEnabled();
      return res.json({
        success: true,
        wallet: { ...wallet, topUpAvailable },
        message: topUpAvailable
          ? 'پس از تأیید پرداخت در درگاه، اعتبار یک‌بار ثبت می‌شود.'
          : 'شارژ واقعی پس از اتصال معتبر درگاه شرکت فعال می‌شود.',
      });
    } catch { return res.status(500).json({success:false,message:'اطلاعات کیف پول دریافت نشد؛ دوباره تلاش کنید.'}); }
  });
}
module.exports = {registerWorkerWalletRoutes};
