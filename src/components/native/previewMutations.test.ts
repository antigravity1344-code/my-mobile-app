import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Preview from './previewRuntime';
let beginPreview: typeof Preview.beginPreview;
let endPreview: typeof Preview.endPreview;
let previewApi: typeof Preview.previewApi;
const saved = process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;

beforeEach(async () => {
  vi.resetModules();
  ({beginPreview,endPreview,previewApi} = await import('./previewRuntime'));
  vi.stubGlobal('__DEV__', true);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
  beginPreview('customer');
});
afterEach(() => {
  endPreview();
  if (saved === undefined) delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
  else process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = saved;
  vi.unstubAllGlobals();
});

describe('negative preview mutations', () => {
  const operations: Array<[string, string]> = [
    ['/wallet', 'POST'],
    ['/wallet/charge', 'POST'],
    ['/users/addresses', 'PUT'],
    ['/users/addresses', 'POST'],
    ['/users/addresses/addr-1', 'DELETE'],
    ['/notifications', 'POST'],
    ['/notifications/PREVIEW-N-1/read', 'POST'],
    ['/orders', 'POST'],
    ['/orders/PREVIEW-ORDER-1/accept', 'POST'],
    ['/auth/logout', 'POST'],
    ['/loyalty', 'PATCH'],
    ['/users/me', 'PUT'],
  ];
  it.each(operations)('denies %s %s without false positive success', async (endpoint, method) => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const response = await previewApi(endpoint, { method });
    expect(response.success).toBe(false);
    expect(response.message).toContain('غیرفعال');
    expect(network).not.toHaveBeenCalled();
  });
  it('keeps reads working without allowing writes', async () => {
    expect((await previewApi('/wallet')).success).toBe(true);
    expect((await previewApi('/users/addresses')).success).toBe(true);
    expect((await previewApi('/notifications')).success).toBe(true);
    expect((await previewApi('/notifications/PREVIEW-N-1/read', {method:'POST'})).success).toBe(false);
  });
});
