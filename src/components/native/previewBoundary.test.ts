import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const spy = vi.hoisted(() => ({ network: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '' } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: spy.read, setItem: spy.write, removeItem: spy.remove },
}));
import type * as Preview from './previewRuntime';
import type * as Api from '../../api/apiClient';
import type * as Storage from '../../utils/storage';
import type * as Auth from '../../api/authToken';
let beginPreview: typeof Preview.beginPreview;
let endPreview: typeof Preview.endPreview;
let apiFetch: typeof Api.apiFetch;
let appStorage: typeof Storage.appStorage;
let attachStoredAuthToken: typeof Auth.attachStoredAuthToken;
let getApiAuthToken: typeof Auth.getApiAuthToken;
let setApiAuthToken: typeof Auth.setApiAuthToken;

const savedEnv = process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
beforeEach(async () => {
  vi.resetModules();
  ({beginPreview,endPreview} = await import('./previewRuntime'));
  ({apiFetch} = await import('../../api/apiClient'));
  ({appStorage} = await import('../../utils/storage'));
  ({attachStoredAuthToken,getApiAuthToken,setApiAuthToken} = await import('../../api/authToken'));
  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('fetch', spy.network);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
  spy.network.mockReset(); spy.read.mockReset(); spy.write.mockReset(); spy.remove.mockReset();
  endPreview();
  setApiAuthToken('real-token-unchanged');
});
afterEach(() => {
  endPreview(); setApiAuthToken('');
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
  else process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = savedEnv;
});

describe('preview transport and storage isolation', () => {
  it('never accesses network or persistent storage while preview is active', async () => {
    beginPreview('customer');
    await appStorage.setItem('user', { id: 'PREVIEW-CUSTOMER' });
    expect(await appStorage.getItem('user', null)).toEqual({ id: 'PREVIEW-CUSTOMER' });
    expect((await apiFetch('/orders')).orders).toHaveLength(1);
    expect((await apiFetch('/orders', { method: 'POST', body: '{}' })).success).toBe(false);
    expect((await apiFetch('/unknown', { method: 'PUT' })).success).toBe(false);
    await appStorage.removeItem('user');
    expect(spy.network).not.toHaveBeenCalled();
    expect(spy.read).not.toHaveBeenCalled();
    expect(spy.write).not.toHaveBeenCalled();
    expect(spy.remove).not.toHaveBeenCalled();
  });
  it('does not overwrite a previously attached real token', async () => {
    beginPreview('worker');
    expect(getApiAuthToken()).toBe('');
    setApiAuthToken('preview-token');
    await attachStoredAuthToken(appStorage, 'PREVIEW_TOKEN');
    expect(getApiAuthToken()).toBe('');
    endPreview();
    // Old preview context cannot disclose the pre-existing real token before reload.
    expect(getApiAuthToken()).toBe('');
    expect(spy.read).not.toHaveBeenCalled();
  });
  it('isolates preview cache from real persistent storage', async () => {
    beginPreview('worker');
    await appStorage.setItem('user', { id: 'preview' });
    endPreview();
    spy.read.mockResolvedValue(null);
    // A quarantined preview reads no persistent storage until a new JS runtime starts.
    expect(await appStorage.getItem('user', 'real-default')).toBe('real-default');
    expect(spy.read).not.toHaveBeenCalled();
  });
});
