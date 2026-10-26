'use strict';

let areasCatalog = null;
let areasBusy = false;
function areasElement(id) { return document.getElementById('areas' + id); }
function areasMessage(text) { areasElement('Message').textContent = text; }
function areasControls() {
  areasElement('Refresh').disabled = areasBusy;
  for (const id of ['City', 'Add', 'Name', 'Neighborhoods', 'Default', 'Save']) {
    areasElement(id).disabled = areasBusy || !areasCatalog;
  }
}
function validAreas(value) {
  return value && Number.isSafeInteger(value.version) && value.version >= 0 &&
    Array.isArray(value.cities) && value.cities.length > 0 &&
    value.cities.every(city => city && typeof city.id === 'string' && typeof city.name === 'string' &&
      Array.isArray(city.neighborhoods) && city.neighborhoods.every(name => typeof name === 'string')) &&
    value.cities.some(city => city.id === value.defaultCityId);
}
function selectAdminArea() {
  if (!areasCatalog || areasBusy) return;
  const city = areasCatalog.cities.find(value => value.id === areasElement('City').value);
  areasElement('Name').value = city ? city.name : '';
  areasElement('Neighborhoods').value = city ? city.neighborhoods.join('\n') : '';
  areasElement('Default').checked = Boolean(city && city.id === areasCatalog.defaultCityId);
}
function fillAdminAreas(catalog, selectedId = catalog.defaultCityId) {
  areasCatalog = catalog;
  const select = areasElement('City');
  select.replaceChildren();
  for (const city of catalog.cities) {
    const option = document.createElement('option');
    option.value = city.id;
    option.textContent = city.name + (city.id === catalog.defaultCityId ? ' (پیش‌فرض)' : '');
    select.appendChild(option);
  }
  select.value = selectedId;
  // Called after the request completes, with controls still disabled.
  const city = catalog.cities.find(value => value.id === selectedId);
  areasElement('Name').value = city.name;
  areasElement('Neighborhoods').value = city.neighborhoods.join('\n');
  areasElement('Default').checked = city.id === catalog.defaultCityId;
}
function newAdminArea() {
  if (!areasCatalog || areasBusy) return;
  areasElement('City').value = '';
  selectAdminArea();
  areasElement('Name').focus();
  areasMessage('نام شهر تازه و محله‌های تحت پوشش را وارد کنید.');
}
async function areasRequest(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/admin/service-areas', {
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
async function loadAdminAreas() {
  if (areasBusy) return;
  areasBusy = true; areasCatalog = null; areasControls();
  areasMessage('در حال دریافت شهرها…');
  try {
    if (!adminToken) { areasMessage('ابتدا وارد حساب مدیر شوید یا صفحه را بازخوانی کنید.'); return; }
    const result = await areasRequest('GET');
    if (result.expired) { areasMessage('نشست مدیر پایان یافته است. دوباره وارد شوید.'); return; }
    if (!result.response.ok || !result.data.success || !validAreas(result.data.catalog)) throw new Error('invalid catalog');
    fillAdminAreas(result.data.catalog);
    areasMessage('فهرست شهرها دریافت شد.');
  } catch { areasMessage('فهرست دریافت نشد. اتصال را بررسی و دوباره بازخوانی کنید.'); }
  finally { areasBusy = false; areasControls(); }
}
async function saveAdminArea() {
  if (areasBusy || !areasCatalog) return;
  const name = areasElement('Name').value.trim();
  const neighborhoods = areasElement('Neighborhoods').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (!name || name.length > 80 || neighborhoods.length > 500) {
    areasMessage('نام شهر تا ۸۰ نویسه و حداکثر ۵۰۰ محله لازم است.'); return;
  }
  const id = areasElement('City').value || 'city-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const city = { id, name, neighborhoods };
  const exists = areasCatalog.cities.some(value => value.id === id);
  const cities = exists ? areasCatalog.cities.map(value => value.id === id ? city : value) : [...areasCatalog.cities, city];
  const body = { expectedVersion: areasCatalog.version, cities,
    defaultCityId: areasElement('Default').checked ? id : areasCatalog.defaultCityId };
  areasBusy = true; areasControls(); areasMessage('در حال ذخیره…');
  try {
    const result = await areasRequest('PUT', body);
    if (result.expired) {
      areasCatalog = null; areasMessage('نشست مدیر پایان یافته است. نوشته‌ها حفظ شدند؛ دوباره وارد شوید.'); return;
    }
    if (result.response.status === 409) {
      areasCatalog = null; areasMessage('فهرست قبلاً تغییر کرده است. نوشته‌ها حفظ شدند؛ پیش از تلاش مجدد بازخوانی کنید.'); return;
    }
    if (result.response.status === 400) { areasMessage(result.data.message || 'نام شهر یا محله‌ها معتبر نیست.'); return; }
    if (!result.response.ok || !result.data.success || !validAreas(result.data.catalog)) throw new Error('save failed');
    fillAdminAreas(result.data.catalog, id);
    areasMessage('شهر و محله‌ها ذخیره شدند.');
  } catch {
    areasCatalog = null;
    areasMessage('نتیجه ذخیره مشخص نشد. نوشته‌ها حفظ شدند؛ نتیجه را بازخوانی کنید.');
  } finally { areasBusy = false; areasControls(); }
}
