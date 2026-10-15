/**
 * D-62: No implicit tenant selection and no global document defaults.
 * Caller must supply an explicitly approved deployment policy.
 */
export type DocumentMime = 'image/png' | 'image/jpeg' | 'image/webp';
export type OversizeAction = 'reject';
export type DocumentPolicy = {
  deploymentId: string;
  allowedStoredMimes: DocumentMime[];
  maxBytes: number;
  compression: { enabled: false } | { enabled: true; quality: number };
  oversizeAction: OversizeAction;
  minimumLegibility: string;
  approvedBy: string;
};

const MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export function validateDocumentPolicy(value: unknown): DocumentPolicy {
  if (!value || typeof value !== 'object') throw new Error('پروفایل مدارک تعریف نشده است.');
  const p = value as Partial<DocumentPolicy>;
  if (!p.deploymentId?.trim() || !p.approvedBy?.trim() || !p.minimumLegibility?.trim())
    throw new Error('شناسه استقرار، معیار خوانایی و تأییدکننده سیاست الزامی است.');
  if (!Array.isArray(p.allowedStoredMimes) || !p.allowedStoredMimes.length ||
      !p.allowedStoredMimes.every(m => MIMES.includes(m)))
    throw new Error('فرمت‌های ذخیره باید صریحاً تعیین شوند.');
  if (!Number.isSafeInteger(p.maxBytes) || (p.maxBytes ?? 0) <= 0)
    throw new Error('سقف حجم مدارک باید به بایت تعیین شود.');
  if (p.oversizeAction !== 'reject')
    throw new Error('رفتار فایل بیش‌ازحد تعریف نشده یا پشتیبانی نمی‌شود.');
  if (!p.compression || typeof p.compression.enabled !== 'boolean')
    throw new Error('اجازه فشرده‌سازی باید صریحاً مشخص شود.');
  if (p.compression.enabled && (!Number.isFinite(p.compression.quality) ||
      p.compression.quality <= 0 || p.compression.quality > 1))
    throw new Error('کیفیت فشرده‌سازی نامعتبر است.');
  return p as DocumentPolicy;
}

/** Binary signature, never asset metadata, is authoritative. */
export function detectDocumentMime(base64: string): DocumentMime | null {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0)
    return null;
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('UklGR')) {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const bytes: number[] = [];
    let bits = 0, n = 0;
    for (const ch of base64.slice(0, 24)) {
      if (ch === '=') break;
      const v = abc.indexOf(ch);
      if (v < 0) return null;
      bits = (bits << 6) | v; n += 6;
      if (n >= 8) { n -= 8; bytes.push((bits >>> n) & 255); }
    }
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
      return 'image/webp';
  }
  return null;
}

export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return base64.length * 3 / 4 - padding;
}

export function extensionForMime(mime: DocumentMime): string {
  return mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp';
}

export function validateSelectedDocument(profileValue: unknown, base64: string) {
  const policy = validateDocumentPolicy(profileValue);
  const mimeType = detectDocumentMime(base64);
  if (!mimeType || !policy.allowedStoredMimes.includes(mimeType))
    throw new Error('فرمت واقعی تصویر مدرک مجاز نیست.');
  const size = base64ByteLength(base64);
  if (size > policy.maxBytes)
    throw new Error(`حجم تصویر از سقف مجاز این استقرار (${policy.maxBytes} بایت) بیشتر است.`);
  return { mimeType, bytes: size, extension: extensionForMime(mimeType) };
}

/** Historical Paksho behavior only; not a default for any other deployment.
 * Final production approval remains a product decision under D-62.
 */
export const PAKSHO_COMPAT_DOCUMENT_POLICY: DocumentPolicy = {
  deploymentId: 'paksho-compat',
  allowedStoredMimes: ['image/png', 'image/jpeg', 'image/webp'],
  maxBytes: 614400,
  compression: { enabled: true, quality: 0.5 },
  oversizeAction: 'reject',
  minimumLegibility: 'Historical QA behavior only; real-document criteria pending approval',
  approvedBy: 'existing-behavior-only-not-new-product-approval',
};
export function pickerQualityForPolicy(policyValue: unknown): number {
  const profile = validateDocumentPolicy(policyValue);
  return profile.compression.enabled ? profile.compression.quality : 1;
}
