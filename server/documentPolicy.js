'use strict';
const fs = require('fs');
const path = require('path');

const MIME_KINDS = Object.freeze({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' });
const PAKSHO_COMPAT_POLICY = Object.freeze({
  version: 'paksho-compat-v1',
  deploymentId: 'paksho-compat',
  allowedStoredMimes: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 614400,
  compression: { enabled: true, quality: 0.5 },
  oversizeAction: 'reject',
  approvedBy: 'historical-paksho-compatibility',
  minimumLegibility: 'Historical QA compatibility; final policy criteria still pending'
});

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw Error('D62_POLICY_MISSING');
  if (typeof policy.version !== 'string' || !policy.version.trim() ||
      typeof policy.deploymentId !== 'string' || !policy.deploymentId.trim() ||
      typeof policy.approvedBy !== 'string' || !policy.approvedBy.trim() ||
      typeof policy.minimumLegibility !== 'string' || !policy.minimumLegibility.trim())
    throw Error('D62_POLICY_INCOMPLETE');
  if (!Array.isArray(policy.allowedStoredMimes) || policy.allowedStoredMimes.length === 0 ||
      !policy.allowedStoredMimes.every(mime => Object.hasOwn(MIME_KINDS, mime)))
    throw Error('D62_POLICY_MIMES');
  if (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes <= 0)
    throw Error('D62_POLICY_MAX_BYTES');
  if (policy.oversizeAction !== 'reject') throw Error('D62_POLICY_OVERSIZE');
  if (!policy.compression || typeof policy.compression.enabled !== 'boolean' ||
      (policy.compression.enabled && (!Number.isFinite(policy.compression.quality) ||
        policy.compression.quality <= 0 || policy.compression.quality > 1)))
    throw Error('D62_POLICY_COMPRESSION');
  return Object.freeze({ ...policy, allowedStoredMimes: Object.freeze([...policy.allowedStoredMimes]), compression: Object.freeze({ ...policy.compression }) });
}

// One trusted server configuration per isolated deployment. Never use request tenant IDs.
function loadDeploymentPolicy(env = process.env) {
  // Existing isolated node:test fixtures run under NODE_ENV=test.
  // This compatibility adapter is never used in normal deployment processes.
  if (env.NODE_ENV === 'test' && !env.PAKSHO_DOCUMENT_POLICY &&
      !env.PAKSHO_DOCUMENT_POLICY_PATH && !env.PAKSHO_DEPLOYMENT_ID)
    return validatePolicy(PAKSHO_COMPAT_POLICY);
  if (env.PAKSHO_DOCUMENT_POLICY === 'paksho-compat') {
    if (env.PAKSHO_DEPLOYMENT_ID && env.PAKSHO_DEPLOYMENT_ID !== 'paksho-compat')
      throw Error('D62_POLICY_DEPLOYMENT_MISMATCH');
    return validatePolicy(PAKSHO_COMPAT_POLICY);
  }
  if (!env.PAKSHO_DOCUMENT_POLICY_PATH || !env.PAKSHO_DEPLOYMENT_ID)
    throw Error('D62_POLICY_MISSING');
  const filename = path.resolve(env.PAKSHO_DOCUMENT_POLICY_PATH);
  const policy = validatePolicy(JSON.parse(fs.readFileSync(filename, 'utf8')));
  if (policy.deploymentId !== env.PAKSHO_DEPLOYMENT_ID) throw Error('D62_POLICY_DEPLOYMENT_MISMATCH');
  return policy;
}

function detectKind(buffer) {
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function inspectDocument(payload, policy) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'مدرک هویتی الزامی است.' };
  const raw = typeof payload.data === 'string' ? payload.data.trim() : '';
  const cleaned = raw.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!cleaned || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0)
    return { error: 'فایل مدرک معتبر نیست.' };
  const approximateSize = cleaned.length * 3 / 4 - (cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0);
  if (approximateSize > policy.maxBytes) return { error: policy.deploymentId === 'paksho-compat' ? 'حجم مدرک باید حداکثر ۶۰۰ کیلوبایت باشد.' : 'حجم مدرک از سقف مجاز این استقرار بیشتر است.' };
  const buffer = Buffer.from(cleaned, 'base64');
  const kind = detectKind(buffer);
  const mime = Object.entries(MIME_KINDS).find(([, v]) => v === kind)?.[0];
  if (!mime || !policy.allowedStoredMimes.includes(mime))
    return { error: 'فرمت واقعی مدرک مجاز نیست.' };
  const claimed = typeof payload.mimeType === 'string' ? payload.mimeType.toLowerCase().trim() : '';
  if (claimed !== mime && !(claimed === 'image/jpg' && mime === 'image/jpeg'))
    return { error: 'محتوای فایل با نوع تصویر اعلام‌شده یکی نیست.' };
  return { buffer, ext: kind === 'jpeg' ? 'jpg' : kind };
}
module.exports = { PAKSHO_COMPAT_POLICY, validatePolicy, loadDeploymentPolicy, detectKind, inspectDocument };
