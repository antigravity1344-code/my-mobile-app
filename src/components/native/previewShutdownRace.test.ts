import { describe, expect, it, vi } from 'vitest';

async function harness() {
  vi.resetModules();
  vi.stubGlobal('__DEV__', true);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
  const nativeFetch = vi.fn().mockResolvedValue({ ok: true });
  const nativeStore = { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal('fetch', nativeFetch);
  vi.doMock('expo-constants', () => ({ default: { expoConfig: { hostUri: '' } } }));
  vi.doMock('@react-native-async-storage/async-storage', () => ({ default: nativeStore }));
  const runtime = await import('./previewRuntime');
  const { appStorage } = await import('../../utils/storage');
  const auth = await import('../../api/authToken');
  const { apiFetch } = await import('../../api/apiClient');
  const cleanup = () => { vi.unstubAllGlobals(); vi.doUnmock('expo-constants'); vi.doUnmock('@react-native-async-storage/async-storage'); delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW; };
  return { runtime, appStorage, auth, apiFetch, nativeFetch, nativeStore, cleanup };
}
describe('preview shutdown race: pending operations remain quarantined', () => {
  it('1. pending network callback after exit cannot access real transport', async () => {
    const h = await harness(); try {
      h.runtime.beginPreview('customer');
      const pending = Promise.resolve().then(() => h.apiFetch('/orders', { method: 'POST' }));
      h.runtime.beginPreviewShutdown();
      expect(h.runtime.previewActive()).toBe(true);
      expect((await pending).success).toBe(false);
      await expect(fetch('http://192.168.1.2:3000/api/orders')).rejects.toThrow('مسدود');
      expect(h.nativeFetch).not.toHaveBeenCalled();
    } finally { h.cleanup(); }
  });
  it('2. delayed writes and deletes never touch persistent storage', async () => {
    const h = await harness(); try {
      h.runtime.beginPreview('customer');
      await h.appStorage.setItem('user', { id: 'demo' });
      const delayed = Promise.resolve().then(async () => {
        await h.appStorage.setItem('user', { id: 'late' });
        await h.appStorage.removeItem('real-session');
        return h.appStorage.getItem('user', 'safe-default');
      });
      h.runtime.beginPreviewShutdown();
      expect(await delayed).toBe('safe-default');
      expect(h.nativeStore.getItem).not.toHaveBeenCalled();
      expect(h.nativeStore.setItem).not.toHaveBeenCalled();
      expect(h.nativeStore.removeItem).not.toHaveBeenCalled();
    } finally { h.cleanup(); }
  });
  it('3. late token/session callbacks cannot read or overwrite a real token', async () => {
    const h = await harness(); try {
      h.auth.setApiAuthToken('real-value');
      h.runtime.beginPreview('worker');
      const delayed = Promise.resolve().then(async () => {
        h.auth.setApiAuthToken('late-preview-token');
        await h.auth.attachStoredAuthToken(h.appStorage, 'WORKER_TOKEN');
        return h.auth.getApiAuthToken();
      });
      h.runtime.beginPreviewShutdown();
      expect(await delayed).toBe('');
      expect(h.nativeStore.getItem).not.toHaveBeenCalled();
      expect(h.runtime.previewActive()).toBe(true);
    } finally { h.cleanup(); }
  });
  it('4. old response continuation during reload cannot mutate persisted state', async () => {
    const h = await harness(); try {
      h.runtime.beginPreview('customer');
      const lateResponse = h.apiFetch('/orders').then(async (response) => {
        await Promise.resolve();
        await h.appStorage.setItem('orders', response);
        h.auth.setApiAuthToken('stale');
      });
      h.runtime.beginPreviewShutdown();
      await lateResponse;
      expect(await h.appStorage.getItem('orders', null)).toBe(null);
      expect(h.auth.getApiAuthToken()).toBe('');
      expect(h.nativeStore.setItem).not.toHaveBeenCalled();
      expect(h.nativeFetch).not.toHaveBeenCalled();
    } finally { h.cleanup(); }
  });
  it('repeated exits remain guarded and cannot restart a retired runtime', async () => {
    const h = await harness(); try {
      h.runtime.beginPreview('worker');
      h.runtime.beginPreviewShutdown();
      h.runtime.beginPreviewShutdown();
      h.runtime.endPreview();
      h.runtime.beginPreview('customer');
      expect(h.runtime.previewActive()).toBe(true);
      expect(h.runtime.previewClosing()).toBe(true);
      expect((await h.apiFetch('/orders')).success).toBe(false);
      expect(h.nativeFetch).not.toHaveBeenCalled();
    } finally { h.cleanup(); }
  });
});
