function registerCommissionRoutes(app, { policy, requireUser, requireAdmin }) {
  function noQuery(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, message: 'پارامتر اضافی مجاز نیست.' });
    next();
  }
  function read(req, res) {
    try {
      return res.json({ success: true, policy: policy.read() });
    } catch {
      return res.status(500).json({ success: false, message: 'دریافت درصد کمیسیون انجام نشد. دوباره تلاش کنید.' });
    }
  }
  // Pending workers need this disclosure before submitting their onboarding form.
  app.get('/api/workers/me/commission-policy', (req, res, next) => {
    const user = requireUser(req, res);
    if (!user) return;
    if (user.role !== 'WORKER') return res.status(403).json({ success: false, message: 'این بخش فقط برای متخصص است.' });
    next();
  }, noQuery, read);
  app.get('/api/admin/commission-policy', requireAdmin, noQuery, read);
  app.put('/api/admin/commission-policy', requireAdmin, noQuery, (req, res) => {
    try {
      const result = policy.publish(req.body);
      if (result.code === 'invalid') return res.status(400).json({ success: false, message: 'درصد باید عددی از صفر تا صد با حداکثر دو رقم اعشار باشد؛ نسخه جاری نیز لازم است.' });
      if (result.code === 'conflict') return res.status(409).json({ success: false, message: 'درصد قبلاً تغییر کرده است. مقدار جدید را بازخوانی کنید.', policy: result.policy });
      return res.json({ success: true, policy: result.policy });
    } catch {
      return res.status(500).json({ success: false, message: 'ذخیره درصد کمیسیون انجام نشد. دوباره تلاش کنید.' });
    }
  });
}

module.exports = { registerCommissionRoutes };
