import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginPreview, endPreview, previewActive, previewApi, previewAvailable, previewRead, previewRemove, previewWrite, setPreviewScenario } from './previewRuntime';

const oldValue = process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;

beforeEach(() => {
  vi.stubGlobal('__DEV__', true);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
  endPreview();
});
afterEach(() => {
  endPreview();
  vi.unstubAllGlobals();
  if (oldValue === undefined) delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
  else process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = oldValue;
});

describe('isolated preview policy', () => {
  it('cannot activate in release even with env switch enabled', () => {
    vi.stubGlobal('__DEV__', false);
    expect(previewAvailable()).toBe(false);
    beginPreview('customer');
    expect(previewActive()).toBe(false);
  });
  it('cannot activate in development without explicit switch', () => {
    delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
    beginPreview('customer');
    expect(previewActive()).toBe(false);
  });
  it('keeps preview data in its own memory and clears it at exit', () => {
    beginPreview('customer');
    previewWrite('session', 'fake-session');
    expect(previewRead('session')).toBe('fake-session');
    previewRemove('session');
    expect(previewRead('session')).toBe(null);
    previewWrite('session', 'temporary');
    endPreview();
    expect(previewRead('session')).toBe(null);
  });
  it('returns only synthetic results without calling network fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    beginPreview('worker');
    const orders = await previewApi('/orders/available');
    expect(orders.success).toBe(true);
    expect(orders.orders[0].id).toBe('PREVIEW-ORDER-1');
    setPreviewScenario('EMPTY');
    expect((await previewApi('/orders')).orders).toEqual([]);
    expect((await previewApi('/orders', { method: 'POST' })).success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
