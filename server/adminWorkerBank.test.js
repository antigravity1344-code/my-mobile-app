'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function panel(fetch) {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.handlers = {}; this.value = ''; this.checked = false; this.disabled = false; }
    append(...values) { this.children.push(...values); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(event, fn) { this.handlers[event] = fn; }
    querySelector() { return this.children.find(child => child['data-bank-reset']); }
    remove() { this.removed = true; }
    set innerHTML(_) { throw new Error('no HTML interpolation allowed'); }
  }
  const card = new Element('card');
  const context = vm.createContext({ fetch, setTimeout, clearTimeout, AbortController, adminHeaders: () => ({ Authorization: 'Bearer admin-fixture', 'Content-Type': 'application/json' }),
    document: { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'adminWorkerBank.js'), 'utf8'), context);
  context.openWorkerBankReset({ id: 'worker/id', name: '<img onerror=bad>' }, card);
  const section = card.children[0], [, status, reasonLabel, identityLabel, reload, submit, close] = section.children;
  return { section, status, reason: reasonLabel.children[0], identity: identityLabel.children[0], reload, submit, close };
}
const reply = (data, status = 200) => ({ ok: status === 200, json: async () => data });
const settle = () => new Promise(resolve => setImmediate(resolve));

test('admin reset panel requires identity checkbox and reason, reads version via admin route and posts no new PIN', async () => {
  const calls = [];
  const ui = panel(async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer admin-fixture');
    return reply({ success: true, temporaryPin: '987654', bankDetails: { version: 7, bankShebaMasked: 'IR82****9002', hasPin: true, temporaryExpiresAt: new Date(Date.now() + 600000).toISOString() } });
  });
  await settle();
  assert.equal(calls[0].url, '/api/admin/workers/worker%2Fid/bank-details');
  assert.equal(ui.submit.disabled, false);
  await ui.submit.handlers.click(); assert.equal(calls.length, 1);
  ui.identity.checked = true; ui.reason.value = 'مدارک ثبت‌شده تطبیق داده شد';
  await ui.submit.handlers.click();
  assert.equal(calls[1].url, '/api/admin/workers/worker%2Fid/bank-pin/reset');
  assert.deepEqual(JSON.parse(calls[1].options.body), { reason: ui.reason.value || 'مدارک ثبت‌شده تطبیق داده شد', identityVerified: true, expectedVersion: 7 });
  assert.equal(ui.reason.value, ''); assert.equal(ui.identity.checked, false); assert.equal(ui.submit.disabled, true);
  assert.match(ui.status.textContent, /متخصص باید آن را به رمز شخصی تغییر دهد/);
});

test('lost reset response preserves reason and blocks retry until admin state is reread', async () => {
  let resets = 0;
  const ui = panel(async (_url, options) => {
    if (options.method === 'POST') { resets++; throw new Error('fixture lost response'); }
    return reply({ success: true, bankDetails: { version: 4, bankShebaMasked: null, hasPin: true } });
  });
  await settle(); ui.reason.value = 'دلیل محفوظ'; ui.identity.checked = true;
  await ui.submit.handlers.click();
  assert.equal(ui.reason.value, 'دلیل محفوظ'); assert.equal(ui.submit.disabled, true);
  await ui.submit.handlers.click(); assert.equal(resets, 1);
  await ui.reload.handlers.click(); assert.equal(ui.submit.disabled, false);
});
