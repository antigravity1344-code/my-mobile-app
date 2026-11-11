'use strict';

let servicesBusy = false;
function servicesMessage(text) { document.getElementById('servicesMessage').textContent = text; }
async function servicesRequest(method, body) {
  const response = await fetch('/api/admin/service-switches', {
    method, headers: adminHeaders(), cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) { adminToken = ''; sessionStorage.removeItem('paksho_admin_token'); return { expired: true }; }
  return { response, data: await response.json() };
}
function renderAdminServices(services) {
  const list = document.getElementById('servicesList');
  list.replaceChildren();
  for (const service of services) {
    const item = document.createElement('li');
    item.className = 'admin-service-row flex items-center justify-between gap-3 bg-slate-800 border border-slate-700 rounded-xl p-3';
    const title = document.createElement('span');
    title.className = 'admin-service-title';
    title.textContent = service.title + (service.enabled ? '' : ' (خاموش)');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.serviceId = service.id;
    button.className = service.enabled ? 'admin-service-toggle bg-rose-700 px-4 py-2 rounded-xl' : 'admin-service-toggle bg-emerald-700 px-4 py-2 rounded-xl';
    button.textContent = service.enabled ? 'خاموش کن' : 'روشن کن';
    button.disabled = servicesBusy;
    button.addEventListener('click', () => toggleAdminService(service.id, !service.enabled));
    item.append(title, button);
    list.append(item);
  }
}
async function loadAdminServices() {
  document.getElementById('servicesList').replaceChildren();
  if (!adminToken) return;
  try {
    const result = await servicesRequest('GET');
    if (result.expired) return;
    if (!result.response.ok || !result.data.success) throw new Error('failed');
    servicesMessage('');
    renderAdminServices(result.data.services);
  } catch { servicesMessage('خواندن فهرست خدمات انجام نشد؛ دوباره تلاش کنید.'); }
}
async function toggleAdminService(serviceId, enabled) {
  if (servicesBusy) return;
  servicesBusy = true;
  servicesMessage('در حال ذخیره…');
  try {
    const result = await servicesRequest('PUT', { serviceId, enabled });
    if (result.expired) return;
    if (!result.response.ok || !result.data.success) throw new Error('failed');
    servicesBusy = false;
    servicesMessage(enabled ? 'خدمت روشن شد.' : 'خدمت خاموش شد و در اپ‌ها دیده نمی‌شود.');
    renderAdminServices(result.data.services);
  } catch {
    servicesBusy = false;
    servicesMessage('نتیجه نامشخص است؛ فهرست بازخوانی شد.');
    await loadAdminServices();
  } finally { servicesBusy = false; }
}
