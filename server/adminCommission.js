'use strict';

let commissionPolicy = null;
let commissionBusy = false;
function commissionMessage(text) { document.getElementById('commissionMessage').textContent = text; }
function commissionControls() {
  document.getElementById('commissionRefresh').disabled = commissionBusy;
  document.getElementById('commissionSave').disabled = commissionBusy || !commissionPolicy;
  document.getElementById('commissionRate').disabled = commissionBusy || !commissionPolicy;
}
function validCommissionPolicy(value) {
  return value && Number.isSafeInteger(value.version) && value.version >= 0 &&
    typeof value.ratePercent === 'number' && Number.isFinite(value.ratePercent) && value.ratePercent >= 0 && value.ratePercent <= 100;
}
async function commissionRequest(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/admin/commission-policy', {
      method, headers: adminHeaders(), cache: 'no-store', signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) {
      adminToken = '';
      sessionStorage.removeItem('paksho_admin_token');
      return { expired: true };
    }
    const data = await response.json();
    return { response, data };
  } finally { clearTimeout(timer); }
}
async function loadAdminCommission() {
  if (commissionBusy) return;
  commissionBusy = true;
  commissionPolicy = null;
  commissionControls();
  commissionMessage('در حال دریافت درصد کمیسیون…');
  try {
    if (!adminToken) { commissionMessage('برای دریافت درصد، ابتدا وارد حساب مدیر شوید یا صفحه مدیریت را بازخوانی کنید.'); return; }
    const result = await commissionRequest('GET');
    if (result.expired) { commissionMessage('نشست مدیر پایان یافته است. برای ورود دوباره صفحه مدیریت را بازخوانی کنید.'); return; }
    if (!result.response.ok || !result.data.success || !validCommissionPolicy(result.data.policy)) throw new Error('invalid policy');
    commissionPolicy = result.data.policy;
    document.getElementById('commissionRate').value = String(commissionPolicy.ratePercent);
    commissionMessage('درصد جاری دریافت شد.');
  } catch {
    commissionMessage('درصد دریافت نشد. اتصال را بررسی کنید و دوباره بازخوانی کنید.');
  } finally { commissionBusy = false; commissionControls(); }
}
async function saveAdminCommission() {
  if (commissionBusy || !commissionPolicy) return;
  const raw = document.getElementById('commissionRate').value.trim()
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.');
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(raw) || Number(raw) > 100) {
    commissionMessage('درصد را از صفر تا صد، با حداکثر دو رقم اعشار وارد کنید.'); return;
  }
  const body = { ratePercent: Number(raw), expectedVersion: commissionPolicy.version };
  commissionBusy = true; commissionControls(); commissionMessage('در حال ذخیره…');
  try {
    const result = await commissionRequest('PUT', body);
    if (result.expired) {
      commissionPolicy = null;
      commissionMessage('نشست مدیر پایان یافته است. مقدار واردشده حفظ شد؛ دوباره وارد شوید.'); return;
    }
    if (result.response.status === 409) {
      commissionPolicy = null;
      commissionMessage('مدیر دیگری درصد را تغییر داده است. مقدار واردشده حفظ شد؛ پیش از ذخیره، درصد جاری را بازخوانی کنید.'); return;
    }
    if (!result.response.ok || !result.data.success || !validCommissionPolicy(result.data.policy)) throw new Error('save failed');
    commissionPolicy = result.data.policy;
    document.getElementById('commissionRate').value = String(commissionPolicy.ratePercent);
    commissionMessage('درصد کمیسیون ذخیره شد.');
  } catch {
    // The server may have committed before the connection failed. Read before retrying.
    commissionPolicy = null;
    commissionMessage('نتیجه ذخیره مشخص نشد. مقدار واردشده حفظ شد؛ برای بررسی نتیجه، بازخوانی کنید.');
  } finally { commissionBusy = false; commissionControls(); }
}
