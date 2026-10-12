import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let beginPreview: any, endPreview: any, previewActive: any, setPreviewScenario: any, previewApi: any, apiFetch: any, attachStoredAuthToken: any, getApiAuthToken: any, setApiAuthToken: any, orderService: any, appStorage: any, calls: any, records: any, CUSTOMER_TOKEN_KEY: any, WORKER_TOKEN_KEY: any;
const network = vi.fn();
let sentAuthorization = false;
const oldSwitch = process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;

beforeEach(async () => {
  vi.resetModules();
  ({ beginPreview, endPreview, previewActive, setPreviewScenario, previewApi } = await import('@app/src/components/native/previewRuntime'));
  ({ apiFetch } = await import('@app/src/api/apiClient'));
  ({ attachStoredAuthToken, getApiAuthToken, setApiAuthToken } = await import('@app/src/api/authToken'));
  ({ orderService } = await import('@app/src/features/orders/services/orderService'));
  ({ appStorage } = await import('@app/src/utils/storage'));
  ({ calls, records } = await import('./storageMock'));
  ({ CUSTOMER_TOKEN_KEY } = await import('@app/src/components/native/customerLoginStorage'));
  ({ WORKER_TOKEN_KEY } = await import('@app/src/components/native/workerLoginStorage'));

  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('fetch', network);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
  endPreview();
  setApiAuthToken(randomUUID());
  records.clear(); calls.read = 0; calls.write = 0; calls.remove = 0;
  sentAuthorization = false;
  records.set('PAKSHO_USER_CUSTOMER', JSON.stringify({ id: 'OFFLINE-EXISTING' }));
  network.mockReset();
  // Offline-only sentinel: records a call but NEVER uses fetch/socket/HTTP.
  network.mockImplementation(async (_url: string, options: RequestInit = {}) => {
    sentAuthorization = Boolean((options.headers as Record<string, string> | undefined)?.Authorization);
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: false, message: 'offline sentinel' }) };
  });
});

afterEach(() => {
  endPreview(); setApiAuthToken('');
  vi.useRealTimers(); vi.unstubAllGlobals();
  if (oldSwitch === undefined) delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
  else process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = oldSwitch;
});

async function assertZeroEffects() {
  const before = [...records.entries()];
  await appStorage.removeItem('PAKSHO_USER_CUSTOMER');
  await appStorage.getItem('PAKSHO_USER_CUSTOMER', null);
  expect(network.mock.calls.length).toBe(0);
  expect(calls.read).toBe(0);
  expect(calls.write).toBe(0);
  expect(calls.remove).toBe(0);
  expect(getApiAuthToken()).toBe('');
  expect(sentAuthorization).toBe(false);
  expect([...records.entries()]).toEqual(before);
  console.info('APP004_SECURITY_REACHED', JSON.stringify({ network: network.mock.calls.length, read: calls.read, write: calls.write, remove: calls.remove, tokenEmpty: getApiAuthToken() === '', authorizationSent: sentAuthorization }));
}

describe('actual combined-source preview boundary', () => {
  const mutations: Array<[string, string]> = [
    ['/orders/PREVIEW-ORDER-1/start', 'PUT'],
    ['/orders/PREVIEW-ORDER-1/start-response', 'PUT'],
    ['/admin/orders/PREVIEW-ORDER-1/start-decision', 'PUT'],
    ['/orders/PREVIEW-ORDER-1/start', 'POST'],
    ['/orders/PREVIEW-ORDER-1/start-response', 'POST'],
    ['/admin/orders/PREVIEW-ORDER-1/start-decision', 'POST'],
  ];
  it.each(mutations)('ACTIVE preview denies %s %s before outbound fetch', async (endpoint, method) => {
    beginPreview('worker');
    const result = await apiFetch(endpoint, { method, body: JSON.stringify({ acceptanceKey: 'preview-key', promptEventId: 'preview-prompt', requestId: 'preview-request' }) });
    expect(result.success).toBe(false);
    expect(network.mock.calls.length).toBe(0);
    expect(calls.read + calls.write + calls.remove).toBe(0);
    expect(getApiAuthToken().length).toBe(0);
  });

  it('ACTIVE preview unknown and admin read routes fail closed with no fallback', async () => {
    beginPreview('customer');
    expect((await apiFetch('/admin/orders/PREVIEW-ORDER-1/start-events')).success).toBe(false);
    expect((await apiFetch('https://invalid.example/admin/orders/anything/start-decision')).success).toBe(false);
    expect(network.mock.calls.length).toBe(0);
  });

  it('actual customer start-response service is blocked while ACTIVE', async () => {
    beginPreview('customer');
    expect((await orderService.respondToStart('PREVIEW-ORDER-1', 'yes', 'preview-prompt')).success).toBe(false);
    expect(network.mock.calls.length).toBe(0);
    expect(calls.read + calls.write + calls.remove).toBe(0);
  });

  it('current preview fixture omits references necessary to show new start controls', async () => {
    beginPreview('worker');
    setPreviewScenario('ACCEPTED');
    const order = (await previewApi('/orders')).orders[0];
    expect(order.startAcceptanceKey).toBeUndefined();
    expect(order.startPrompt).toBeUndefined();
    expect(order.startPromptEventId).toBeUndefined();
  });

  it('entrypoints quarantine boundary before requesting reload', () => {
    for (const file of ['App.customer.tsx', 'App.worker.tsx']) {
      const source = readFileSync(process.env.APP004_SOURCE + '/' + file, 'utf8');
      expect(source).toContain('onExit={() => { beginPreviewShutdown(); DevSettings.reload(); }}');
    }
  });

  it('EXIT acceptance: pending actual customer start response stays offline until reload completes', async () => {
    beginPreview('customer');
    // Exact service used by OrdersContext. It yields at its async token attach.
    const pending = orderService.respondToStart('PREVIEW-ORDER-1', 'yes', 'preview-prompt');
    // Exact current entrypoint exit order. Native reload completion has not occurred yet.
    endPreview();
    const requestReload = vi.fn();
    requestReload();
    await pending;
    expect(previewActive()).toBe(true);
    expect(sentAuthorization).toBe(false);
    // Original zero-effect assertion retained; quarantine diagnostics updated.
    expect(network.mock.calls.length, 'preview-origin start response reached real transport during exit').toBe(0);
    await assertZeroEffects();
    expect(requestReload).toHaveBeenCalledTimes(1);
  });

  it('EXIT acceptance: scheduled preview worker refresh stays offline during deferred reload', async () => {
    vi.useFakeTimers();
    setApiAuthToken('');
    records.set(WORKER_TOKEN_KEY, JSON.stringify(randomUUID()));
    beginPreview('worker');
    // Source-equivalent NativeWorkerPortal poll, including actual stored-token attach.
    const timer = setInterval(() => void (async () => {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      await apiFetch('/orders/available');
    })(), 10000);
    endPreview();
    const requestReload = vi.fn();
    requestReload();
    await vi.advanceTimersByTimeAsync(10000);
    clearInterval(timer);
    expect(calls.read).toBe(0);
    expect(sentAuthorization).toBe(false);
    expect(network.mock.calls.length, 'preview-origin poll reached real transport during deferred reload').toBe(0);
    await assertZeroEffects();
    expect(requestReload).toHaveBeenCalledTimes(1);
  });

  it('EXIT acceptance: pending profile address timer cannot mutate real account during deferred reload', async () => {
    vi.useFakeTimers();
    setApiAuthToken('');
    records.set(CUSTOMER_TOKEN_KEY, JSON.stringify(randomUUID()));
    beginPreview('customer');
    // Exact timer body from ProfileContext.tsx:149-157 after a local preview address edit.
    const addresses = [{ id: 'preview-address', city: 'Tehran', district: 'sample', street: 'sample' }];
    const timer = setTimeout(() => void (async () => {
      await attachStoredAuthToken(appStorage, CUSTOMER_TOKEN_KEY);
      await apiFetch('/users/addresses', { method: 'PUT', body: JSON.stringify({ addresses }) });
    })(), 250);
    endPreview();
    const requestReload = vi.fn();
    requestReload();
    await vi.advanceTimersByTimeAsync(250);
    clearTimeout(timer);
    expect(calls.read).toBe(0);
    expect(sentAuthorization).toBe(false);
    expect(network.mock.calls.length, 'preview-origin address timer reached authenticated real transport during deferred reload').toBe(0);
    await assertZeroEffects();
    expect(requestReload).toHaveBeenCalledTimes(1);
  });

  it('EXIT acceptance: mounted preview callback cannot write real persisted storage before reload', async () => {
    beginPreview('customer');
    const mountedPreviewCallback = () => appStorage.setItem('PAKSHO_USER_CUSTOMER', JSON.stringify({ id: 'PREVIEW-CUSTOMER' }));
    endPreview();
    const requestReload = vi.fn();
    requestReload();
    await mountedPreviewCallback();
    expect(calls.write, 'preview-origin callback reached real persistent storage during deferred reload').toBe(0);
    await assertZeroEffects();
    expect(requestReload).toHaveBeenCalledTimes(1);
  });
});
