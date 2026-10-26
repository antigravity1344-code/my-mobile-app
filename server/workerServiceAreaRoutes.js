'use strict';

function registerWorkerServiceAreaRoutes(app, { store, requireUser }) {
  app.route('/api/workers/me/service-area').all((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const user = requireUser(req, res);
    if (!user) return;
    if (user.role !== 'WORKER') return res.status(403).json({ success: false, message: 'این بخش فقط برای متخصص است.' });
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, message: 'پارامتر اضافی مجاز نیست.' });
    res.locals.workerAreaUser = user;
    next();
  }).get((req, res) => {
    try { return res.json({ success: true, area: store.workerServiceArea.read(res.locals.workerAreaUser.id), catalog: store.serviceAreas.read() }); }
    catch { return res.status(500).json({ success: false, message: 'دریافت محدوده انجام نشد. دوباره تلاش کنید.' }); }
  }).put((req, res) => {
    try {
      const result = store.workerServiceArea.save(res.locals.workerAreaUser.id, req.body);
      if (result.code === 'forbidden') return res.status(403).json({ success: false, message: 'دسترسی به محدوده مجاز نیست.' });
      if (result.code === 'invalid') return res.status(400).json({ success: false, message: 'یک شهر و حداقل یک محله از فهرست جاری انتخاب کنید؛ فیلد اضافی مجاز نیست.' });
      if (result.code === 'conflict') return res.status(409).json({ success: false, message: 'فهرست یا محدوده قبلاً تغییر کرده است. ابتدا بازخوانی کنید.' });
      return res.json({ success: true, area: result.area, catalog: result.catalog });
    } catch { return res.status(500).json({ success: false, message: 'تأیید ذخیره دریافت نشد؛ نتیجه را بازخوانی کنید.' }); }
  });
}
module.exports = { registerWorkerServiceAreaRoutes };
