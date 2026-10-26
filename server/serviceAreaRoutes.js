'use strict';

function registerServiceAreaRoutes(app, { areas, requireAdmin }) {
  function noQuery(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, message: 'پارامتر اضافی مجاز نیست.' });
    next();
  }
  function read(req, res) {
    try { return res.json({ success: true, catalog: areas.read() }); }
    catch { return res.status(500).json({ success: false, message: 'دریافت شهرها انجام نشد. دوباره تلاش کنید.' }); }
  }
  app.get('/api/service-areas', noQuery, read);
  app.get('/api/admin/service-areas', requireAdmin, noQuery, read);
  app.put('/api/admin/service-areas', requireAdmin, noQuery, (req, res) => {
    try {
      const result = areas.publish(req.body);
      if (result.code === 'invalid') return res.status(400).json({ success: false, message: 'نام شهر، محله‌ها یا شهر پیش‌فرض معتبر نیست؛ شهرهای قبلی باید حفظ شوند.' });
      if (result.code === 'conflict') return res.status(409).json({ success: false, message: 'فهرست قبلاً تغییر کرده است؛ ابتدا بازخوانی کنید.' });
      return res.json({ success: true, catalog: result.catalog });
    } catch { return res.status(500).json({ success: false, message: 'ذخیره شهرها انجام نشد. نتیجه را بازخوانی کنید.' }); }
  });
}

module.exports = { registerServiceAreaRoutes };
