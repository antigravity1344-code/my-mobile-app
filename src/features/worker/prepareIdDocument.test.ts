import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ID_DOC_BYTES,
  base64ByteLength,
  detectImageKindFromBase64,
  prepareIdDocument,
} from './prepareIdDocument';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).toString('base64');
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x04, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
]).toString('base64');

describe('prepareIdDocument', () => {
  it('detects real bytes, not a claimed name', () => {
    expect(detectImageKindFromBase64(jpeg)).toBe('image/jpeg');
    expect(detectImageKindFromBase64(png)).toBe('image/png');
    expect(detectImageKindFromBase64(webp)).toBe('image/webp');
    expect(detectImageKindFromBase64('not-an-image')).toBe(null);
  });

  it('keeps a small jpeg without touching the compressor', async () => {
    const manipulate = vi.fn();
    const result = await prepareIdDocument({
      uri: 'file://id.jpg',
      sourceBase64: jpeg,
      manipulate,
    });
    expect(result).toEqual({ ok: true, doc: { mimeType: 'image/jpeg', data: jpeg } });
    expect(manipulate).not.toHaveBeenCalled();
  });

  it('keeps a small png without converting it', async () => {
    const result = await prepareIdDocument({
      uri: 'file://id.png',
      sourceBase64: png,
      manipulate: vi.fn(),
    });
    expect(result).toEqual({ ok: true, doc: { mimeType: 'image/png', data: png } });
  });

  it('compresses an oversized gallery photo until it fits the 600 KiB cap', async () => {
    const huge = `${jpeg}${'A'.repeat(900_000)}`;
    expect(base64ByteLength(huge)).toBeGreaterThan(MAX_ID_DOC_BYTES);
    const manipulate = vi
      .fn()
      .mockResolvedValueOnce({ base64: huge })
      .mockResolvedValueOnce({ base64: jpeg });

    const result = await prepareIdDocument({
      uri: 'file://camera.jpg',
      width: 4000,
      sourceBase64: huge,
      manipulate,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.mimeType).toBe('image/jpeg');
      expect(result.doc.data).toBe(jpeg);
    }
    expect(manipulate).toHaveBeenCalled();
    expect(manipulate.mock.calls[0][1][0].resize.width).toBe(1600);
  });

  it('rejects when every compressed attempt is still too large', async () => {
    const hugeJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(MAX_ID_DOC_BYTES + 8, 1),
    ]).toString('base64');
    const result = await prepareIdDocument({
      uri: 'file://huge.jpg',
      width: 5000,
      manipulate: async () => ({ base64: hugeJpeg }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('حجیم');
    }
  });
});
