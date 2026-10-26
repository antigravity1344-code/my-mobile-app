import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Address from './workerAddress';

const spy = vi.hoisted(() => ({ network: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '' } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: spy.read, setItem: spy.write, removeItem: spy.remove },
}));
let address: typeof Address;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('__DEV__', true);
  vi.stubEnv('EXPO_PUBLIC_PAKSHO_UI_PREVIEW', '1');
  vi.stubGlobal('fetch', spy.network);
  spy.network.mockReset(); spy.read.mockReset(); spy.write.mockReset(); spy.remove.mockReset();
  spy.read.mockResolvedValue(JSON.stringify('worker-test-token'));
  address = await import('./workerAddress');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('worker residence address client', () => {
  it('loads from the server with the worker token and sends only address on save', async () => {
    spy.network.mockResolvedValueOnce(reply({ success: true, address: '  آدرس قدیمی  ' }));
    expect(await address.loadWorkerAddress()).toEqual({ ok: true, address: '  آدرس قدیمی  ' });
    expect(spy.read).toHaveBeenCalledWith('PAKSHO_WORKER_TOKEN');
    expect(spy.network.mock.calls[0][0]).toMatch(/\/api\/workers\/me\/address$/);
    expect(spy.network.mock.calls[0][1].headers.Authorization).toBe('Bearer worker-test-token');
    spy.network.mockResolvedValueOnce(reply({ success: true, address: 'آدرس جدید' }));
    expect(await address.saveWorkerAddress('  آدرس جدید  ')).toEqual({ ok: true, address: 'آدرس جدید' });
    expect(spy.network.mock.calls[1][1].method).toBe('PUT');
    expect(JSON.parse(spy.network.mock.calls[1][1].body)).toEqual({ address: 'آدرس جدید' });
    expect(spy.write).not.toHaveBeenCalled();
  });

  it('rejects empty, too long and control-character input before any request', async () => {
    for (const value of ['', ' \n\t ', 'ا'.repeat(301), 'الف\u0000ب']) {
      expect(await address.saveWorkerAddress(value)).toEqual({ ok: false, message: address.ADDRESS_VALIDATION_MESSAGE });
    }
    expect(spy.network).not.toHaveBeenCalled();
    expect(address.validWorkerAddress('ا'.repeat(300))).toBe(true);
    expect(address.validWorkerAddress('تهران\nخیابان نمونه')).toBe(true);
  });

  it('does not report malformed or failed responses as successful saves', async () => {
    for (const body of [{ success: true }, { success: true, address: 2 }, null, { success: false, message: 'خطای ذخیره' }]) {
      spy.network.mockResolvedValueOnce(reply(body));
      expect((await address.saveWorkerAddress('آدرس جدید')).ok).toBe(false);
    }
  });

  it('keeps the draft and saved value on failure, and accepts only acknowledged success', () => {
    const reduce = address.workerAddressReducer;
    let state = reduce(address.initialAddressState, { type: 'loaded', result: { ok: true, address: 'قدیمی' } });
    state = reduce(state, { type: 'edit', value: 'جدید' });
    state = reduce(state, { type: 'save' });
    expect(state.phase).toBe('saving');
    state = reduce(state, { type: 'saved', result: { ok: false, message: 'قطع ارتباط' } });
    expect(state).toMatchObject({ phase: 'ready', draft: 'جدید', savedAddress: 'قدیمی', error: true, message: 'قطع ارتباط' });
    state = reduce(state, { type: 'saved', result: { ok: true, address: 'جدید' } });
    expect(state).toMatchObject({ phase: 'ready', draft: 'جدید', savedAddress: 'جدید', error: false, message: address.ADDRESS_SAVED_MESSAGE });
  });

  it('load failure keeps the form unavailable until a successful retry', () => {
    const reduce = address.workerAddressReducer;
    let state = reduce(address.initialAddressState, { type: 'loaded', result: { ok: false, message: 'قطع' } });
    expect(state).toMatchObject({ phase: 'loadError', savedAddress: null, error: true });
    state = reduce(state, { type: 'load' });
    expect(state).toMatchObject({ phase: 'loading', message: null });
    state = reduce(state, { type: 'loaded', result: { ok: true, address: '' } });
    expect(state).toMatchObject({ phase: 'ready', savedAddress: '', error: false });
  });

  it('reports expired or forbidden sessions and preserves the draft', async () => {
    for (const status of [401, 403]) {
      spy.network.mockResolvedValueOnce(reply({ success: false, message: 'ورود لازم است.' }, status));
      const result = await address.saveWorkerAddress('جدید');
      expect(result).toMatchObject({ ok: false, sessionExpired: true });
      const state = address.workerAddressReducer({ ...address.initialAddressState, draft: 'جدید', savedAddress: 'قدیمی' }, { type: 'saved', result });
      expect(state).toMatchObject({ sessionExpired: true, draft: 'جدید', savedAddress: 'قدیمی' });
    }
  });

  it('handles a disconnected transport without reporting success', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    spy.network.mockRejectedValue(new TypeError('offline'));
    expect((await address.loadWorkerAddress()).ok).toBe(false);
    expect((await address.saveWorkerAddress('جدید')).ok).toBe(false);
  });

  it('times out a stalled save and allows retry without losing the draft', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    spy.network.mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }));
    const pending = address.saveWorkerAddress('جدید');
    // The storage backend is loaded lazily before the network timeout starts.
    await vi.dynamicImportSettled();
    expect(spy.network).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;
    expect(result.ok).toBe(false);
    const state = address.workerAddressReducer({
      ...address.initialAddressState, phase: 'saving', savedAddress: 'قدیمی', draft: 'جدید',
    }, { type: 'saved', result });
    expect(state).toMatchObject({ phase: 'ready', draft: 'جدید', savedAddress: 'قدیمی' });
    spy.network.mockResolvedValueOnce(reply({ success: true, address: 'جدید' }));
    expect((await address.saveWorkerAddress(state.draft)).ok).toBe(true);
  });

  it('does not start a request after the screen is abandoned during token loading', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await address.loadWorkerAddress(controller.signal)).ok).toBe(false);
    expect(spy.network).not.toHaveBeenCalled();
  });

  it('preview reads synthetic address and refuses save without network or persistent storage', async () => {
    const preview = await import('./previewRuntime');
    preview.beginPreview('worker');
    const initial = await address.loadWorkerAddress();
    expect(initial.ok).toBe(true);
    expect((await address.saveWorkerAddress('آدرس واقعی ممنوع')).ok).toBe(false);
    expect(await address.loadWorkerAddress()).toEqual(initial);
    expect(spy.network).not.toHaveBeenCalled();
    expect(spy.read).not.toHaveBeenCalled();
    expect(spy.write).not.toHaveBeenCalled();
    expect(spy.remove).not.toHaveBeenCalled();
    preview.endPreview();
    expect((await address.saveWorkerAddress('پس از خروج')).ok).toBe(false);
    expect(spy.network).not.toHaveBeenCalled();
  });
});
