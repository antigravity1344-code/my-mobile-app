const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PAKSHO_COMPAT_POLICY, loadDeploymentPolicy, validatePolicy, inspectDocument, validateDecodedDocument } = require('./documentPolicy');
const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
const jpeg = Buffer.from('ffd8ffe000104a46', 'hex').toString('base64');
describe('D-62 server authoritative policy', () => {
  it('fails closed without a trusted policy', () => {
    assert.throws(() => loadDeploymentPolicy({}), /D62_POLICY_MISSING/);
    assert.throws(() => validatePolicy({ deploymentId: 'other' }));
    assert.throws(() => loadDeploymentPolicy({ PAKSHO_DOCUMENT_POLICY: 'paksho-compat', PAKSHO_DEPLOYMENT_ID: 'other' }));
  });
  it('keeps Paksho compatibility isolated', () => {
    const p = loadDeploymentPolicy({ PAKSHO_DOCUMENT_POLICY: 'paksho-compat' });
    assert.equal(p.maxBytes, 614400);
    assert.equal(p.compression.quality, 0.5);
    assert.equal(p.version, 'paksho-compat-v1');
  });
  it('rejects forged MIME and prohibited stored output', () => {
    assert.match(inspectDocument({ mimeType: 'image/jpeg', data: png }, PAKSHO_COMPAT_POLICY).error, /محتوای/);
    assert.ok(inspectDocument({ mimeType: 'image/png', data: png }, { ...PAKSHO_COMPAT_POLICY, allowedStoredMimes: ['image/jpeg'] }).error);
    assert.equal(inspectDocument({ mimeType: 'image/png', data: png }, PAKSHO_COMPAT_POLICY).ext, 'png');
  });
  it('rejects oversized files before upload', () => {
    assert.match(inspectDocument({ mimeType: 'image/jpeg', data: jpeg }, { ...PAKSHO_COMPAT_POLICY, maxBytes: 2 }).error, /حجم/);
  });
  it('loads only matching configured server deployments', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd62-server-'));
    const file = path.join(dir, 'policy.json');
    try {
      fs.writeFileSync(file, JSON.stringify({ ...PAKSHO_COMPAT_POLICY, deploymentId: 'client-a', version: 'v1' }));
      assert.equal(loadDeploymentPolicy({ PAKSHO_DEPLOYMENT_ID: 'client-a', PAKSHO_DOCUMENT_POLICY_PATH: file }).deploymentId, 'client-a');
      assert.throws(() => loadDeploymentPolicy({ PAKSHO_DEPLOYMENT_ID: 'client-b', PAKSHO_DOCUMENT_POLICY_PATH: file }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});


it('D-62 G2 decoder rejects signature-only bytes and accepts a complete PNG', async () => {
  const incomplete = Buffer.from('89504e470d0a1a0a', 'hex');
  assert.match((await validateDecodedDocument(incomplete, 'png')).error, /ناقص|خراب/);
  assert.equal((await validateDecodedDocument(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOs0AhgYGBgYmBgYGBgAAALkgD0DmG2vQAAAABJRU5ErkJggg==', 'base64'), 'png')).ok, true);
});
