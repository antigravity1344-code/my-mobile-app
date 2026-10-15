import { describe, expect, it } from 'vitest';
import {
  PAKSHO_COMPAT_DOCUMENT_POLICY as paksho,
  detectDocumentMime,
  pickerQualityForPolicy,
  validateDocumentPolicy,
  validateSelectedDocument,
} from './documentPolicy';

const png = 'iVBORw0KGgoAAAANSUhEUg=='; // PNG magic + truncated payload; signature test only
const jpeg = '/9j/4AAQSkZJRg==';

describe('D-62 deployment policy', () => {
  it('does not invent a profile, cap, tenant or lossy quality', () => {
    expect(() => validateDocumentPolicy(undefined)).toThrow();
    expect(() => validateDocumentPolicy({ deploymentId: 'other' })).toThrow();
    expect(() => pickerQualityForPolicy({ ...paksho, compression: {} })).toThrow();
    const separate = { ...paksho, deploymentId: 'other', compression: { enabled: false as const } };
    expect(pickerQualityForPolicy(separate)).toBe(1);
  });
  it('retains Paksho historical values only in its named compatibility profile', () => {
    expect(validateDocumentPolicy(paksho).maxBytes).toBe(614400);
    expect(pickerQualityForPolicy(paksho)).toBe(0.5);
    expect(paksho.deploymentId).toBe('paksho-compat');
  });
  it('detects bytes independently of filename and asset metadata', () => {
    expect(detectDocumentMime(png)).toBe('image/png');
    expect(detectDocumentMime(jpeg)).toBe('image/jpeg');
    expect(validateSelectedDocument(paksho, jpeg).extension).toBe('.jpg');
    expect(validateSelectedDocument(paksho, png).extension).toBe('.png');
    expect(detectDocumentMime('AAAA')).toBe(null);
  });
  it('rejects oversize before upload regardless of selected filename', () => {
    const strict = { ...paksho, maxBytes: 4 };
    expect(() => validateSelectedDocument(strict, png)).toThrow(/حجم/);
  });
  it('rejects unsupported formats and invalid policy branches', () => {
    expect(() => validateDocumentPolicy({ ...paksho, maxBytes: 0 })).toThrow();
    expect(() => validateDocumentPolicy({ ...paksho, oversizeAction: 'compress' })).toThrow();
    expect(() => validateDocumentPolicy({ ...paksho, compression: { enabled: true, quality: 2 } })).toThrow();
    expect(() => validateSelectedDocument({ ...paksho, allowedStoredMimes: ['image/jpeg'] }, png)).toThrow();
  });
});
