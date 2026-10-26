const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function panel(fetch) {
  const elements = new Map();
  function element() {
    return { value: '', checked: false, disabled: false, textContent: '', children: [],
      replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); }, focus() {},
      set innerHTML(_) { throw new Error('Catalog labels must never be rendered as HTML'); } };
  }
  for (const id of ['Message', 'Refresh', 'City', 'Add', 'Name', 'Neighborhoods', 'Default', 'Save']) elements.set('areas' + id, element());
  const removed = [];
  const context = vm.createContext({ fetch, AbortController, setTimeout, clearTimeout,
    adminToken: 'isolated-admin', adminHeaders: () => ({ Authorization: 'Bearer isolated-admin', 'Content-Type': 'application/json' }),
    sessionStorage: { removeItem: key => removed.push(key) },
    document: { getElementById: id => elements.get(id), createElement: () => element() } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'adminServiceAreas.js'), 'utf8'), context);
  return { context, get: name => elements.get('areas' + name), removed };
}
function initial() { return { version: 0, defaultCityId: 'tehran', cities: [{ id: 'tehran', name: 'تهران', neighborhoods: [] }] }; }
function reply(catalog, status = 200) { return { ok: status === 200, status, json: async () => ({ success: status === 200, catalog }) }; }

test('admin editor loads, adds a city and default, then edits the same city without replacing its ID', async () => {
  let current = initial();
  const requests = [];
  const ui = panel(async (url, options) => {
    assert.equal(url, '/api/admin/service-areas');
    assert.equal(options.headers.Authorization, 'Bearer isolated-admin');
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body); requests.push(body);
      assert.equal(body.expectedVersion, current.version);
      current = { version: current.version + 1, defaultCityId: body.defaultCityId, cities: body.cities };
    }
    return reply(current);
  });
  await ui.context.loadAdminAreas();
  assert.equal(ui.get('Name').value, 'تهران');
  assert.equal(ui.get('Save').disabled, false);
  ui.context.newAdminArea();
  ui.get('Name').value = 'شیراز'; ui.get('Neighborhoods').value = 'معالی‌آباد\n\nقصرالدشت'; ui.get('Default').checked = true;
  await ui.context.saveAdminArea();
  const addedId = current.defaultCityId;
  assert.notEqual(addedId, 'tehran');
  assert.equal(current.cities[0].name, 'تهران');
  assert.deepEqual(current.cities[1].neighborhoods, ['معالی‌آباد', 'قصرالدشت']);
  ui.get('Name').value = 'شهر شیراز';
  await ui.context.saveAdminArea();
  assert.equal(current.cities.length, 2);
  assert.equal(current.cities[1].id, addedId);
  assert.equal(current.cities[1].name, 'شهر شیراز');
  assert.equal(requests.length, 2);
});
test('admin editor preserves draft after conflict, expiry or lost save response and requires reread before retry', async () => {
  for (const failure of [409, 401, 'lost']) {
    let writes = 0;
    const ui = panel(async (_url, options) => {
      if (options.method === 'GET') return reply(initial());
      writes += 1;
      if (failure === 'lost') throw new Error('connection lost');
      return reply(null, failure);
    });
    await ui.context.loadAdminAreas();
    ui.get('Name').value = 'نام ویرایش‌شده';
    await ui.context.saveAdminArea();
    assert.equal(ui.get('Name').value, 'نام ویرایش‌شده');
    assert.equal(ui.get('Save').disabled, true);
    assert.equal(ui.get('Refresh').disabled, false);
    await ui.context.saveAdminArea(); assert.equal(writes, 1);
    if (failure === 401) {
      assert.equal(ui.context.adminToken, '');
      assert.deepEqual(ui.removed, ['paksho_admin_token']);
      await ui.context.loadAdminAreas(); assert.match(ui.get('Message').textContent, /ابتدا وارد/);
    } else {
      await ui.context.loadAdminAreas(); assert.equal(ui.get('Save').disabled, false);
    }
  }
});
test('admin editor handles failed load, blocks overlapping saves, and renders server labels as text', async () => {
  let fail = true, release;
  const malicious = initial(); malicious.cities[0].name = '<img src=x onerror=alert(1)>';
  const ui = panel(async (_url, options) => {
    if (fail) throw new Error('offline');
    if (options.method === 'GET') return reply(malicious);
    return new Promise(resolve => { release = () => resolve(reply({ ...malicious, version: 1 })); });
  });
  await ui.context.loadAdminAreas(); assert.equal(ui.get('Save').disabled, true);
  fail = false; await ui.context.loadAdminAreas();
  assert.equal(ui.get('City').children[0].textContent, malicious.cities[0].name + ' (پیش‌فرض)');
  ui.get('Name').value = 'تهران';
  const saving = ui.context.saveAdminArea();
  assert.equal(ui.get('Save').disabled, true);
  await ui.context.saveAdminArea(); // No second request while busy.
  release(); await saving;
  assert.equal(ui.get('Save').disabled, false);
});
