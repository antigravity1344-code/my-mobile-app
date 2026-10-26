'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { request } = require('./testAuthHarness');
let store, server;
const SHEBA = 'IR820540102680020817909002', OTHER = 'IR062960000000100324200001';
before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PAKSHO_SMS_MODE = 'fake';
  process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 47).toString('base64');
  process.env.PAKSHO_ADMIN_PASSWORD = 'isolated-bank-admin';
  const data = require('./dataStore'), documents = require('./workerDocumentStorage');
  const originalCreate = data.createDataStore, originalExists = fs.existsSync, originalDocuments = documents.createWorkerDocumentStorage;
  const forbidden = new Set(['.env', '.env.local'].flatMap(name => [path.join(__dirname, name), path.join(__dirname, '..', name)]));
  try {
    data.createDataStore = () => originalCreate(':memory:');
    fs.existsSync = name => forbidden.has(String(name)) ? false : originalExists(name);
    // Exercise onboarding without touching document files or creating test directories.
    documents.createWorkerDocumentStorage = () => ({
      uploadWorkerDocument: () => ({ documentId: 'in-memory-document' }),
      deleteWorkerDocument() {}, discardLegacyPath() {}, getWorkerDocument: () => null,
    });
    const runtime = require('./index'); store = runtime.store;
    server = await new Promise(resolve => { const instance = runtime.app.listen(0, '127.0.0.1', () => resolve(instance)); });
  } finally { data.createDataStore = originalCreate; fs.existsSync = originalExists; documents.createWorkerDocumentStorage = originalDocuments; }
});
after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); store.close(); });
let phoneSequence = 0;
function account(id, role = 'WORKER', extra = {}) {
  store.createUser({ id, phone: '0912' + String(++phoneSequence).padStart(7, '0'), role, status: role === 'WORKER' ? 'APPROVED' : 'ACTIVE',
    isProfileComplete: true, bankSheba: SHEBA, nationalId: '1234567890', idDoc: 'existing-document', createdAt: new Date().toISOString(), ...extra });
  store.createSession('token-' + id, { userId: id, role, expires: Date.now() + 60000 });
  return 'token-' + id;
}
const put = (pathname, token, body) => request(server, { pathname, token, body, method: 'PUT' });

test('real HTTP sessions protect masked bank APIs, reject impersonation and isolate admin reset', async () => {
  const worker = account('bank-worker'), other = account('bank-other'), customer = account('bank-customer', 'CUSTOMER'), blocked = account('bank-blocked', 'WORKER', { status: 'BLOCKED' });
  const base = '/api/workers/me/bank-details', pinPath = '/api/workers/me/bank-pin';
  for (const [token, status] of [[undefined, 401], ['forged', 401], [customer, 403], [blocked, 403]]) {
    assert.equal((await request(server, { pathname: base, token })).status, status);
    assert.equal((await put(pinPath, token, { newPin: '123456', expectedVersion: 0 })).status, status);
    assert.equal((await request(server, { pathname: '/api/workers/me/bank-otp', method: 'POST', token, body: { purpose: 'bank-pin' } })).status, status);
  }
  assert.equal((await request(server, { pathname: base + '?workerId=bank-other', token: worker })).status, 400);
  assert.equal((await put(pinPath, worker, { newPin: '123456', expectedVersion: 0, workerId: 'bank-other' })).status, 400);
  const initial = await request(server, { pathname: base, token: worker });
  assert.deepEqual(initial.json.bankDetails, { bankShebaMasked: 'IR82****9002', hasPin: false, lockedUntil: null, version: 0 });
  assert.equal(JSON.stringify(initial.json).includes(SHEBA), false);
  assert.equal((await put(pinPath, worker, { newPin: '123456', expectedVersion: 0 })).status, 200);
  const before = store.getUser('bank-worker');
  const saved = await put(base, worker, { bankSheba: OTHER, pin: '123456', expectedVersion: 1 });
  assert.equal(saved.status, 200); assert.equal(saved.json.bankDetails.version, 2);
  assert.deepEqual(store.getUser('bank-worker'), { ...before, bankSheba: OTHER });
  assert.equal(store.workerBank.read('bank-other').bankDetails.hasPin, false);
  assert.equal(store.getUser('bank-other').bankSheba, SHEBA);
  assert.equal((await put(base, worker, { bankSheba: OTHER, pin: '123456', expectedVersion: 1 })).status, 409);
  const resetPath = '/api/admin/workers/bank-worker/bank-pin/reset';
  for (const token of [undefined, worker, other, customer]) {
    assert.equal((await request(server, { pathname: resetPath, token, method: 'POST', body: { reason: 'بررسی مدارک', identityVerified: true, expectedVersion: 2 } })).status, 401);
  }
  const admin = (await request(server, { pathname: '/api/admin/login', method: 'POST', body: { password: 'isolated-bank-admin' } })).json.token;
  assert.equal((await request(server, { pathname: base, token: admin })).status, 401);
  const readAdmin = await request(server, { pathname: '/api/admin/workers/bank-worker/bank-details', token: admin });
  assert.equal(readAdmin.status, 200); assert.equal(readAdmin.json.bankDetails.version, 2);
  const missing = await request(server, { pathname: resetPath, token: admin, method: 'POST', body: { reason: 'بررسی مدارک', expectedVersion: 2 } });
  assert.equal(missing.status, 400);
  const reset = await request(server, { pathname: resetPath, token: admin, method: 'POST', body: { reason: 'هویت با مدارک موجود تطبیق داده شد', identityVerified: true, expectedVersion: 2 } });
  assert.equal(reset.status, 200); assert.equal(reset.json.bankDetails.hasPin, true); assert.equal(reset.json.bankDetails.pinTemporary, true);
  assert.match(reset.json.temporaryPin, /^\d{6}$/);
  assert.equal((await request(server, { pathname: base, token: worker })).status, 401);
  assert.equal((await request(server, { pathname: '/api/admin/workers/bank-worker/bank-details', token: admin })).json.temporaryPin, undefined);
  assert.equal(store.getUser('bank-worker').bankSheba, OTHER);
  assert.equal(store.getUser('bank-worker').status, 'APPROVED');
});

test('concurrent bad PIN requests share the account lock and a PIN change revokes all its sessions', async () => {
  const token = account('concurrent-bank');
  store.createSession('parallel-session', { userId: 'concurrent-bank', role: 'WORKER', expires: Date.now() + 60000 });
  assert.equal((await put('/api/workers/me/bank-pin', token, { newPin: '123456', expectedVersion: 0 })).status, 200);
  const results = await Promise.all(Array.from({ length: 8 }, () => put('/api/workers/me/bank-details', token, { bankSheba: OTHER, pin: '999999', expectedVersion: 1 })));
  assert.equal(results.filter(result => result.status === 400).length, 4);
  assert.equal(results.filter(result => result.status === 423).length, 4);
  assert.equal((await put('/api/workers/me/bank-pin', 'parallel-session', { newPin: '222222', currentPin: '123456', expectedVersion: 1 })).status, 423);
  const changedToken = account('session-change-bank');
  store.createSession('second-change-session', { userId: 'session-change-bank', role: 'WORKER', expires: Date.now() + 60000 });
  assert.equal((await put('/api/workers/me/bank-pin', changedToken, { newPin: '123456', expectedVersion: 0 })).status, 200);
  const changed = await put('/api/workers/me/bank-pin', changedToken, { newPin: '222222', currentPin: '123456', expectedVersion: 1 });
  assert.equal(changed.status, 200); assert.equal(changed.json.reauthenticationRequired, true);
  for (const revoked of [changedToken, 'second-change-session']) assert.equal((await request(server, { pathname: '/api/workers/me/bank-details', token: revoked })).status, 401);
  assert.equal((await request(server, { pathname: '/api/workers/me/bank-details', token })).status, 200);
});

test('onboarding cannot change an existing bank account; first registration and identical bank remain compatible', async () => {
  const existing = account('existing-bank'), fresh = account('fresh-bank', 'WORKER', { bankSheba: '', status: 'REGISTERED', isProfileComplete: false });
  const body = { name: 'متخصص آزمایشی', nationalId: '1234567890', bankSheba: OTHER, address: 'نشانی', city: 'تهران', skills: ['نظافت'],
    idDocFile: { name: 'fixture.jpg', mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64') } };
  const before = store.getUser('existing-bank');
  const refused = await put('/api/users/worker-onboarding', existing, body);
  assert.equal(refused.status, 409); assert.equal(refused.json.code, 'BANK_EDIT_REQUIRES_PIN');
  assert.deepEqual(store.getUser('existing-bank'), before);
  const first = await put('/api/users/worker-onboarding', fresh, body);
  assert.equal(first.status, 200, first.text); assert.equal(store.getUser('fresh-bank').bankSheba, OTHER);
  const same = await put('/api/users/worker-onboarding', existing, { ...body, bankSheba: SHEBA });
  assert.equal(same.status, 200, same.text); assert.equal(store.getUser('existing-bank').bankSheba, SHEBA);
});
