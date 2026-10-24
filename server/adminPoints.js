'use strict';

// برگهٔ «قانون امتیاز» (D-72). از نشست مدیر و adminHeaders داشبورد استفاده می‌کند.
// همهٔ متن‌ها با textContent نوشته می‌شوند تا هیچ داده‌ای به HTML تبدیل نشود.
const pointsInputClass = 'block w-full bg-slate-900 border border-slate-600 rounded-lg p-2 mt-1';
let pointsBusy = false;

function pointsMessage(text) {
  document.getElementById('pointsMessage').textContent = text;
}

function pointsEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function pointsFa(value) {
  return Number(value || 0).toLocaleString('fa-IR');
}

function pointsDescribe(value) {
  const v = value || {};
  return (
    'مشتری: ' + pointsFa(v.customerAmount) + ' · متخصص: ' + pointsFa(v.workerAmount) +
    ' · جایزهٔ ۵ ستاره برای متخصص: ' + pointsFa(v.workerFiveStarBonus)
  );
}

function pointsField(parent, label, id, value) {
  const wrap = pointsEl('label', 'block text-sm', label);
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.dir = 'ltr';
  input.className = pointsInputClass;
  input.value = value == null ? '' : String(value);
  wrap.appendChild(input);
  parent.appendChild(wrap);
}

// همان قاعدهٔ سرور: عدد صحیح صفر یا بیشتر. صفر یعنی امتیازی داده نشود.
function pointsReadInt(id) {
  const raw = String(document.getElementById(id).value || '')
    .trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!/^\d{1,9}$/.test(raw)) return null;
  return Number(raw);
}

function renderAdminPoints(data) {
  const root = document.getElementById('pointsContent');
  root.textContent = '';
  const effective = data.effectiveEarn || null;
  const value = effective ? effective.value : null;

  const current = pointsEl('div', 'bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-1');
  current.appendChild(pointsEl('h4', 'font-bold', 'قانون فعلی'));
  current.appendChild(
    pointsEl(
      'p',
      'text-sm text-slate-300',
      !effective
        ? 'نسخهٔ فعال معتبر نیست؛ امتیازی داده نمی‌شود.'
        : effective.source === 'rule'
          ? 'نسخهٔ ' + pointsFa(effective.version) + ' ثبت‌شده توسط مدیر'
          : 'پیش‌فرض سامانه'
    )
  );
  if (value) current.appendChild(pointsEl('p', 'text-sm', pointsDescribe(value)));
  root.appendChild(current);

  const form = pointsEl('form', 'bg-slate-800 border border-slate-700 rounded-2xl p-4');
  const fieldset = pointsEl('fieldset', 'space-y-3');
  fieldset.appendChild(pointsEl('h4', 'font-bold', 'ثبت نسخهٔ جدید'));
  pointsField(fieldset, 'امتیاز مشتری برای هر سفارش موفق', 'pointsCustomer', value ? value.customerAmount || 0 : '');
  pointsField(fieldset, 'امتیاز متخصص برای هر سفارش موفق', 'pointsWorker', value ? value.workerAmount || 0 : '');
  pointsField(fieldset, 'امتیاز اضافهٔ متخصص وقتی مشتری ۵ ستاره بدهد', 'pointsFiveStar', value ? value.workerFiveStarBonus || 0 : '');

  const activeWrap = pointsEl('label', 'flex items-center gap-2 text-sm');
  const activeToggle = document.createElement('input');
  activeToggle.type = 'checkbox';
  activeToggle.id = 'pointsActive';
  activeToggle.checked = true;
  activeWrap.appendChild(activeToggle);
  activeWrap.appendChild(pointsEl('span', '', 'این نسخه فعال باشد (اگر غیرفعال باشد، پیش‌فرض سامانه به کار می‌رود)'));
  fieldset.appendChild(activeWrap);

  const submit = pointsEl('button', 'bg-emerald-700 px-4 py-2 rounded-xl', 'ثبت نسخهٔ جدید');
  submit.type = 'submit';
  fieldset.appendChild(submit);
  fieldset.disabled = pointsBusy;
  form.appendChild(fieldset);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAdminPoints();
  });
  root.appendChild(form);

  const list = pointsEl('div', 'bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-2');
  list.appendChild(pointsEl('h4', 'font-bold', 'نسخه‌های ثبت‌شده'));
  const versions = (Array.isArray(data.rules) ? data.rules : []).filter((rule) => rule.ruleKey === 'earn.orderCompleted').reverse();
  if (!versions.length) list.appendChild(pointsEl('p', 'text-sm text-slate-400', 'هنوز نسخه‌ای ثبت نشده است.'));
  for (const rule of versions) {
    list.appendChild(
      pointsEl(
        'p',
        'text-sm',
        'نسخهٔ ' + pointsFa(rule.version) + ' · ' + (rule.active ? 'فعال' : 'غیرفعال') + ' · ' +
          new Date(rule.createdAt).toLocaleString('fa-IR') + ' · ' + pointsDescribe(rule.value)
      )
    );
  }
  root.appendChild(list);
}

async function loadAdminPoints() {
  if (pointsBusy) return;
  try {
    if (!(await ensureAdmin())) return;
    pointsMessage('در حال بارگذاری…');
    const response = await fetch('/api/admin/point-rules', { headers: adminHeaders(), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.success) {
      pointsMessage('قانون امتیاز دریافت نشد. دوباره تلاش کنید.');
      return;
    }
    pointsMessage('');
    renderAdminPoints(data);
  } catch (error) {
    pointsMessage('ارتباط برقرار نشد. دوباره تلاش کنید.');
  }
}

async function submitAdminPoints() {
  if (pointsBusy) return;
  const customerAmount = pointsReadInt('pointsCustomer');
  const workerAmount = pointsReadInt('pointsWorker');
  const workerFiveStarBonus = pointsReadInt('pointsFiveStar');
  if ([customerAmount, workerAmount, workerFiveStarBonus].some((n) => n == null)) {
    pointsMessage('همهٔ عددها لازم‌اند و باید صحیح و صفر یا بیشتر باشند.');
    return;
  }
  const active = document.getElementById('pointsActive').checked;
  pointsBusy = true;
  pointsMessage('در حال ثبت…');
  try {
    if (!(await ensureAdmin())) return;
    const response = await fetch('/api/admin/point-rules', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ ruleKey: 'earn.orderCompleted', value: { customerAmount, workerAmount, workerFiveStarBonus }, active }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      pointsMessage('قانون ثبت نشد. عددها را بررسی کنید.');
      return;
    }
  } catch (error) {
    pointsMessage('ارتباط برقرار نشد. نتیجه را با بازخوانی بررسی کنید.');
    return;
  } finally {
    pointsBusy = false;
  }
  await loadAdminPoints();
  pointsMessage('نسخهٔ جدید ثبت شد. از سفارش‌های بعدی با همین عددها امتیاز داده می‌شود.');
}
