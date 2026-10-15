// D-62: authenticated HTTP negative paths using an isolated non-Paksho deployment.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd62-http-no-write-'));
const docs = path.join(tmp, 'docs');
const db = path.join(tmp, 'isolated.sqlite');
const policyFile = path.join(tmp, 'policy.json');
const policy = {
  version: 'synthetic-test-v1', deploymentId: 'synthetic-deployment',
  allowedStoredMimes: ['image/png'], maxBytes: 64,
  compression: { enabled: false }, oversizeAction: 'reject',
  approvedBy: 'isolated-test-only', minimumLegibility: 'synthetic binary fixture only'
};
fs.writeFileSync(policyFile, JSON.stringify(policy));
process.env.NODE_ENV = 'test';
process.env.PAKSHO_SMS_MODE = 'fake';
process.env.PAKSHO_DOCUMENT_POLICY = '';
process.env.PAKSHO_DEPLOYMENT_ID = policy.deploymentId;
process.env.PAKSHO_DOCUMENT_POLICY_PATH = policyFile;
process.env.PAKSHO_SQLITE_PATH = db;
process.env.PAKSHO_WORKER_DOC_DIR = docs;
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64');
process.env.PAKSHO_ADMIN_PASSWORD = 'd62-test-admin';
const { app, store } = require('./index.js');

const phone = '09129998877';
let server;
let token;
let userId;

function send(method, pathname, body, bearer) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: server.address().port, method, path: pathname,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
        ...(bearer ? { Authorization: 'Bearer ' + bearer } : {})
      }
    }, res => {
      const chunks = [];
      res.on('data', b => chunks.push(b));
      res.on('end', () => {
        const response = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(response); } catch { /* parser errors may be HTML */ }
        resolve({ status: res.statusCode, json, response });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}
function onboarding(imageData, mimeType) {
  return {
    userId, name: 'متخصص ساختگی', nationalId: '0012345678', bankSheba: 'IR120000000000000000000000',
    birthDate: '1370/01/01', address: 'نشانی ساختگی', city: 'شهر آزمایشی',
    idDocFile: { data: imageData, mimeType }
  };
}
function snapshot() {
  const user = store.getUser(userId);
  return {
    user: JSON.stringify(user),
    docs: fs.existsSync(docs) ? fs.readdirSync(docs).sort().map(name => ({
      name, data: fs.readFileSync(path.join(docs, name)).toString('hex')
    })) : []
  };
}
const png = Buffer.from('89504e470d0a1a0a0000', 'hex');
const jpeg = Buffer.from('ffd8ffd90000', 'hex');

before(async () => {
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const sent = await send('POST', '/api/auth/send-otp', { phone });
  assert.equal(sent.status, 200);
  const code = store.getOtp(phone).code;
  const login = await send('POST', '/api/auth/verify-otp', { phone, code, role: 'WORKER' });
  assert.equal(login.status, 200);
  token = login.json.token;
  userId = login.json.user.id;
  assert.ok(token && userId);
  const profile = await send('GET', '/api/document-policy');
  assert.equal(profile.status, 200);
  assert.equal(profile.json.policy.deploymentId, policy.deploymentId);
  assert.equal(profile.json.policy.maxBytes, 64);
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('D-62 authenticated HTTP rejects without writing or changing onboarding state', async t => {
  const cases = [
    ['G2: 8-byte PNG magic is not a decodable image', onboarding(Buffer.from('89504e470d0a1a0a','hex').toString('base64'), 'image/png'), 400, /ناقص|خراب|پردازش/],
    ['forged MIME versus binary signature', onboarding(png.toString('base64'), 'image/jpeg'), 400, /نوع تصویر اعلام|محتوای/],
    ['stored image MIME denied by deployment policy', onboarding(jpeg.toString('base64'), 'image/jpeg'), 400, /فرمت واقعی/],
    ['file exceeds deployment maxBytes', onboarding(Buffer.concat([png, Buffer.alloc(55)]).toString('base64'), 'image/png'), 400, /حجم/],
    ['JSON body exceeds parser limit', onboarding('A'.repeat(150000), 'image/png'), 413, null]
  ];
  for (const [name, body, status, message] of cases) {
    await t.test(name, async () => {
      const beforeState = snapshot();
      const result = await send('PUT', '/api/users/worker-onboarding', body, token);
      assert.equal(result.status, status, result.response.slice(0, 150));
      if (message) {
        assert.equal(result.json?.success, false);
        assert.match(result.json?.message || '', message);
      }
      assert.deepEqual(snapshot(), beforeState, 'rejected HTTP request modified user row or document directory');
    });
  }
  assert.deepEqual(snapshot().docs, [], 'no rejected image was written');
  assert.equal(store.getUser(userId).status, 'REGISTERED');
});
