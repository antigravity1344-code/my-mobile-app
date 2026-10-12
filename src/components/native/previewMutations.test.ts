import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginPreview, endPreview, previewApi } from './previewRuntime';

beforeEach(() => {
  vi.stubGlobal('__DEV__', true);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
  beginPreview('customer');
});
afterEach(() => {
  endPreview();
  delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
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
