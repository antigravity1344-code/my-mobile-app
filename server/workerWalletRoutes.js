'use strict';
const { registerPaymentRoutes } = require('./paymentRoutes');
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
      return res.json({success:true,wallet:{...store.workerWallet.read(user.id), topUpAvailable:store.paymentCharges.available()},message:'شارژ واقعی پس از اتصال معتبر درگاه شرکت فعال می‌شود.'});
    } catch { return res.status(500).json({success:false,message:'اطلاعات کیف پول دریافت نشد؛ دوباره تلاش کنید.'}); }
  });
  app.get('/api/workers/me/weekly-income', (req,res) => {
    const user = worker(req,res); if (!user) return;
    try {
      return res.json({
        success:true,
        report:store.workerWallet.readWeeklyIncome(user.id),
        message:'درآمد این هفته از کارهای قطعی‌شده است و شارژ کیف پول را شامل نمی‌شود.',
      });
    } catch { return res.status(500).json({success:false,message:'گزارش درآمد هفته دریافت نشد؛ دوباره تلاش کنید.'}); }
  });
  app.get('/api/workers/me/income-report', (req,res) => {
    const user = worker(req,res); if (!user) return;
    try {
      return res.json({
        success:true,
        report:store.workerWallet.readMonthlyIncome(user.id),
        message:'این گزارش مبلغ قطعی کارها، کمیسیون و سهم خالص است و شارژ کیف پول را شامل نمی‌شود.',
      });
    } catch { return res.status(500).json({success:false,message:'گزارش درآمد دریافت نشد؛ دوباره تلاش کنید.'}); }
  });
  registerPaymentRoutes(app, { store, requireUser });
}
module.exports = {registerWorkerWalletRoutes};
