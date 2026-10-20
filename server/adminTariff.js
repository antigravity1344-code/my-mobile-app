'use strict';

// This script uses the dashboard's existing admin session and DOM helpers.
let tariffState = null;
let tariffAttempt = null;
let tariffBusy = false;
let tariffBlocked = false;
const tariffModelLabels = { fixed: 'برای هر خدمت', hourly: 'برای هر ساعت', count: 'برای هر عدد', area: 'برای هر متر مربع' };
// Display names mirror the existing app catalog; prices always come from the tariff.
const tariffServiceLabels = {
  home_unit_cleaning: 'نظافت داخل منزل / واحد', staircase_common_areas: 'نظافت راه‌پله و مشاعات',
  office_company_cleaning: 'نظافت دفاتر اداری و شرکت‌ها', sofa_carpet_washing: 'مبل‌شویی و فرش‌شویی در محل',
  hourly_labor: 'کارگر ساعتی', building_painting: 'نقاشی ساختمان',
};
const tariffInputClass = 'block w-full bg-slate-900 border border-slate-600 rounded-lg p-2 mt-1';

function tariffMessage(text) {
  document.getElementById('tariffMessage').textContent = text;
}

function tariffError(code) {
  const messages = {
    TARIFF_NOT_CONFIGURED: 'تعرفه این استقرار هنوز راه‌اندازی نشده است. راه‌اندازی اولیه باید توسط پشتیبان انجام شود.',
    TARIFF_DAMAGED: 'تعرفه معتبر قابل خواندن نیست. با پشتیبان تماس بگیرید.',
    TARIFF_INVALID: 'نسخه یا بازه اعتبار معتبر نیست؛ هم‌پوشانی با تعرفه منتشرشده را بررسی کنید.',
    REVISION_CONFLICT: 'تعرفه در جای دیگری تغییر کرده است. بازخوانی کنید و تغییر را دوباره بررسی کنید.',
    REQUEST_CONFLICT: 'این تلاش با اطلاعات قبلی سازگار نیست. تعرفه را بازخوانی کنید.',
    INPUT_INVALID: 'نرخ‌ها و زمان‌های واردشده را بررسی کنید.',
    IO_FAILED: 'ذخیره تعرفه تأیید نشد. نتیجه تلاش قبلی را دوباره بررسی کنید.',
  };
  return messages[code] || 'عملیات انجام نشد. اطلاعات را بازخوانی و دوباره بررسی کنید.';
}

function tariffControls() {
  document.querySelectorAll('#tariffContent fieldset').forEach((node) => {
    node.disabled = tariffBusy || tariffBlocked || !!tariffAttempt;
  });
  document.getElementById('tariffRefresh').disabled = tariffBusy || !!tariffAttempt;
  const retry = document.getElementById('tariffRetry');
  retry.hidden = !tariffAttempt;
  retry.disabled = tariffBusy;
}

function tariffUniqueId(prefix) {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (value) => value.toString(16).padStart(8, '0')).join('');
}

function tariffDate(value) {
  return value == null ? 'بدون پایان' : new Date(value).toLocaleString('fa-IR');
}

function tariffLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function tariffInstant(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error('تاریخ و ساعت را انتخاب کنید.');
  return date.toISOString();
}

function tariffRate(value) {
  const digits = value.trim().replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const amount = Number(digits);
  if (!/^\d+$/.test(digits) || !Number.isSafeInteger(amount)) throw new Error('نرخ باید عدد صحیح و نامنفی باشد.');
  return amount;
}

function tariffField(parent, label, id, type, value) {
  const wrapper = adminElement('label', 'block text-sm', label);
  const input = adminElement('input', tariffInputClass);
  input.id = id;
  input.type = type;
  input.value = value;
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}

function tariffVersionSelect(parent, label, id, versions) {
  const wrapper = adminElement('label', 'block text-sm', label);
  const select = adminElement('select', tariffInputClass);
  select.id = id;
  for (const version of versions) {
    const option = adminElement('option', '', (version.status === 'draft' ? 'پیش‌نویس' : 'منتشرشده') +
      ' از ' + tariffDate(version.validFrom) + ' تا ' + tariffDate(version.validTo) + ' — ' + version.id);
    option.value = version.id;
    select.append(option);
  }
  wrapper.append(select);
  parent.append(wrapper);
  return select;
}

function tariffAdjustments(parent, service) {
  const details = [];
  for (const item of service.surcharges) details.push('هزینه جانبی ' + item.id + ': ' + item.amount + ' ' + tariffState.currencyUnit);
  for (const item of service.factors) details.push('ضریب ' + item.id + ': ' + (item.basisPoints / 10000));
  for (const item of service.discounts) details.push('تخفیف ' + item.id + ': ' + (item.basisPoints / 100) + '٪');
  if (service.minQuantity != null) details.push('حداقل مقدار: ' + service.minQuantity);
  if (service.maxQuantity != null) details.push('حداکثر مقدار: ' + service.maxQuantity);
  if (details.length) parent.append(adminElement('p', 'text-xs text-slate-300', details.join(' | ')));
}

async function loadAdminTariff() {
  if (tariffBusy || tariffAttempt) return;
  tariffBusy = true;
  tariffControls();
  let feedback = 'ارتباط با سرور برقرار نشد. دوباره بازخوانی کنید.';
  try {
    if (!(await ensureAdmin())) return;
    const response = await fetch('/api/admin/tariff-versions', { headers: adminHeaders(), cache: 'no-store' });
    if (response.status === 401) {
      adminToken = '';
      sessionStorage.removeItem('paksho_admin_token');
      feedback = 'نشست مدیر پایان یافته است. برای ورود مجدد، بازخوانی کنید.';
      throw new Error(feedback);
    }
    const data = await response.json();
    if (!response.ok || !data.success) {
      feedback = tariffError(data.code);
      throw new Error(feedback);
    }
    tariffState = data;
    tariffBlocked = false;
    renderAdminTariff();
    tariffMessage('تعرفه خوانده شد. تغییر نرخ فقط پس از انتشار نسخه تازه مؤثر می‌شود.');
  } catch (error) {
    tariffState = null;
    tariffBlocked = true;
    document.getElementById('tariffContent').replaceChildren();
    tariffMessage(feedback);
  } finally {
    tariffBusy = false;
    tariffControls();
  }
}

function renderAdminTariff() {
  const container = document.getElementById('tariffContent');
  container.replaceChildren(adminElement('p', 'text-sm', 'شرکت: ' + tariffState.companyId + ' | واحد پول: ' + tariffState.currencyUnit));
  if (!tariffState.versions.length) {
    container.append(adminElement('p', 'text-sm', 'هنوز نسخه‌ای برای کپی‌کردن وجود ندارد. ثبت خدمات اولیه باید توسط پشتیبان انجام شود.'));
    return;
  }
  const editor = adminElement('fieldset', 'bg-slate-800 rounded-xl p-4 space-y-3');
  editor.append(adminElement('legend', 'font-bold', 'ساخت پیش‌نویس با نرخ‌های تازه'));
  const source = tariffVersionSelect(editor, 'نسخه مبنا', 'tariffSource', tariffState.versions);
  const rates = adminElement('div', 'space-y-3');
  editor.append(rates);
  const start = tariffField(editor, 'شروع اعتبار (به وقت دستگاه شما)', 'tariffDraftFrom', 'datetime-local', '');
  const end = tariffField(editor, 'پایان اعتبار، اختیاری (به وقت دستگاه شما)', 'tariffDraftTo', 'datetime-local', '');
  let rateInputs = [];
  function selectSource() {
    const version = tariffState.versions.find((item) => item.id === source.value);
    rates.replaceChildren();
    rateInputs = Object.entries(version.services).map(([id, service], index) => {
      const row = adminElement('div', 'border-b border-slate-700 pb-2');
      const input = tariffField(row, (tariffServiceLabels[id] || id) + ' — ' + tariffModelLabels[service.model] + ' (' + tariffState.currencyUnit + ')',
        'tariffRate' + index, 'text', String(service.rate));
      input.inputMode = 'numeric';
      tariffAdjustments(row, service);
      rates.append(row);
      return { id, input };
    });
    start.value = '';
    end.value = tariffLocalInput(version.validTo);
  }
  source.onchange = selectSource;
  source.value = tariffState.versions[tariffState.versions.length - 1].id;
  selectSource();
  editor.append(adminElement('p', 'text-xs text-slate-300', 'در این فرم فقط نرخ پایه تغییر می‌کند. سایر شرایط هر خدمت از نسخه مبنا حفظ می‌شوند.'));
  const save = adminElement('button', 'bg-sky-700 px-4 py-2 rounded-xl', 'ذخیره پیش‌نویس');
  save.id = 'tariffSave';
  save.type = 'button';
  save.onclick = () => {
    try {
      const version = JSON.parse(JSON.stringify(tariffState.versions.find((item) => item.id === source.value)));
      version.id = tariffUniqueId('tariff-');
      delete version.status;
      version.validFrom = tariffInstant(start.value);
      version.validTo = end.value ? tariffInstant(end.value) : null;
      for (const { id, input } of rateInputs) version.services[id].rate = tariffRate(input.value);
      beginAdminTariff('/api/admin/tariff-versions', { baseRevision: tariffState.revision, version }, 'پیش‌نویس ذخیره شد؛ هنوز منتشر نشده است.');
    } catch (error) { tariffMessage(error.message); }
  };
  editor.append(save);
  container.append(editor);

  const drafts = tariffState.versions.filter((version) => version.status === 'draft');
  if (!drafts.length) return;
  const publisher = adminElement('fieldset', 'bg-slate-800 rounded-xl p-4 space-y-3');
  publisher.append(adminElement('legend', 'font-bold', 'انتشار پیش‌نویس'));
  const draft = tariffVersionSelect(publisher, 'پیش‌نویس', 'tariffPublishVersion', drafts);
  const summary = adminElement('div', 'text-sm space-y-2');
  publisher.append(summary);
  const publishStart = tariffField(publisher, 'شروع انتشار (به وقت دستگاه شما)', 'tariffPublishFrom', 'datetime-local', '');
  const prior = tariffVersionSelect(publisher, 'تعرفه قبلی که در همین زمان پایان می‌یابد', 'tariffSupersede', tariffState.versions.filter((v) => v.status === 'published'));
  const none = adminElement('option', '', 'هیچ‌کدام؛ تعرفه قبلی تغییر نکند');
  none.value = '';
  prior.prepend(none);
  prior.value = '';
  function selectDraft() {
    const version = drafts.find((item) => item.id === draft.value);
    publishStart.value = tariffLocalInput(version.validFrom);
    summary.replaceChildren(adminElement('p', '', 'پایان اعتبار: ' + tariffDate(version.validTo)));
    for (const [id, service] of Object.entries(version.services)) {
      const row = adminElement('div', '', (tariffServiceLabels[id] || id) + ': ' + service.rate + ' ' + tariffState.currencyUnit + ' ' + tariffModelLabels[service.model]);
      tariffAdjustments(row, service);
      summary.append(row);
    }
  }
  draft.value = drafts[drafts.length - 1].id;
  draft.onchange = selectDraft;
  selectDraft();
  const publish = adminElement('button', 'bg-emerald-700 px-4 py-2 rounded-xl', 'انتشار پیش‌نویس');
  publish.id = 'tariffPublish';
  publish.type = 'button';
  publish.onclick = () => {
    try {
      const version = drafts.find((item) => item.id === draft.value);
      const validFrom = tariffInstant(publishStart.value);
      if (Date.parse(validFrom) <= Date.now()) throw new Error('شروع انتشار را در آینده انتخاب کنید.');
      const previous = tariffState.versions.find((item) => item.id === prior.value);
      const lines = Object.entries(version.services).map(([id, service]) => {
        const old = previous && previous.services[id];
        return (tariffServiceLabels[id] || id) + ': ' + (old ? 'قبلی ' + old.rate + '، تازه ' : '') + service.rate + ' ' + tariffState.currencyUnit + ' ' + tariffModelLabels[service.model];
      });
      const confirmation = 'انتشار از ' + tariffDate(validFrom) + ' (زمان دستگاه شما)\n' + lines.join('\n') +
        '\n' + (previous ? 'اعتبار تعرفه ' + previous.id + ' در همین زمان پایان می‌یابد.' : 'تعرفه قبلی تغییر نمی‌کند.') + '\nتأیید می‌کنید؟';
      if (!window.confirm(confirmation)) return;
      beginAdminTariff('/api/admin/tariff-versions/' + encodeURIComponent(version.id) + '/publish', {
        baseRevision: tariffState.revision, validFrom, validTo: version.validTo,
        supersede: previous ? { versionId: previous.id, validTo: validFrom } : null,
      }, 'پیش‌نویس منتشر شد. تعرفه از زمان تعیین‌شده مؤثر خواهد بود.');
    } catch (error) { tariffMessage(error.message); }
  };
  publisher.append(publish);
  container.append(publisher);
}

function beginAdminTariff(path, body, successMessage) {
  if (tariffBusy || tariffBlocked || tariffAttempt) return;
  tariffAttempt = { path, body: { ...body, requestId: tariffUniqueId('admin-') }, successMessage };
  retryAdminTariff();
}

async function retryAdminTariff() {
  if (tariffBusy || !tariffAttempt) return;
  tariffBusy = true;
  tariffControls();
  const attempt = tariffAttempt;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    if (!(await ensureAdmin())) return;
    const response = await fetch(attempt.path, {
      method: 'POST', headers: adminHeaders(), body: JSON.stringify(attempt.body), signal: controller.signal,
    });
    if (response.status === 401) {
      adminToken = '';
      sessionStorage.removeItem('paksho_admin_token');
      tariffMessage('نشست مدیر پایان یافته است. برای ورود و بررسی همان تلاش، دوباره بررسی نتیجه را بزنید.');
      return;
    }
    const data = await response.json();
    if (!response.ok || !data.success) {
      if (data.code === 'IO_FAILED' || response.status >= 500) throw new Error('نتیجه ذخیره قطعی نیست.');
      tariffAttempt = null;
      tariffBlocked = true;
      tariffMessage(tariffError(data.code) + ' پیش از تلاش تازه، بازخوانی کنید.');
      return;
    }
    tariffAttempt = null;
    tariffBusy = false;
    await loadAdminTariff();
    if (tariffState) tariffMessage(attempt.successMessage);
  } catch {
    tariffMessage('نتیجه ثبت مشخص نیست. با «بررسی نتیجه تلاش قبلی» همان درخواست را دوباره بررسی کنید.');
  } finally {
    clearTimeout(timeout);
    tariffBusy = false;
    tariffControls();
  }
}
