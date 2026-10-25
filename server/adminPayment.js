'use strict';

let paymentSettings = null;
let paymentBusy = false;
function paymentMessage(text) { document.getElementById('paymentMessage').textContent = text; }
function paymentControls() {
  document.getElementById('paymentRefresh').disabled = paymentBusy;
  document.getElementById('paymentSave').disabled = paymentBusy || !paymentSettings;
  document.getElementById('paymentProvider').disabled = paymentBusy || !paymentSettings;
  document.getElementById('paymentMerchantId').disabled = paymentBusy || !paymentSettings;
  document.getElementById('paymentSecret').disabled = paymentBusy || !paymentSettings;
  document.getElementById('paymentSettlementAccount').disabled = paymentBusy || !paymentSettings;
  document.getElementById('paymentSettlementConfirmed').disabled = paymentBusy || !paymentSettings;
}
function validPaymentSettings(value) {
  return value && Number.isSafeInteger(value.version) && value.version >= 0 &&
    (value.providerId === null || typeof value.providerId === 'string') &&
    typeof value.merchantId === 'string' && typeof value.secretConfigured === 'boolean' &&
    typeof value.settlementAccount === 'string' && typeof value.settlementConfirmed === 'boolean' &&
    typeof value.chargeEnabled === 'boolean' && JSON.stringify(value).indexOf('enc:v1:') === -1;
}
function fillPaymentProviders(providers, selected) {
  const select = document.getElementById('paymentProvider');
  select.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = providers && providers.length ? 'درگاه انتخاب نشده' : 'درگاه پیاده‌شده‌ای موجود نیست';
  select.appendChild(none);
  for (const item of providers || []) {
    if (!item || typeof item.id !== 'string' || typeof item.label !== 'string') continue;
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    select.appendChild(option);
  }
  select.value = selected && [...select.options].some(option => option.value === selected) ? selected : '';
}
async function paymentRequest(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/admin/payment-settings', {
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
function showPaymentSettings(settings, providers) {
  paymentSettings = settings;
  fillPaymentProviders(providers, settings.providerId);
  document.getElementById('paymentMerchantId').value = settings.merchantId;
  document.getElementById('paymentSecret').value = '';
  document.getElementById('paymentSettlementAccount').value = settings.settlementAccount;
  document.getElementById('paymentSettlementConfirmed').checked = settings.settlementConfirmed;
  document.getElementById('paymentChargeState').textContent = settings.chargeEnabled
    ? 'شارژ پس از تأیید درگاه فعال است.'
    : 'شارژ واقعی هنوز غیرفعال است.';
}
async function loadAdminPayment() {
  if (paymentBusy) return;
  paymentBusy = true;
  paymentSettings = null;
  paymentControls();
  paymentMessage('در حال دریافت تنظیمات پرداخت…');
  try {
    if (!adminToken) { paymentMessage('برای دریافت تنظیمات، ابتدا وارد حساب مدیر شوید یا صفحه مدیریت را بازخوانی کنید.'); return; }
    const result = await paymentRequest('GET');
    if (result.expired) { paymentMessage('نشست مدیر پایان یافته است. برای ورود دوباره صفحه مدیریت را بازخوانی کنید.'); return; }
    if (!result.response.ok || !result.data.success || !validPaymentSettings(result.data.settings)) throw new Error('invalid settings');
    showPaymentSettings(result.data.settings, result.data.providers);
    paymentMessage('تنظیمات پرداخت دریافت شد. کلید محرمانه نمایش داده نمی‌شود.');
  } catch {
    paymentMessage('تنظیمات دریافت نشد. اتصال را بررسی کنید و دوباره بازخوانی کنید.');
  } finally { paymentBusy = false; paymentControls(); }
}
async function saveAdminPayment() {
  if (paymentBusy || !paymentSettings) return;
  const secret = document.getElementById('paymentSecret').value;
  const body = {
    providerId: document.getElementById('paymentProvider').value,
    merchantId: document.getElementById('paymentMerchantId').value.trim(),
    settlementAccount: document.getElementById('paymentSettlementAccount').value.trim(),
    settlementConfirmed: document.getElementById('paymentSettlementConfirmed').checked,
    expectedVersion: paymentSettings.version,
  };
  if (secret) body.secret = secret;
  paymentBusy = true; paymentControls(); paymentMessage('در حال ذخیره…');
  try {
    const result = await paymentRequest('PUT', body);
    if (result.expired) {
      paymentSettings = null;
      paymentMessage('نشست مدیر پایان یافته است. مقدار واردشده حفظ شد؛ دوباره وارد شوید.'); return;
    }
    if (result.response.status === 409) {
      paymentSettings = null;
      paymentMessage('مدیر دیگری تنظیمات را تغییر داده است. مقدار واردشده حفظ شد؛ پیش از ذخیره بازخوانی کنید.'); return;
    }
    if (!result.response.ok || !result.data.success || !validPaymentSettings(result.data.settings)) throw new Error('save failed');
    showPaymentSettings(result.data.settings, result.data.providers);
    paymentMessage('تنظیمات پرداخت ذخیره شد. سوابق شارژ قبلی عوض نشد.');
  } catch {
    paymentSettings = null;
    paymentMessage('نتیجه ذخیره مشخص نشد. مقدار واردشده حفظ شد؛ برای بررسی نتیجه، بازخوانی کنید.');
  } finally { paymentBusy = false; paymentControls(); }
}
