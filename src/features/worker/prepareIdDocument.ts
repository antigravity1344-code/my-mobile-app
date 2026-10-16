export const MAX_ID_DOC_BYTES = 600 * 1024;

export type PreparedIdDoc = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
};

export type ManipulateIdImage = (
  uri: string,
  actions: Array<{ resize: { width: number } }>,
  options: { compress: number; format: 'jpeg'; base64: true },
) => Promise<{ base64?: string | null }>;

const JPEG_ATTEMPTS: Array<{ maxWidth: number; compress: number }> = [
  { maxWidth: 1600, compress: 0.8 },
  { maxWidth: 1600, compress: 0.65 },
  { maxWidth: 1280, compress: 0.55 },
  { maxWidth: 1024, compress: 0.5 },
  { maxWidth: 800, compress: 0.45 },
];

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

function acceptIfFits(data: string): PreparedIdDoc | null {
  const mimeType = detectImageKindFromBase64(data);
  if (!mimeType) return null;
  if (base64ByteLength(data) > MAX_ID_DOC_BYTES) return null;
  return { mimeType, data: data.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '') };
}

export async function prepareIdDocument(params: {
  uri: string;
  width?: number | null;
  sourceBase64?: string | null;
  manipulate: ManipulateIdImage;
}): Promise<{ ok: true; doc: PreparedIdDoc } | { ok: false; message: string }> {
  if (params.sourceBase64) {
    const ready = acceptIfFits(params.sourceBase64);
    if (ready) return { ok: true, doc: ready };
  }

  const sourceWidth = Number(params.width) > 0 ? Number(params.width) : 1600;

  try {
    for (const attempt of JPEG_ATTEMPTS) {
      const width = Math.min(sourceWidth, attempt.maxWidth);
      const actions = width > 0 ? [{ resize: { width } }] : [];
      const result = await params.manipulate(params.uri, actions, {
        compress: attempt.compress,
        format: 'jpeg',
        base64: true,
      });
      const data = result.base64 || '';
      const ready = acceptIfFits(data);
      if (ready && ready.mimeType === 'image/jpeg') {
        return { ok: true, doc: ready };
      }
    }
  } catch {
    return { ok: false, message: 'آماده‌سازی تصویر ممکن نشد. دوباره از گالری انتخاب کنید.' };
  }

  return {
    ok: false,
    message: 'این تصویر برای مدرک خیلی حجیم است. عکس واضح‌تر و نزدیک‌تری بگیرید و دوباره تلاش کنید.',
  };
}
