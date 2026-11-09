'use strict';

let tierLock = null;
let tierLockBusy = false;
const TIER_LOCK_FIELDS = ['tierLockSilver', 'tierLockGold', 'goldenRequestPercent', 'goldenRequestWindow'];
function tierLockMessage(text) { document.getElementById('tierLockMessage').textContent = text; }
function tierLockControls() {
  document.getElementById('tierLockRefresh').disabled = tierLockBusy;
  document.getElementById('tierLockSave').disabled = tierLockBusy || !tierLock;
  document.getElementById('goldenRequestSave').disabled = tierLockBusy || !tierLock;
  for (const id of TIER_LOCK_FIELDS) document.getElementById(id).disabled = tierLockBusy || !tierLock;
}
function validTierLock(value) {
  return value && Number.isSafeInteger(value.version) && value.version >= 0 && value.grayPercent === 100 &&
    [value.silverPercent, value.goldPercent].every((n) => Number.isSafeInteger(n) && n >= 100 && n <= 300) &&
    value.silverPercent <= value.goldPercent &&
    Number.isSafeInteger(value.goldenRequestPercent) && value.goldenRequestPercent >= 1 && value.goldenRequestPercent <= 300 &&
    Number.isSafeInteger(value.windowMinutes) && value.windowMinutes >= 1 && value.windowMinutes <= 1440;
}
function showTierLock() {
  document.getElementById('tierLockSilver').value = String(tierLock.silverPercent);
  document.getElementById('tierLockGold').value = String(tierLock.goldPercent);
  document.getElementById('goldenRequestPercent').value = String(tierLock.goldenRequestPercent);
  document.getElementById('goldenRequestWindow').value = String(tierLock.windowMinutes);
}
function tierLockNumber(id) {
  const raw = document.getElementById(id).value.trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return /^\d{1,4}$/.test(raw) ? Number(raw) : null;
}
async function tierLockRequest(method, body, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path || '/api/admin/tier-pricing', {
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
async function loadAdminTierLock() {
  if (tierLockBusy) return;
  tierLockBusy = true;
  tierLock = null;
  tierLockControls();
  tierLockMessage('در حال دریافت تنظیم…');
  try {
    if (!adminToken) { tierLockMessage('ابتدا وارد حساب مدیر شوید یا صفحه مدیریت را بازخوانی کنید.'); return; }
    const result = await tierLockRequest('GET');
    if (result.expired) { tierLockMessage('نشست مدیر پایان یافته است. برای ورود دوباره صفحه مدیریت را بازخوانی کنید.'); return; }
    if (!result.response.ok || !result.data.success || !validTierLock(result.data.policy)) throw new Error('invalid policy');
    tierLock = result.data.policy;
    showTierLock();
    tierLockMessage('تنظیم جاری دریافت شد.');
  } catch {
    tierLockMessage('تنظیم دریافت نشد. اتصال را بررسی کنید و دوباره بازخوانی کنید.');
  } finally { tierLockBusy = false; tierLockControls(); }
}
async function saveAdminTierLock() {
  if (tierLockBusy || !tierLock) return;
  const silverPercent = tierLockNumber('tierLockSilver');
  const goldPercent = tierLockNumber('tierLockGold');
  if (silverPercent === null || goldPercent === null || silverPercent < 100 || goldPercent > 300 || silverPercent > goldPercent) {
    tierLockMessage('نقره‌ای و طلایی باید عدد صحیح از ۱۰۰ تا ۳۰۰ باشند و نقره‌ای از طلایی بیشتر نباشد. خاکستری همیشه ۱۰۰ است.'); return;
  }
  const body = { silverPercent, goldPercent, expectedVersion: tierLock.version };
  tierLockBusy = true; tierLockControls(); tierLockMessage('در حال ذخیره…');
  try {
    const result = await tierLockRequest('PUT', body);
    if (result.expired) {
      tierLock = null;
      tierLockMessage('نشست مدیر پایان یافته است. مقدارهای واردشده حفظ شد؛ دوباره وارد شوید.'); return;
    }
    if (result.response.status === 409 && validTierLock(result.data.policy)) {
      tierLock = result.data.policy;
      showTierLock();
      tierLockMessage(result.data.message || 'تنظیم قبلاً تغییر کرده است. مقدار تازه نشان داده شد.');
      return;
    }
    if (!result.response.ok || !result.data.success || !validTierLock(result.data.policy)) {
      tierLockMessage(result.data && result.data.message ? result.data.message : 'ذخیره انجام نشد.');
      return;
    }
    tierLock = result.data.policy;
    showTierLock();
    tierLockMessage('ذخیره شد. سفارش‌های قبلی با قیمت قفل‌شدهٔ خودشان می‌مانند.');
  } catch {
    tierLockMessage('ذخیره انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.');
  } finally { tierLockBusy = false; tierLockControls(); }
}
async function saveAdminGoldenRequest() {
  if (tierLockBusy || !tierLock) return;
  const percent = tierLockNumber('goldenRequestPercent');
  const windowMinutes = tierLockNumber('goldenRequestWindow');
  if (percent === null || windowMinutes === null || percent < 1 || percent > 300 || windowMinutes < 1 || windowMinutes > 1440) {
    tierLockMessage('درصد درخواست طلایی از ۱ تا ۳۰۰ و مهلت از ۱ تا ۱۴۴۰ دقیقه است. این عدد از درصد طلایی سطح سفارش جداست.'); return;
  }
  tierLockBusy = true; tierLockControls(); tierLockMessage('در حال ذخیرهٔ درخواست طلایی…');
  try {
    const result = await tierLockRequest('PUT', { percent, windowMinutes, expectedVersion: tierLock.version }, '/api/admin/golden-request');
    if (result.expired) { tierLock = null; tierLockMessage('نشست مدیر پایان یافته است.'); return; }
    if (result.response.status === 409 && validTierLock(result.data.policy)) {
      tierLock = result.data.policy; showTierLock();
      tierLockMessage(result.data.message || 'تنظیم قبلاً تغییر کرده است.'); return;
    }
    if (!result.response.ok || !result.data.success || !validTierLock(result.data.policy)) {
      tierLockMessage(result.data && result.data.message ? result.data.message : 'ذخیره انجام نشد.'); return;
    }
    tierLock = result.data.policy; showTierLock();
    tierLockMessage('درخواست طلایی ذخیره شد. درصد سطح طلایی سفارش معمولی عوض نشد.');
  } catch {
    tierLockMessage('ذخیره انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.');
  } finally { tierLockBusy = false; tierLockControls(); }
}
