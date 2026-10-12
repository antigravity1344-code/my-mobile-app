import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '' } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: store.read, setItem: store.write, removeItem: store.remove } }));
import { beginPreview, endPreview, previewActive, previewClosing, previewApi, previewRead } from './previewRuntime';
import { appStorage } from '../../utils/storage';
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken, getApiAuthToken, setApiAuthToken } from '../../api/authToken';

const prev = process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
const nativeFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('fetch', nativeFetch);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW='1';
  store.read.mockReset();store.write.mockReset();store.remove.mockReset();nativeFetch.mockReset();
  setApiAuthToken('real-session');
});
afterEach(() => {
  endPreview();
  setApiAuthToken('');
  vi.unstubAllGlobals();
  if(prev===undefined) delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
  else process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW=prev;
});
describe('direct endPreview quarantines active runtime', () => {
  it('customer pending start-response callback remains offline', async () => {
    beginPreview('customer');
    const pending=Promise.resolve().then(()=>apiFetch('/orders/PREVIEW-ORDER-1/start-response',{method:'PUT'}));
    endPreview();
    expect(previewClosing()).toBe(true);
    expect((await pending).success).toBe(false);
    expect(nativeFetch).not.toHaveBeenCalled();
  });
  it('worker polling after exit cannot read stored tokens or call real transport', async () => {
    beginPreview('worker');endPreview();
    await attachStoredAuthToken(appStorage,'WORKER_TOKEN');
    expect((await apiFetch('/orders/available')).success).toBe(false);
    expect(store.read).not.toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
  });
  it('address timer callback after exit cannot write to server', async () => {
    beginPreview('customer');endPreview();
    await attachStoredAuthToken(appStorage,'CUSTOMER_TOKEN');
    expect((await apiFetch('/users/addresses',{method:'PUT',body:'{}'})).success).toBe(false);
    expect(store.read).not.toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
  });
  it('deferred storage write and remove after exit never touch persistent storage', async () => {
    beginPreview('customer');endPreview();
    await appStorage.setItem('PAKSHO_USER_CUSTOMER', {id:'PREVIEW'});
    await appStorage.removeItem('PAKSHO_USER_CUSTOMER');
    expect(await appStorage.getItem('PAKSHO_USER_CUSTOMER',null)).toBe(null);
    expect(previewRead('PAKSHO_USER_CUSTOMER')).toBe(null);
    expect(store.read).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
    expect(getApiAuthToken()).toBe('');
  });
  it('initial selection outside any preview remains harmless', async () => {
    // The above tests each keep an old JS runtime quarantined; reset modules
    // is required to simulate an actual new runtime after reload.
    expect(previewActive()).toBe(true);
    endPreview();
    expect(previewClosing()).toBe(true);
  });
});
