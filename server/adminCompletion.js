'use strict';
let completionPolicy = null;
let completionBusy = false;
function completionMessage(message) { document.getElementById('completionMessage').textContent = message; }
function completionControls() {
  document.getElementById('completionRefresh').disabled = completionBusy;
  document.getElementById('completionSave').disabled = completionBusy || !completionPolicy;
  document.getElementById('completionMode').disabled = completionBusy || !completionPolicy;
}
async function completionRequest(url, method = 'GET', body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),15000);
  try {
    const response = await fetch(url,{method,headers:adminHeaders(),cache:'no-store',signal:controller.signal,
      ...(body ? {body:JSON.stringify(body)} : {})});
    if (response.status === 401) {adminToken='';sessionStorage.removeItem('paksho_admin_token');throw new Error('نشست مدیر پایان یافته؛ صفحه را بازخوانی کنید.');}
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'ذخیره انجام نشد؛ اطلاعات را بازخوانی کنید.');
    return data;
  } finally {clearTimeout(timer);}
}
function validCompletionPolicy(value) {
  return value && Number.isSafeInteger(value.version) && value.version >= 0 && ['customer_confirmation','worker_only'].includes(value.mode);
}
async function loadAdminCompletion() {
  if (completionBusy) return;
  completionBusy=true;completionPolicy=null;completionControls();completionMessage('در حال دریافت…');
  try {
    if (!adminToken) throw new Error('ابتدا وارد حساب مدیر شوید یا صفحه را بازخوانی کنید.');
    const data = await completionRequest('/api/admin/completion-policy');
    if (!validCompletionPolicy(data.policy)) throw new Error('پاسخ معتبر دریافت نشد.');
    completionPolicy=data.policy;document.getElementById('completionMode').value=data.policy.mode;
    completionMessage('سیاست جاری دریافت شد.');
  } catch(error) {completionMessage(error.message || 'اتصال برقرار نشد؛ دوباره بازخوانی کنید.');}
  finally {completionBusy=false;completionControls();}
}
async function saveAdminCompletion() {
  if (completionBusy || !completionPolicy) return;
  const body={mode:document.getElementById('completionMode').value,expectedVersion:completionPolicy.version};
  completionBusy=true;completionControls();completionMessage('در حال ذخیره…');
  try {
    const data=await completionRequest('/api/admin/completion-policy','PUT',body);
    if (!validCompletionPolicy(data.policy)) throw new Error('پاسخ معتبر دریافت نشد.');
    completionPolicy=data.policy;completionMessage('ذخیره شد. سیاست جدید برای درخواست‌های پایان کار بعدی اعمال می‌شود.');
  } catch(error) {
    completionPolicy=null;
    completionMessage((error.message || 'ارتباط قطع شد.') + ' نتیجه را پیش از تلاش مجدد بازخوانی کنید.');
  } finally {completionBusy=false;completionControls();}
}
async function decideAdminCompletion(order,approve,button) {
  if (button.disabled) return;
  button.disabled=true;
  try {
    await completionRequest('/api/admin/orders/'+encodeURIComponent(order.id)+'/completion-decision','PUT',{requestId:order.completion.requestId,approve});
    await loadAllData();
  } catch(error) {alert((error.message || 'ارتباط قطع شد.')+' سفارش را پیش از تلاش مجدد بازخوانی کنید.');}
  finally {button.disabled=false;}
}
