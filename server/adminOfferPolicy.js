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
