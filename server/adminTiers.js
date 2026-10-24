'use strict';

// برگهٔ «قانون درجه‌ها» برای متخصص‌ها (D-71). از نشست مدیر و adminHeaders داشبورد استفاده می‌کند.
// همهٔ متن‌ها با textContent نوشته می‌شوند تا هیچ داده‌ای به HTML تبدیل نشود.
const tierNames = { gray: 'خاکستری', silver: 'نقره‌ای', gold: 'طلایی', gold_plus: 'طلایی پلاس' };
const tierInputClass = 'block w-full bg-slate-900 border border-slate-600 rounded-lg p-2 mt-1';
let tierBusy = false;

function tierMessage(text) {
  document.getElementById('tierMessage').textContent = text;
}

function tierEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function tierFa(value) {
  return Number(value || 0).toLocaleString('fa-IR');
}

function tierLevels(value) {
  return value && Array.isArray(value.levels) ? value.levels : [];
}

function tierLevel(value, key) {
  return tierLevels(value).find((level) => level && level.tierKey === key) || null;
}

function tierDescribe(value) {
  const parts = tierLevels(value)
    .filter((level) => level && level.tierKey !== 'gray')
    .map((level) => {
      let text = (tierNames[level.tierKey] || level.tierKey) + ': حداقل ' + tierFa(level.minCompleted) + ' سفارش موفق';
      if (level.minPoints) text += ' و ' + tierFa(level.minPoints) + ' امتیاز';
      if (level.minRating) text += ' و میانگین ستارهٔ حداقل ' + Number(level.minRating).toLocaleString('fa-IR');
      return text;
    });
  return parts.length ? parts.join(' · ') : 'فقط خاکستری';
}

function tierField(parent, label, id, value, optional) {
  const wrap = tierEl('label', 'block text-sm', label + (optional ? ' (اختیاری)' : ''));
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.dir = 'ltr';
  input.className = tierInputClass;
  input.value = value == null || (optional && value === 0) ? '' : String(value);
  wrap.appendChild(input);
  parent.appendChild(wrap);
  return input;
}

// حداقل میانگین ستاره: خالی یعنی بدون شرط (صفر)؛ وگرنه ۰ تا ۵ با حداکثر یک رقم اعشار (اصلاح D-71).
function tierReadRating(id) {
  const raw = String(document.getElementById(id).value || '')
    .trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫,]/g, '.');
  if (raw === '') return 0;
  if (!/^\d(\.\d)?$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 0 && value <= 5 ? value : null;
}

// همان قاعدهٔ parseTierRule سرور: عدد صحیح نامنفی. خالی برای فیلد اختیاری یعنی صفر.
function tierReadInt(id, optional) {
  const raw = String(document.getElementById(id).value || '')
    .trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (raw === '') return optional ? 0 : null;
  if (!/^\d{1,9}$/.test(raw)) return null;
  return Number(raw);
}

function renderAdminTiers(data) {
  const root = document.getElementById('tierContent');
  root.textContent = '';
  const effective = data.effectiveWorkerTier || null;
  const value = effective ? effective.value : null;

  const current = tierEl('div', 'bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-1');
  current.appendChild(tierEl('h4', 'font-bold', 'قانون فعلی'));
  current.appendChild(
    tierEl(
      'p',
      'text-sm text-slate-300',
      effective && effective.source === 'rule' ? 'نسخهٔ ' + tierFa(effective.version) + ' ثبت‌شده توسط مدیر' : 'پیش‌فرض سامانه'
    )
  );
  current.appendChild(tierEl('p', 'text-sm', 'خاکستری: پایه · ' + tierDescribe(value)));
  root.appendChild(current);

  const form = tierEl('form', 'bg-slate-800 border border-slate-700 rounded-2xl p-4');
  const fieldset = tierEl('fieldset', 'space-y-3');
  fieldset.appendChild(tierEl('h4', 'font-bold', 'ثبت نسخهٔ جدید'));
  const silver = tierLevel(value, 'silver');
  const gold = tierLevel(value, 'gold');
  const plus = tierLevel(value, 'gold_plus');
  tierField(fieldset, 'نقره‌ای: حداقل تعداد سفارش موفق', 'tierSilverCompleted', silver ? silver.minCompleted : '', false);
  tierField(fieldset, 'نقره‌ای: حداقل امتیاز', 'tierSilverPoints', silver ? silver.minPoints : 0, true);
  tierField(fieldset, 'نقره‌ای: حداقل میانگین ستاره (۰ تا ۵)', 'tierSilverRating', silver ? silver.minRating : 0, true);
  tierField(fieldset, 'طلایی: حداقل تعداد سفارش موفق', 'tierGoldCompleted', gold ? gold.minCompleted : '', false);
  tierField(fieldset, 'طلایی: حداقل امتیاز', 'tierGoldPoints', gold ? gold.minPoints : 0, true);
  tierField(fieldset, 'طلایی: حداقل میانگین ستاره (۰ تا ۵)', 'tierGoldRating', gold ? gold.minRating : 0, true);

  const plusWrap = tierEl('label', 'flex items-center gap-2 text-sm');
  const plusToggle = document.createElement('input');
  plusToggle.type = 'checkbox';
  plusToggle.id = 'tierPlusEnabled';
  plusToggle.checked = !!plus;
  plusWrap.appendChild(plusToggle);
  plusWrap.appendChild(tierEl('span', '', 'طلایی پلاس هم فعال باشد'));
  fieldset.appendChild(plusWrap);
  const plusBox = tierEl('div', 'space-y-3');
  tierField(plusBox, 'طلایی پلاس: حداقل تعداد سفارش موفق', 'tierPlusCompleted', plus ? plus.minCompleted : '', false);
  tierField(plusBox, 'طلایی پلاس: حداقل امتیاز', 'tierPlusPoints', plus ? plus.minPoints : 0, true);
  tierField(plusBox, 'طلایی پلاس: حداقل میانگین ستاره (۰ تا ۵)', 'tierPlusRating', plus ? plus.minRating : 0, true);
  plusBox.hidden = !plus;
  plusToggle.addEventListener('change', () => {
    plusBox.hidden = !plusToggle.checked;
  });
  fieldset.appendChild(plusBox);

  const activeWrap = tierEl('label', 'flex items-center gap-2 text-sm');
  const activeToggle = document.createElement('input');
  activeToggle.type = 'checkbox';
  activeToggle.id = 'tierActive';
  activeToggle.checked = true;
  activeWrap.appendChild(activeToggle);
  activeWrap.appendChild(tierEl('span', '', 'این نسخه فعال باشد (اگر غیرفعال باشد، پیش‌فرض سامانه به کار می‌رود)'));
  fieldset.appendChild(activeWrap);

  const submit = tierEl('button', 'bg-emerald-700 px-4 py-2 rounded-xl', 'ثبت نسخهٔ جدید');
  submit.type = 'submit';
  fieldset.appendChild(submit);
  fieldset.disabled = tierBusy;
  form.appendChild(fieldset);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAdminTiers();
  });
  root.appendChild(form);

  const list = tierEl('div', 'bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-2');
  list.appendChild(tierEl('h4', 'font-bold', 'نسخه‌های ثبت‌شده'));
  const versions = (Array.isArray(data.rules) ? data.rules : []).filter((rule) => rule.ruleKey === 'tiers.worker').reverse();
  if (!versions.length) list.appendChild(tierEl('p', 'text-sm text-slate-400', 'هنوز نسخه‌ای ثبت نشده است.'));
  for (const rule of versions) {
    list.appendChild(
      tierEl(
        'p',
        'text-sm',
        'نسخهٔ ' + tierFa(rule.version) + ' · ' + (rule.active ? 'فعال' : 'غیرفعال') + ' · ' +
          new Date(rule.createdAt).toLocaleString('fa-IR') + ' · ' + tierDescribe(rule.value)
      )
    );
  }
  root.appendChild(list);
}

async function loadAdminTiers() {
  if (tierBusy) return;
  try {
    if (!(await ensureAdmin())) return;
    tierMessage('در حال بارگذاری…');
    const response = await fetch('/api/admin/point-rules', { headers: adminHeaders(), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.success) {
      tierMessage('قانون درجه‌ها دریافت نشد. دوباره تلاش کنید.');
      return;
    }
    tierMessage('');
    renderAdminTiers(data);
  } catch (error) {
    tierMessage('ارتباط برقرار نشد. دوباره تلاش کنید.');
  }
}

async function submitAdminTiers() {
  if (tierBusy) return;
  const silverCompleted = tierReadInt('tierSilverCompleted', false);
  const silverPoints = tierReadInt('tierSilverPoints', true);
  const goldCompleted = tierReadInt('tierGoldCompleted', false);
  const goldPoints = tierReadInt('tierGoldPoints', true);
  const silverRating = tierReadRating('tierSilverRating');
  const goldRating = tierReadRating('tierGoldRating');
  if ([silverCompleted, silverPoints, goldCompleted, goldPoints].some((n) => n == null)) {
    tierMessage('عددها باید صحیح و صفر یا بیشتر باشند. حداقل سفارش نقره‌ای و طلایی لازم است.');
    return;
  }
  if (silverRating == null || goldRating == null) {
    tierMessage('حداقل میانگین ستاره باید بین ۰ تا ۵ و حداکثر با یک رقم اعشار باشد، مثل ۴٫۵.');
    return;
  }
  const levels = [
    { tierKey: 'gray' },
    { tierKey: 'silver', minPoints: silverPoints, minCompleted: silverCompleted, minRating: silverRating },
    { tierKey: 'gold', minPoints: goldPoints, minCompleted: goldCompleted, minRating: goldRating },
  ];
  if (document.getElementById('tierPlusEnabled').checked) {
    const plusCompleted = tierReadInt('tierPlusCompleted', false);
    const plusPoints = tierReadInt('tierPlusPoints', true);
    const plusRating = tierReadRating('tierPlusRating');
    if (plusCompleted == null || plusPoints == null || plusRating == null) {
      tierMessage('عددهای طلایی پلاس را بررسی کنید.');
      return;
    }
    levels.push({ tierKey: 'gold_plus', minPoints: plusPoints, minCompleted: plusCompleted, minRating: plusRating });
  }
  const active = document.getElementById('tierActive').checked;
  tierBusy = true;
  tierMessage('در حال ثبت…');
  try {
    if (!(await ensureAdmin())) return;
    const response = await fetch('/api/admin/point-rules', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ ruleKey: 'tiers.worker', value: { levels }, active }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      tierMessage('قانون ثبت نشد. عددها را بررسی کنید.');
      return;
    }
    tierMessage('نسخهٔ ' + tierFa(data.rule.version) + ' ثبت شد. درجهٔ هر متخصص با تکمیل سفارش بعدی‌اش به‌روز می‌شود.');
  } catch (error) {
    tierMessage('ارتباط برقرار نشد. نتیجه را با بازخوانی بررسی کنید.');
    return;
  } finally {
    tierBusy = false;
  }
  await loadAdminTiers();
  tierMessage('نسخهٔ جدید ثبت شد. درجهٔ هر متخصص با تکمیل سفارش بعدی‌اش به‌روز می‌شود.');
}
