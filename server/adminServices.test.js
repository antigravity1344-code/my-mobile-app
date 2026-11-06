'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('adminServices.js builds rows with textContent only and no innerHTML', () => {
  const source = fs.readFileSync(path.join(__dirname, 'adminServices.js'), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(source));
  assert.ok(source.includes('textContent'));
  assert.ok(source.includes('/api/admin/service-switches'));
});
