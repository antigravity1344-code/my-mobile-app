const adminSiteFeatures = ['site_extras', 'detergent_package'];
let savedSiteFeatures = null;

async function requestAdminSiteSetting(path, method, body) {
  const response = await fetch('/api/admin/' + path, {
    method,
    headers: adminHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'انجام درخواست ممکن نشد. دوباره تلاش کنید.');
  }
  return data;
}

async function updateAdminSiteFeatures(feature) {
  const controls = document.getElementById('siteFeatureControls');
  const message = document.getElementById('siteFeaturesMessage');
  if (controls.dataset.busy) return;
  controls.dataset.busy = 'true';
  controls.disabled = true;
  message.textContent = feature ? 'در حال ذخیره…' : 'در حال بارگذاری…';
  try {
    const data = feature
      ? await requestAdminSiteSetting('feature-switches', 'PUT', {
        scope: 'GLOBAL', feature, enabled: document.getElementById(feature).checked,
      })
      : await requestAdminSiteSetting('feature-switches', 'GET');
    savedSiteFeatures = data.global;
    message.textContent = feature ? 'وضعیت قابلیت ذخیره شد.' : '';
  } catch (error) {
    message.textContent = 'دریافت یا ذخیرهٔ وضعیت قابلیت انجام نشد. ' + error.message;
  } finally {
    if (savedSiteFeatures) {
      for (const key of adminSiteFeatures) {
        document.getElementById(key).checked = savedSiteFeatures[key] === true;
      }
    }
    controls.disabled = !savedSiteFeatures;
    delete controls.dataset.busy;
  }
}

function loadAdminSiteFeatures() {
  for (const feature of adminSiteFeatures) {
    document.getElementById(feature).onchange = () => updateAdminSiteFeatures(feature);
  }
  return updateAdminSiteFeatures();
}

function renderAdminDiscountCodes(codes) {
  const list = document.getElementById('discountCodeList');
  list.replaceChildren();
  if (!codes.length) list.append(adminElement('li', '', 'هنوز کد تخفیفی ثبت نشده است.'));
  for (const code of codes) {
    const row = adminElement('li', 'bg-slate-800 rounded-xl p-3 space-y-2');
    const expiry = code.expiresAt ? new Date(code.expiresAt).toLocaleString('fa-IR') : 'بدون انقضا';
    row.append(
      adminElement('bdi', 'font-bold', code.code),
      adminElement('p', '', code.percent + '٪ تخفیف | انقضا: ' + expiry +
        ' | سقف استفاده: ' + (code.maxUses ?? 'بدون سقف') + ' | استفاده‌شده: ' + code.usedCount),
      adminElement('p', '', code.active ? 'فعال' : 'غیرفعال'),
    );
    const button = adminElement('button', 'bg-slate-700 px-3 py-2 rounded-xl', code.active ? 'غیرفعال کردن' : 'فعال کردن');
    button.type = 'button';
    button.onclick = () => updateAdminDiscountCodes('PUT', '/' + encodeURIComponent(code.code) + '/active', { active: !code.active });
    row.append(button);
    list.append(row);
  }
}

async function updateAdminDiscountCodes(method, suffix = '', body) {
  const controls = document.getElementById('discountCodeControls');
  const message = document.getElementById('discountCodesMessage');
  if (controls.dataset.busy) return;
  const wasDisabled = controls.disabled;
  controls.dataset.busy = 'true';
  controls.disabled = true;
  message.textContent = method === 'GET' ? 'در حال بارگذاری…' : 'در حال ذخیره…';
  let saved = false;
  try {
    if (method !== 'GET') {
      await requestAdminSiteSetting('discount-codes' + suffix, method, body);
      saved = true;
      if (method === 'POST') document.getElementById('discountCodeForm').reset();
    }
    const data = await requestAdminSiteSetting('discount-codes', 'GET');
    renderAdminDiscountCodes(data.codes);
    controls.disabled = false;
    message.textContent = saved ? 'تغییر ذخیره شد.' : '';
  } catch (error) {
    message.textContent = saved
      ? 'تغییر ذخیره شد، ولی بازخوانی فهرست انجام نشد. دوباره این زبانه را باز کنید.'
      : error.message;
    controls.disabled = saved || wasDisabled;
  } finally {
    delete controls.dataset.busy;
  }
}

function loadAdminDiscountCodes() {
  return updateAdminDiscountCodes('GET');
}

function createAdminDiscountCode(event) {
  event.preventDefault();
  const fields = event.currentTarget.elements;
  return updateAdminDiscountCodes('POST', '', {
    code: fields.code.value.trim(),
    percent: fields.percent.valueAsNumber,
    expiresAt: fields.expiresAt.value ? new Date(fields.expiresAt.value).toISOString() : null,
    maxUses: fields.maxUses.value ? fields.maxUses.valueAsNumber : null,
  });
}
