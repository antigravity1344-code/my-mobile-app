export const MAX_ID_DOC_BYTES = 8 * 1024 * 1024;

export type PreparedIdDoc = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
};

export function base64ByteLength(value: string): number {
  const cleaned = value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!cleaned) return 0;
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

function firstBytesFromBase64(value: string, count: number): number[] {
  const cleaned = value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  const take = Math.ceil((count * 4) / 3) + 4;
  const slice = cleaned.slice(0, take);
  if (!slice) return [];
  const binary =
    typeof Buffer !== 'undefined'
      ? Buffer.from(slice, 'base64')
      : Uint8Array.from(atob(slice), (ch) => ch.charCodeAt(0));
  return Array.from(binary.slice(0, count));
}

export function detectImageKindFromBase64(value: string): PreparedIdDoc['mimeType'] | null {
  const bytes = firstBytesFromBase64(value, 12);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function prepareIdDocumentFromBase64(
  sourceBase64: string,
): { ok: true; doc: PreparedIdDoc } | { ok: false; message: string } {
  const data = sourceBase64.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!data) {
    return { ok: false, message: 'خواندن تصویر مدرک ممکن نشد.' };
  }
  const mimeType = detectImageKindFromBase64(data);
  if (!mimeType) {
    return { ok: false, message: 'فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود.' };
  }
  if (base64ByteLength(data) > MAX_ID_DOC_BYTES) {
    return {
      ok: false,
      message: 'حجم تصویر باید حداکثر ۸ مگابایت باشد.',
    };
  }
  return { ok: true, doc: { mimeType, data } };
}
