function registerCompletionRoutes(app, {store, requireUser, requireAdmin, customerView, workerView}) {
  function send(res, result, view) {
    if (result.code !== 'ok') {
      const status = {missing:404, forbidden:403, invalid:400}[result.code] || 409;
      return res.status(status).json({success:false,code:result.code,message:'ثبت پایان کار انجام نشد؛ اطلاعات سفارش را بازخوانی کنید. در صورت اختلاف با پشتیبانی تماس بگیرید.'});
    }
    return res.json({success:true,order:view(result.order),completion:result.completion});
  }
  function safe(handler) { return (req,res) => {res.set('Cache-Control','no-store');try {
    if (Object.keys(req.query).length) return res.status(400).json({success:false,message:'پارامتر اضافی مجاز نیست.'});
    return handler(req,res);
  } catch { return res.status(500).json({success:false,message:'ذخیره انجام نشد؛ سفارش را بازخوانی کنید و دوباره تلاش کنید.'}); }}; }
  app.put('/api/orders/:orderId/complete', safe((req,res) => {
    const user = requireUser(req,res); if (!user) return;
    if (user.role !== 'WORKER' || !['ACTIVE','APPROVED'].includes(user.status)) return res.status(403).json({success:false});
    if (!req.body || !Object.hasOwn(req.body,'acceptanceKey')) return res.status(409).json({success:false,code:'CLIENT_UPDATE_REQUIRED',message:'برای ثبت ساعات و مبلغ پایان کار، برنامه را به‌روز کنید.'});
    return send(res,store.reportCompletion(req.params.orderId,user,req.body),workerView);
  }));
  app.put('/api/orders/:orderId/completion-response', safe((req,res) => {
    const user = requireUser(req,res); if (!user) return;
    if (user.role !== 'CUSTOMER') return res.status(403).json({success:false});
    return send(res,store.respondCompletion(req.params.orderId,user.id,req.body),customerView);
  }));
  app.put('/api/admin/orders/:orderId/completion-decision',requireAdmin,safe((req,res) => send(res,store.decideCompletion(req.params.orderId,req.body),order => ({...order,completion:store.completionFor(order)}))));
  app.get('/api/admin/completion-policy',requireAdmin,safe((req,res) => res.json({success:true,policy:store.completionPolicy.read()})));
  app.put('/api/admin/completion-policy',requireAdmin,safe((req,res) => {
    const result = store.completionPolicy.publish(req.body);
    if (result.code !== 'ok') return res.status(result.code === 'invalid' ? 400 : 409).json({success:false,code:result.code,message:'سیاست معتبر نیست یا هم‌زمان تغییر کرده است. مقدار جاری را بازخوانی کنید.'});
    return res.json({success:true,policy:result.policy});
  }));
}
module.exports = {registerCompletionRoutes};
