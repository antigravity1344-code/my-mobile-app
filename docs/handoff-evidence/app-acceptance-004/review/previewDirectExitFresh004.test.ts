import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '' } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: store.read, setItem: store.write, removeItem: store.remove } }));
let runtime: typeof import('@app/src/components/native/previewRuntime');
let storage: typeof import('@app/src/utils/storage');
let api: typeof import('@app/src/api/apiClient');
let auth: typeof import('@app/src/api/authToken');
const prev = process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
const nativeFetch = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('fetch', nativeFetch);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
  store.read.mockReset(); store.write.mockReset(); store.remove.mockReset(); nativeFetch.mockReset();
  nativeFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{"success":true}' });
  // All dependents must share this fresh module registry, including audit and token/storage singletons.
  runtime = await import('@app/src/components/native/previewRuntime');
  storage = await import('@app/src/utils/storage');
  api = await import('@app/src/api/apiClient');
  auth = await import('@app/src/api/authToken');
  auth.setApiAuthToken('offline-sentinel');
});
afterEach(() => {
  runtime.endPreview();
  vi.unstubAllGlobals();
  if (prev === undefined) delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
  else process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = prev;
});
async function zeroEffects() {
  await storage.appStorage.setItem('OFFLINE_SESSION', { id: 'sample' });
  await storage.appStorage.removeItem('OFFLINE_SESSION');
  expect(await storage.appStorage.getItem('OFFLINE_SESSION', null)).toBe(null);
  expect(nativeFetch).not.toHaveBeenCalled();
  expect(store.read).not.toHaveBeenCalled();
  expect(store.write).not.toHaveBeenCalled();
  expect(store.remove).not.toHaveBeenCalled();
  expect(auth.getApiAuthToken()).toBe('');
}
describe('fresh runtime exit and initial-selection contract', () => {
  for (const role of ['customer', 'worker'] as const) {
    for (const exit of ['endPreview', 'beginPreviewShutdown'] as const) {
      it(`${role} ${exit} quarantines deferred callbacks in its own runtime`, async () => {
        expect(runtime.previewActive()).toBe(false);
        expect(runtime.previewClosing()).toBe(false);
        runtime.beginPreview(role);
        const epoch = runtime.previewGeneration();
        const pending = Promise.resolve().then(async () => {
          await auth.attachStoredAuthToken(storage.appStorage, 'OFFLINE_TOKEN');
          return api.apiFetch('/orders/PREVIEW-ORDER-1/start-response', { method: 'PUT' });
        });
        runtime[exit]();
        expect((await pending).success).toBe(false);
        expect(runtime.previewActive()).toBe(true);
        expect(runtime.previewClosing()).toBe(true);
        expect(runtime.previewCanCommit(epoch)).toBe(false);
        runtime.beginPreview(role);
        expect(runtime.previewClosing()).toBe(true);
        await zeroEffects();
      });
    }
  }
  it('initial real selection uses a fresh runtime that has never entered preview', async () => {
    expect(runtime.previewActive()).toBe(false);
    expect(runtime.previewClosing()).toBe(false);
    runtime.endPreview();
    expect(runtime.previewActive()).toBe(false);
    expect(runtime.previewClosing()).toBe(false);
    store.read.mockResolvedValue(JSON.stringify('offline-stored-token'));
    await auth.attachStoredAuthToken(storage.appStorage, 'OFFLINE_TOKEN');
    expect(auth.getApiAuthToken()).toBe('offline-stored-token');
    expect((await api.apiFetch('/users/me')).success).toBe(true);
    expect(store.read).toHaveBeenCalledTimes(1);
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(store.write).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });
  for (const role of ['customer', 'worker'] as const) {
    it(`release __DEV__=false ignores ${role} preview flag in fresh runtime`, async () => {
      vi.stubGlobal('__DEV__', false);
      runtime.beginPreview(role);
      expect(runtime.previewActive()).toBe(false);
      expect(runtime.previewClosing()).toBe(false);
      expect(auth.getApiAuthToken()).toBe('offline-sentinel');
      expect((await api.apiFetch('/users/me')).success).toBe(true);
      expect(nativeFetch).toHaveBeenCalledTimes(1);
    });
  }
});
