'use strict';

let offerPolicy = null;
let offerPolicyBusy = false;
const OFFER_POLICY_FIELDS = ['offerPolicyMin', 'offerPolicyMax', 'offerPolicyGold'];
function offerPolicyMessage(text) { document.getElementById('offerPolicyMessage').textContent = text; }
function offerPolicyControls() {
  document.getElementById('offerPolicyRefresh').disabled = offerPolicyBusy;
  document.getElementById('offerPolicySave').disabled = offerPolicyBusy || !offerPolicy;
  for (const id of OFFER_POLICY_FIELDS) document.getElementById(id).disabled = offerPolicyBusy || !offerPolicy;
}
function validOfferPolicy(value) {
  return value && Number.isSafeInteger(value.version) && value.version >= 0 &&
    [value.minPercent, value.maxPercent, value.goldMaxPercent].every((n) => Number.isSafeInteger(n) && n >= 1 && n <= 300);
}
function showOfferPolicy() {
  document.getElementById('offerPolicyMin').value = String(offerPolicy.minPercent);
  document.getElementById('offerPolicyMax').value = String(offerPolicy.maxPercent);
  document.getElementById('offerPolicyGold').value = String(offerPolicy.goldMaxPercent);
}
function offerPolicyNumber(id) {
  const raw = document.getElementById(id).value.trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return /^\d{1,3}$/.test(raw) ? Number(raw) : null;
}
async function offerPolicyRequest(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/admin/offer-policy', {
      method, headers: adminHeaders(), cache: 'no-store', signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) {
      adminToken = '';
      sessionStorage.removeItem('paksho_admin_token');
      return { expired: true };
    }
    return { response, data: await response.json() };
  } finally { clearTimeout(timer); }
}
async function loadAdminOfferPolicy() {
  if (offerPolicyBusy) return;
  offerPolicyBusy = true;
  offerPolicy = null;
  offerPolicyControls();
  offerPolicyMessage('در حال دریافت تنظیم…');
  try {
    if (!adminToken) { offerPolicyMessage('ابتدا وارد حساب مدیر شوید یا صفحه مدیریت را بازخوانی کنید.'); return; }
    const result = await offerPolicyRequest('GET');
    if (result.expired) { offerPolicyMessage('نشست مدیر پایان یافته است. برای ورود دوباره صفحه مدیریت را بازخوانی کنید.'); return; }
    if (!result.response.ok || !result.data.success || !validOfferPolicy(result.data.policy)) throw new Error('invalid policy');
    offerPolicy = result.data.policy;
    showOfferPolicy();
    offerPolicyMessage('تنظیم جاری دریافت شد.');
  } catch {
    offerPolicyMessage('تنظیم دریافت نشد. اتصال را بررسی کنید و دوباره بازخوانی کنید.');
  } finally { offerPolicyBusy = false; offerPolicyControls(); }
}
async function saveAdminOfferPolicy() {
  if (offerPolicyBusy || !offerPolicy) return;
  const minPercent = offerPolicyNumber('offerPolicyMin');
  const maxPercent = offerPolicyNumber('offerPolicyMax');
  const goldMaxPercent = offerPolicyNumber('offerPolicyGold');
  if ([minPercent, maxPercent, goldMaxPercent].some((n) => n === null || n < 1 || n > 300) || minPercent > maxPercent || maxPercent > goldMaxPercent) {
    offerPolicyMessage('عددهای صحیح ۱ تا ۳۰۰ وارد کنید: حداقل ≤ حداکثر عادی ≤ حداکثر طلایی.'); return;
  }
  const body = { minPercent, maxPercent, goldMaxPercent, expectedVersion: offerPolicy.version };
  offerPolicyBusy = true; offerPolicyControls(); offerPolicyMessage('در حال ذخیره…');
  try {
    const result = await offerPolicyRequest('PUT', body);
    if (result.expired) {
      offerPolicy = null;
      offerPolicyMessage('نشست مدیر پایان یافته است. مقدارهای واردشده حفظ شد؛ دوباره وارد شوید.'); return;
    }
    if (result.response.status === 409) {
      offerPolicy = null;
      offerPolicyMessage('مدیر دیگری تنظیم را تغییر داده است. مقدارهای واردشده حفظ شد؛ پیش از ذخیره، تنظیم جاری را بازخوانی کنید.'); return;
    }
    if (!result.response.ok || !result.data.success || !validOfferPolicy(result.data.policy)) throw new Error('save failed');
    offerPolicy = result.data.policy;
    showOfferPolicy();
    offerPolicyMessage('تنظیم قیمت پیشنهاد ذخیره شد.');
  } catch {
    offerPolicy = null;
    offerPolicyMessage('نتیجه ذخیره مشخص نشد. مقدارهای واردشده حفظ شد؛ برای بررسی نتیجه، بازخوانی کنید.');
  } finally { offerPolicyBusy = false; offerPolicyControls(); }
}

const OFFER_REPORT_FLAG_LABEL = {
  NEAR_MINIMUM_PRICE: 'قیمت نزدیک حداقل',
  REPEAT_CUSTOMER_LOW_PRICE: 'مشتری تکراری با قیمت پایین',
};
async function loadAdminOfferReport() {
  const list = document.getElementById('offerReportList');
  const message = document.getElementById('offerReportMessage');
  list.textContent = '';
  if (!adminToken) { message.textContent = 'ابتدا وارد حساب مدیر شوید.'; return; }
  message.textContent = 'در حال دریافت گزارش…';
  try {
    const response = await fetch('/api/admin/offer-report', { headers: adminHeaders(), cache: 'no-store' });
    if (response.status === 401) { message.textContent = 'نشست مدیر پایان یافته است. صفحه را بازخوانی کنید.'; return; }
    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.rows)) throw new Error('bad report');
    if (!data.rows.length) { message.textContent = 'موردی با این الگو پیدا نشد.'; return; }
    message.textContent = data.rows.length + ' متخصص پرچم‌دار.';
    for (const row of data.rows) {
      const item = document.createElement('li');
      item.className = 'bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm';
      const flags = (Array.isArray(row.flags) ? row.flags : []).map((flag) => OFFER_REPORT_FLAG_LABEL[flag] || 'پرچم ناشناخته').join('، ');
      item.textContent = [
        String(row.workerName || 'بدون نام') + ' (' + String(row.workerPhone || '') + ')',
        'رزرو: ' + Number(row.bookings) + ' · میانگین: ' + Number(row.averagePercent) + '٪ تعرفه',
        'نزدیک حداقل: ' + Number(row.nearMinimumBookings) + ' · بیشترین رزرو یک مشتری: ' + Number(row.maxRepeatSameCustomer),
        flags,
      ].join(' — ');
      list.appendChild(item);
    }
  } catch {
    message.textContent = 'گزارش دریافت نشد. دوباره بازخوانی کنید.';
  }
}

let offerGlobalEnabled = null;
function showOfferGlobal() {
  const button = document.getElementById('offerGlobalToggle');
  document.getElementById('offerGlobalState').textContent = offerGlobalEnabled === null ? '' : (offerGlobalEnabled ? 'قابلیت برای کل شرکت روشن است.' : 'قابلیت برای کل شرکت خاموش است.');
  button.textContent = offerGlobalEnabled ? 'خاموش‌کردن برای کل شرکت' : 'روشن‌کردن برای کل شرکت';
  button.disabled = offerGlobalEnabled === null;
}
async function featureSwitchRequest(method, body) {
  const response = await fetch('/api/admin/feature-switches', {
    method, headers: adminHeaders(), cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) { adminToken = ''; sessionStorage.removeItem('paksho_admin_token'); return { expired: true }; }
  return { response, data: await response.json() };
}
async function loadAdminFeatureSwitches() {
  offerGlobalEnabled = null; showOfferGlobal();
  if (!adminToken) return;
  try {
    const result = await featureSwitchRequest('GET');
    if (result.expired || !result.response.ok || !result.data.success) return;
    offerGlobalEnabled = result.data.global.offers !== false;
    showOfferGlobal();
  } catch { /* وضعیت نامشخص می‌ماند؛ دکمه غیرفعال است */ }
}
async function toggleGlobalOffers() {
  if (offerGlobalEnabled === null) return;
  const wanted = !offerGlobalEnabled;
  document.getElementById('offerGlobalToggle').disabled = true;
  try {
    const result = await featureSwitchRequest('PUT', { scope: 'GLOBAL', feature: 'offers', enabled: wanted });
    if (result.expired || !result.response.ok || !result.data.success) throw new Error('failed');
    offerGlobalEnabled = result.data.global.offers !== false;
    showOfferGlobal();
  } catch {
    document.getElementById('offerGlobalState').textContent = 'تغییر انجام نشد یا نتیجه نامشخص است؛ بازخوانی کنید.';
    await loadAdminFeatureSwitches();
  }
}
async function toggleWorkerFeature(workerId, feature, enabled) {
  const key = 'feature:' + workerId + ':' + feature;
  if (adminActions.has(key)) return;
  adminActions.add(key);
  const message = document.getElementById('workersActionMessage');
  if (message) message.textContent = 'در حال انجام عملیات…';
  try {
    const result = await featureSwitchRequest('PUT', { scope: 'WORKER', workerId, feature, enabled });
    if (result.expired || !result.response.ok || !result.data.success) throw new Error('failed');
    if (message) message.textContent = enabled ? 'قابلیت برای این متخصص فعال شد.' : 'قابلیت برای این متخصص غیرفعال شد.';
    await loadAllData();
  } catch {
    if (message) message.textContent = 'نتیجه عملیات مشخص نیست؛ اطلاعات را بازخوانی و دوباره بررسی کنید.';
  } finally { adminActions.delete(key); }
}

// ------------------- حدود درخواست ساعت دلخواه مشتری (جدا از حدود متخصص) -------------------
let customerRequestPolicy = null;
let customerRequestPolicyBusy = false;
const CUSTOMER_REQUEST_POLICY_FIELDS = ['customerRequestMin', 'customerRequestMax'];
function customerRequestPolicyMessage(text) { document.getElementById('customerRequestPolicyMessage').textContent = text; }
function customerRequestPolicyControls() {
  document.getElementById('customerRequestPolicyRefresh').disabled = customerRequestPolicyBusy;
  document.getElementById('customerRequestPolicySave').disabled = customerRequestPolicyBusy || !customerRequestPolicy;
  for (const id of CUSTOMER_REQUEST_POLICY_FIELDS) document.getElementById(id).disabled = customerRequestPolicyBusy || !customerRequestPolicy;
}
function validCustomerRequestPolicy(value) {
  return value && Number.isSafeInteger(value.version) && value.version >= 0 &&
    [value.minPercent, value.maxPercent].every((n) => Number.isSafeInteger(n) && n >= 1 && n <= 300);
}
function showCustomerRequestPolicy() {
  document.getElementById('customerRequestMin').value = String(customerRequestPolicy.minPercent);
  document.getElementById('customerRequestMax').value = String(customerRequestPolicy.maxPercent);
}
async function customerRequestPolicyRequest(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/admin/customer-request-policy', {
      method, headers: adminHeaders(), cache: 'no-store', signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) {
      adminToken = '';
      sessionStorage.removeItem('paksho_admin_token');
      return { expired: true };
    }
    return { response, data: await response.json() };
  } finally { clearTimeout(timer); }
}
async function loadAdminCustomerRequestPolicy() {
  if (customerRequestPolicyBusy) return;
  customerRequestPolicyBusy = true;
  customerRequestPolicy = null;
  customerRequestPolicyControls();
  customerRequestPolicyMessage('در حال دریافت تنظیم…');
  try {
    if (!adminToken) { customerRequestPolicyMessage('ابتدا وارد حساب مدیر شوید یا صفحه مدیریت را بازخوانی کنید.'); return; }
    const result = await customerRequestPolicyRequest('GET');
    if (result.expired) { customerRequestPolicyMessage('نشست مدیر پایان یافته است. برای ورود دوباره صفحه مدیریت را بازخوانی کنید.'); return; }
    if (!result.response.ok || !result.data.success || !validCustomerRequestPolicy(result.data.policy)) throw new Error('invalid policy');
    customerRequestPolicy = result.data.policy;
    showCustomerRequestPolicy();
    customerRequestPolicyMessage('تنظیم جاری دریافت شد.');
  } catch {
    customerRequestPolicyMessage('تنظیم دریافت نشد. اتصال را بررسی کنید و دوباره بازخوانی کنید.');
  } finally { customerRequestPolicyBusy = false; customerRequestPolicyControls(); }
}
async function saveAdminCustomerRequestPolicy() {
  if (customerRequestPolicyBusy || !customerRequestPolicy) return;
  const minPercent = offerPolicyNumber('customerRequestMin');
  const maxPercent = offerPolicyNumber('customerRequestMax');
  if ([minPercent, maxPercent].some((n) => n === null || n < 1 || n > 300) || minPercent > maxPercent) {
    customerRequestPolicyMessage('عددهای صحیح ۱ تا ۳۰۰ وارد کنید: حداقل نباید از حداکثر بیشتر باشد.'); return;
  }
  const body = { minPercent, maxPercent, expectedVersion: customerRequestPolicy.version };
  customerRequestPolicyBusy = true; customerRequestPolicyControls(); customerRequestPolicyMessage('در حال ذخیره…');
  try {
    const result = await customerRequestPolicyRequest('PUT', body);
    if (result.expired) {
      customerRequestPolicy = null;
      customerRequestPolicyMessage('نشست مدیر پایان یافته است. مقدارهای واردشده حفظ شد؛ دوباره وارد شوید.'); return;
    }
    if (result.response.status === 409) {
      customerRequestPolicy = null;
      customerRequestPolicyMessage('مدیر دیگری تنظیم را تغییر داده است. مقدارهای واردشده حفظ شد؛ پیش از ذخیره، تنظیم جاری را بازخوانی کنید.'); return;
    }
    if (!result.response.ok || !result.data.success || !validCustomerRequestPolicy(result.data.policy)) throw new Error('save failed');
    customerRequestPolicy = result.data.policy;
    showCustomerRequestPolicy();
    customerRequestPolicyMessage('حدود درخواست دلخواه مشتری ذخیره شد.');
  } catch {
    customerRequestPolicy = null;
    customerRequestPolicyMessage('نتیجه ذخیره مشخص نشد. مقدارهای واردشده حفظ شد؛ برای بررسی نتیجه، بازخوانی کنید.');
  } finally { customerRequestPolicyBusy = false; customerRequestPolicyControls(); }
}
