import { describe, expect, it } from 'vitest';
import {
  MAX_ID_DOC_BYTES,
  detectImageKindFromBase64,
  prepareIdDocumentFromBase64,
} from './prepareIdDocument';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).toString('base64');
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x04, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
]).toString('base64');

describe('prepareIdDocumentFromBase64', () => {
  it('detects real bytes, not a claimed name', () => {
    expect(detectImageKindFromBase64(jpeg)).toBe('image/jpeg');
    expect(detectImageKindFromBase64(png)).toBe('image/png');
    expect(detectImageKindFromBase64(webp)).toBe('image/webp');
    expect(detectImageKindFromBase64('not-an-image')).toBe(null);
  });

  it('keeps jpeg bytes and jpeg type identical', () => {
    const result = prepareIdDocumentFromBase64(jpeg);
    expect(result).toEqual({ ok: true, doc: { mimeType: 'image/jpeg', data: jpeg } });
  });

  it('keeps png bytes and png type identical', () => {
    const result = prepareIdDocumentFromBase64(png);
    expect(result).toEqual({ ok: true, doc: { mimeType: 'image/png', data: png } });
  });

  it('keeps webp bytes and webp type identical', () => {
    const result = prepareIdDocumentFromBase64(webp);
    expect(result).toEqual({ ok: true, doc: { mimeType: 'image/webp', data: webp } });
  });

  it('does not convert jpeg bytes even if a png name is claimed', () => {
    const result = prepareIdDocumentFromBase64(jpeg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.mimeType).toBe('image/jpeg');
      expect(result.doc.data).toBe(jpeg);
    }
  });

  it('rejects a file over the original-quality size cap without recoding it', () => {
    const huge = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(MAX_ID_DOC_BYTES + 8, 1),
    ]).toString('base64');
    const result = prepareIdDocumentFromBase64(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('۸ مگابایت');
    }
  });
});
