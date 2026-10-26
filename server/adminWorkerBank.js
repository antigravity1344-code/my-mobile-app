'use strict';

function openWorkerManualTopup(worker, card) {
  if (card.querySelector('[data-manual-topup]')) return;
  const panel = document.createElement('section');
  panel.setAttribute('data-manual-topup', worker.id);
  panel.className = 'w-full space-y-3 bg-slate-900 p-4 rounded-xl';
  const title = document.createElement('h4'); title.textContent = 'ثبت واریز بررسی‌شده برای ' + (worker.name || worker.id);
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const form = document.createElement('form');
  function field(label, type, name) {
    const wrap = document.createElement('label'); wrap.textContent = label;
    const input = document.createElement('input'); input.type = type; input.name = name; input.required = true;
    input.className = 'block bg-slate-800 border p-2 rounded-xl'; wrap.append(input); form.append(wrap); return input;
  }
  const amount = field('مبلغ واریز', 'number', 'amount'); amount.min = '1'; amount.step = '1';
  const unitLabel = document.createElement('label'); unitLabel.textContent = 'واحد مبلغ (مطابق بدهی کیف پول)';
  const unit = document.createElement('select'); unit.name = 'currencyUnit';
  for (const value of ['تومان', 'ریال']) { const option = document.createElement('option'); option.value = value; option.textContent = value; unit.append(option); }
  unitLabel.append(unit); form.append(unitLabel);
  const paidOn = field('تاریخ واریز (میلادی)', 'date', 'paidOn');
  const tracking = field('شماره پیگیری بانکی', 'text', 'trackingNumber'); tracking.maxLength = 64;
  const note = field('توضیح بررسی واریز', 'text', 'note'); note.maxLength = 300;
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'تأیید و ثبت شارژ';
  const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = 'بازخوانی رسیدهای ثبت‌شده';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'بستن';
  const history = document.createElement('pre'); history.className = 'whitespace-pre-wrap';
  form.append(submit); panel.append(title, status, form, reload, history, close); card.append(panel);
  let busy = false;
  const url = '/api/admin/workers/' + encodeURIComponent(worker.id) + '/wallet/manual-topups';
  async function request(method, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { method, headers: adminHeaders(), cache: 'no-store', signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'درخواست انجام نشد.');
      return data;
    } finally { clearTimeout(timer); }
  }
  reload.addEventListener('click', async () => {
    if (busy) return;
    busy = true; reload.disabled = submit.disabled = true;
    try {
      const data = await request('GET');
      history.textContent = data.receipts.map(r => r.trackingNumber + ' | ' + r.amount + ' ' + r.currencyUnit + ' | ' + r.paidOn).join('\n') || 'رسیدی ثبت نشده است.';
      status.textContent = 'رسیدها بازخوانی شدند؛ پیش از ثبت دوباره شماره پیگیری را بررسی کنید.';
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; reload.disabled = submit.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; reload.disabled = submit.disabled = true;
    for (const input of [amount, unit, paidOn, tracking, note]) input.disabled = true;
    status.textContent = 'در حال ثبت…';
    try {
      const data = await request('POST', { amount: Number(amount.value), currencyUnit: unit.value, paidOn: paidOn.value, trackingNumber: tracking.value, note: note.value });
      status.textContent = 'شارژ ثبت شد؛ شماره پیگیری: ' + data.receipt.trackingNumber;
      form.reset();
    } catch (error) { status.textContent = error.message + ' اطلاعات فرم محفوظ است؛ رسیدها را بازخوانی کنید. شماره پیگیری را برای تکرار درخواست تغییر ندهید.'; }
    finally { busy = false; reload.disabled = submit.disabled = false; for (const input of [amount, unit, paidOn, tracking, note]) input.disabled = false; }
  });
  close.addEventListener('click', () => { if (!busy) panel.remove(); });
}

function openWorkerBankReset(worker, card) {
  if (card.querySelector('[data-bank-reset]')) return;
  const panel = document.createElement('section');
  panel.setAttribute('data-bank-reset', worker.id);
  panel.className = 'w-full space-y-3 bg-slate-900 p-4 rounded-xl';
  const title = document.createElement('h4'); title.textContent = 'بازنشانی رمز شبا: ' + (worker.name || 'متخصص');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const reasonLabel = document.createElement('label'); reasonLabel.textContent = 'دلیل بازنشانی (الزامی)';
  const reason = document.createElement('textarea'); reason.maxLength = 500; reason.rows = 3;
  reason.className = 'block w-full bg-slate-800 border p-2 rounded-xl';
  reasonLabel.append(reason);
  const identityLabel = document.createElement('label');
  const identity = document.createElement('input'); identity.type = 'checkbox';
  identityLabel.append(identity, document.createTextNode(' هویت درخواست‌کننده را با مدارک ثبت‌شده همین حساب تطبیق دادم.'));
  const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = 'بازخوانی وضعیت';
  const submit = document.createElement('button'); submit.type = 'button'; submit.textContent = 'بازنشانی رمز و ارسال اعلان';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'بستن';
  for (const button of [reload, submit, close]) button.className = 'bg-sky-700 px-3 py-2 rounded-xl m-1';
  panel.append(title, status, reasonLabel, identityLabel, reload, submit, close); card.append(panel);
  const temporaryLabel = document.createElement('label'); temporaryLabel.textContent = 'رمز موقت؛ فقط این بار نمایش داده می‌شود';
  const temporary = document.createElement('input'); temporary.type = 'password'; temporary.readOnly = true; temporary.autocomplete = 'off';
  temporaryLabel.append(temporary);
  const reveal = document.createElement('button'); reveal.type = 'button'; reveal.textContent = 'نمایش رمز موقت'; reveal.disabled = true;
  panel.append(temporaryLabel, reveal);
  let expiryTimer;
  function clearTemporary() { clearTimeout(expiryTimer); temporary.value = ''; temporary.type = 'password'; reveal.disabled = true; }
  reveal.addEventListener('click', () => { temporary.type = temporary.type === 'password' ? 'text' : 'password'; });
  let version = null, busy = false, retired = false;
  function controls() { submit.disabled = busy || version === null; reload.disabled = busy; reason.disabled = busy; identity.disabled = busy; }
  async function request(suffix, method, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/admin/workers/' + encodeURIComponent(worker.id) + suffix, {
        method, headers: adminHeaders(), cache: 'no-store', signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'درخواست انجام نشد؛ وضعیت را بازخوانی کنید.');
      return data;
    } finally { clearTimeout(timer); }
  }
  async function load() {
    if (busy || retired) return; busy = true; version = null; controls(); status.textContent = 'در حال دریافت…';
    clearTemporary();
    try {
      const result = await request('/bank-details', 'GET');
      if (retired) return;
      if (!Number.isSafeInteger(result.bankDetails?.version) || result.bankDetails.version < 0) throw new Error('پاسخ معتبر دریافت نشد.');
      version = result.bankDetails.version;
      status.textContent = 'شبای پوشیده: ' + (result.bankDetails.bankShebaMasked || 'ثبت نشده') +
        '؛ رمز ' + (result.bankDetails.hasPin ? 'دارد' : 'ندارد') + '؛ بازنشانی، شبا و وضعیت تأیید حساب را تغییر نمی‌دهد.';
    } catch (error) { if (!retired) status.textContent = error.message; }
    finally { busy = false; if (!retired) controls(); }
  }
  async function reset() {
    if (busy || retired || version === null) return;
    if (!identity.checked || reason.value.trim().length < 5) {
      status.textContent = 'تطبیق مدارک و دلیل روشن (حداقل ۵ نویسه) لازم است.'; return;
    }
    const expectedVersion = version;
    busy = true; controls(); status.textContent = 'در حال بازنشانی…';
    try {
      clearTemporary();
      const result = await request('/bank-pin/reset', 'POST', { reason: reason.value.trim(), identityVerified: true, expectedVersion });
      if (retired) return;
      if (!/^\d{6}$/.test(result.temporaryPin) || !Number.isFinite(Date.parse(result.bankDetails?.temporaryExpiresAt))) throw new Error('رمز موقت دریافت نشد؛ پیش از تکرار وضعیت را بازخوانی کنید.');
      temporary.value = result.temporaryPin; reveal.disabled = false;
      expiryTimer = setTimeout(clearTemporary, Math.max(0, Date.parse(result.bankDetails.temporaryExpiresAt) - Date.now()));
      expiryTimer?.unref?.();
      reason.value = ''; identity.checked = false;
      status.textContent = 'رمز بازنشانی و اعلان ثبت شد. رمز موقت را فقط به صاحب هویت تأییدشده تحویل دهید؛ ده دقیقه معتبر است و متخصص باید آن را به رمز شخصی تغییر دهد.';
    } catch (error) { if (!retired) status.textContent = error.message; }
    finally { version = null; busy = false; if (!retired) controls(); }
  }
  reload.addEventListener('click', load); submit.addEventListener('click', reset);
  close.addEventListener('click', () => { retired = true; clearTemporary(); panel.remove(); });
  void load();
}
