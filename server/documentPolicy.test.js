const { describe, it, expect } = require('vitest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PAKSHO_COMPAT_POLICY, loadDeploymentPolicy, validatePolicy, inspectDocument } = require('./documentPolicy');
const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
const jpeg = Buffer.from('ffd8ffe000104a46', 'hex').toString('base64');
describe('D-62 server authoritative policy', () => {
  it('fails closed without a trusted policy', () => {
    expect(() => loadDeploymentPolicy({})).toThrow('D62_POLICY_MISSING');
    expect(() => validatePolicy({ deploymentId: 'other' })).toThrow();
    expect(() => loadDeploymentPolicy({ PAKSHO_DOCUMENT_POLICY: 'paksho-compat', PAKSHO_DEPLOYMENT_ID: 'other' })).toThrow();
  });
  it('keeps Paksho compatibility isolated', () => {
    const p = loadDeploymentPolicy({ PAKSHO_DOCUMENT_POLICY: 'paksho-compat' });
    expect(p.maxBytes).toBe(614400);
    expect(p.compression.quality).toBe(0.5);
    expect(p.version).toBe('paksho-compat-v1');
  });
  it('rejects forged MIME and prohibited stored output', () => {
    expect(inspectDocument({ mimeType: 'image/jpeg', data: png }, PAKSHO_COMPAT_POLICY).error).toMatch(/محتوای/);
    expect(inspectDocument({ mimeType: 'image/png', data: png }, { ...PAKSHO_COMPAT_POLICY, allowedStoredMimes: ['image/jpeg'] }).error).toBeTruthy();
    expect(inspectDocument({ mimeType: 'image/png', data: png }, PAKSHO_COMPAT_POLICY).ext).toBe('png');
  });
  it('rejects oversized files before upload', () => {
    expect(inspectDocument({ mimeType: 'image/jpeg', data: jpeg }, { ...PAKSHO_COMPAT_POLICY, maxBytes: 2 }).error).toMatch(/حجم/);
  });
  it('loads only matching configured server deployments', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd62-server-'));
    const file = path.join(dir, 'policy.json');
    try {
      fs.writeFileSync(file, JSON.stringify({ ...PAKSHO_COMPAT_POLICY, deploymentId: 'client-a', version: 'v1' }));
      expect(loadDeploymentPolicy({ PAKSHO_DEPLOYMENT_ID: 'client-a', PAKSHO_DOCUMENT_POLICY_PATH: file }).deploymentId).toBe('client-a');
      expect(() => loadDeploymentPolicy({ PAKSHO_DEPLOYMENT_ID: 'client-b', PAKSHO_DOCUMENT_POLICY_PATH: file })).toThrow();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
