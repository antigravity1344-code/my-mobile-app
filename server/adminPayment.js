'use strict';

let paymentSettings = null;
let paymentBusy = false;

function paymentMessage(text) {
  document.getElementById('paymentMessage').textContent = text;
}

function paymentControls() {
  const ready = Boolean(paymentSettings);
  document.getElementById('paymentRefresh').disabled = paymentBusy;
  document.getElementById('paymentSave').disabled = paymentBusy || !ready;
  for (const id of ['paymentMerchantId', 'paymentSettlementLabel', 'paymentSettlementReference', 'paymentConnectionSecret', 'paymentClearSecret']) {
    document.getElementById(id).disabled = paymentBusy || !ready;
  }
}

function validPaymentSettings(value) {
  const account = value && value.settlementAccount;
  return Boolean(value)
    && Number.isSafeInteger(value.version) && value.version >= 0
    && (value.providerId === null || typeof value.providerId === 'string')
    && Array.isArray(value.availableProviders)
    && value.availableProviders.every((item) => item && typeof item.id === 'string')
    && (value.merchantId === null || typeof value.merchantId === 'string')
    && account && (account.label === null || typeof account.label === 'string')
    && (account.reference === null || typeof account.reference === 'string')
    && typeof account.verified === 'boolean'
    && typeof value.hasConnectionSecret === 'boolean'
    && typeof value.connectionReady === 'boolean'
    && typeof value.topupEnabled === 'boolean'
    && !Object.hasOwn(value, 'connectionSecret')
    && !Object.hasOwn(value, 'secretCiphertext');
}

function blankToNull(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePaymentToken(value) {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function paymentStatusText(settings) {
  const providers = settings.availableProviders.length
    ? settings.availableProviders.map((item) => item.id).join('، ')
    : 'هنوز هیچ درگاهی پیاده‌سازی نشده است';
  const secret = settings.hasConnectionSecret ? 'رمز اتصال ذخیره شده و نمایش داده نمی‌شود.' : 'رمز اتصال ذخیره نشده است.';
  const verified = settings.settlementAccount.verified
    ? 'حساب تسویه نزد درگاه تأیید شده است.'
    : 'حساب تسویه نزد درگاه تأیید نشده است.';
  const charge = settings.topupEnabled
    ? 'تنظیمات اتصال برای بررسی سرور کامل است، ولی شارژ از درخواست مرورگر انجام نمی‌شود.'
    : 'شارژ واقعی غیرفعال است.';
  return `درگاه‌های قابل انتخاب: ${providers}. ${secret} ${verified} ${charge}`;
}

async function paymentRequest(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/admin/payment-settings', {
      method,
      headers: adminHeaders(),
      cache: 'no-store',
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) {
      adminToken = '';
      sessionStorage.removeItem('paksho_admin_token');
      return { expired: true };
    }
    const data = await response.json();
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function fillPaymentForm(settings) {
  document.getElementById('paymentMerchantId').value = settings.merchantId || '';
  document.getElementById('paymentSettlementLabel').value = settings.settlementAccount.label || '';
  document.getElementById('paymentSettlementReference').value = settings.settlementAccount.reference || '';
  document.getElementById('paymentConnectionSecret').value = '';
  document.getElementById('paymentClearSecret').checked = false;
  document.getElementById('paymentState').textContent = paymentStatusText(settings);
}

async function loadAdminPayment() {
  if (paymentBusy) return;
  paymentBusy = true;
  paymentSettings = null;
  paymentControls();
  paymentMessage('در حال دریافت تنظیمات پرداخت…');
  try {
    if (!adminToken) {
      paymentMessage('برای دریافت تنظیمات، ابتدا وارد حساب مدیر شوید یا صفحه مدیریت را بازخوانی کنید.');
      return;
    }
    const result = await paymentRequest('GET');
    if (result.expired) {
      paymentMessage('نشست مدیر پایان یافته است. برای ورود دوباره صفحه مدیریت را بازخوانی کنید.');
      return;
    }
    if (!result.response.ok || !result.data.success || !validPaymentSettings(result.data.settings)) throw new Error('invalid settings');
    paymentSettings = result.data.settings;
    fillPaymentForm(paymentSettings);
    paymentMessage('تنظیمات پرداخت دریافت شد.');
  } catch {
    paymentMessage('تنظیمات پرداخت دریافت نشد. اتصال را بررسی کنید و دوباره بازخوانی کنید.');
  } finally {
    paymentBusy = false;
    paymentControls();
  }
}

async function saveAdminPayment() {
  if (paymentBusy || !paymentSettings) return;
  const merchantId = blankToNull(normalizePaymentToken(document.getElementById('paymentMerchantId').value));
  const settlementLabel = blankToNull(document.getElementById('paymentSettlementLabel').value);
  const settlementReference = blankToNull(normalizePaymentToken(document.getElementById('paymentSettlementReference').value));
  if (merchantId && !/^[A-Za-z0-9_-]{1,64}$/.test(merchantId)) {
    paymentMessage('شناسه پذیرنده را با حروف انگلیسی، عدد، خط تیره یا زیرخط وارد کنید.');
    return;
  }
  if (settlementReference && !/^[A-Za-z0-9-]{1,40}$/.test(settlementReference)) {
    paymentMessage('شماره حساب اعلام‌شده را بدون فاصله و با حروف انگلیسی یا عدد وارد کنید.');
    return;
  }
  if (settlementLabel && settlementLabel.length > 80) {
    paymentMessage('عنوان حساب تسویه طولانی است.');
    return;
  }
  const secret = document.getElementById('paymentConnectionSecret').value;
  const clearSecret = document.getElementById('paymentClearSecret').checked;
  if (secret.length > 4096) {
    paymentMessage('اطلاعات اتصال طولانی‌تر از حد مجاز است.');
    return;
  }
  const body = {
    expectedVersion: paymentSettings.version,
    providerId: paymentSettings.providerId,
    merchantId,
    settlementLabel,
    settlementReference,
  };
  if (clearSecret) body.connectionSecret = null;
  else if (secret) body.connectionSecret = secret;
  paymentBusy = true;
  paymentControls();
  paymentMessage('در حال ذخیره…');
  try {
    const result = await paymentRequest('PUT', body);
    if (result.expired) {
      paymentSettings = null;
      paymentMessage('نشست مدیر پایان یافته است. مقدار واردشده حفظ شد؛ دوباره وارد شوید.');
      return;
    }
    if (result.response.status === 409) {
      paymentSettings = null;
      paymentMessage('مدیر دیگری تنظیمات را تغییر داده است. مقدار واردشده حفظ شد؛ پیش از ذخیره، تنظیمات را بازخوانی کنید.');
      return;
    }
    if (result.response.status === 400 && result.data.code === 'PROVIDER_NOT_IMPLEMENTED') {
      paymentMessage(result.data.message);
      return;
    }
    if (!result.response.ok || !result.data.success || !validPaymentSettings(result.data.settings)) throw new Error('save failed');
    paymentSettings = result.data.settings;
    fillPaymentForm(paymentSettings);
    paymentMessage('تنظیمات پرداخت ذخیره شد. شارژ واقعی تا اتصال تأییدشده درگاه غیرفعال می‌ماند.');
  } catch {
    paymentSettings = null;
    paymentMessage('نتیجه ذخیره مشخص نشد. مقدار واردشده حفظ شد؛ برای بررسی نتیجه، بازخوانی کنید.');
  } finally {
    paymentBusy = false;
    paymentControls();
  }
}
