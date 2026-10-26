import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const spy = vi.hoisted(() => ({ network: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '' } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: spy.read, setItem: spy.write, removeItem: spy.remove } }));
let client: typeof import('./workerServiceArea');
const catalog = { version: 1, defaultCityId: 'tehran', cities: [{ id: 'tehran', name: 'تهران', neighborhoods: ['ونک', 'پونک'] }] };
const area = { version: 1, catalogVersion: 1, cityId: 'tehran', cityName: 'تهران', neighborhoods: ['ونک'] };
const input = { cityId: 'tehran', neighborhoods: ['ونک'], catalogVersion: 1, expectedVersion: 0 };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(async () => {
  vi.resetModules(); vi.stubGlobal('__DEV__', true); vi.stubEnv('EXPO_PUBLIC_PAKSHO_UI_PREVIEW', '1');
  vi.stubGlobal('fetch', spy.network); spy.network.mockReset(); spy.read.mockReset(); spy.write.mockReset(); spy.remove.mockReset();
  spy.read.mockResolvedValue(JSON.stringify('worker-area-token'));
  client = await import('./workerServiceArea');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('loads only the signed-in worker area and saves strictly the selected area with optimistic versions', async () => {
  spy.network.mockResolvedValueOnce(reply({ success: true, area: null, catalog }));
  expect(await client.loadWorkerServiceArea()).toEqual({ ok: true, area: null, catalog });
  expect(spy.network.mock.calls[0][1].headers.Authorization).toBe('Bearer worker-area-token');
  expect(spy.read).toHaveBeenCalledWith('PAKSHO_WORKER_TOKEN');
  spy.network.mockResolvedValueOnce(reply({ success: true, area, catalog }));
  expect((await client.saveWorkerServiceArea({ ...input, userId: 'someone-else' } as typeof input)).ok).toBe(true);
  expect(JSON.parse(spy.network.mock.calls[1][1].body)).toEqual(input);
  expect(spy.network.mock.calls[1][0]).toMatch(/\/workers\/me\/service-area$/);
});
it('requires one existing city and at least one unique neighborhood from that city', () => {
  expect(client.validAreaSelection(catalog, 'tehran', ['ونک', 'پونک'])).toBe(true);
  for (const [cityId, neighborhoods] of [['missing', ['ونک']], ['tehran', []], ['tehran', ['نامعتبر']], ['tehran', ['ونک', 'ونک']]] as [string, string[]][]) {
    expect(client.validAreaSelection(catalog, cityId, neighborhoods)).toBe(false);
  }
});
it('never treats malformed or failed save responses as success and does not overwrite local storage', async () => {
  for (const response of [{ success: true, area: null, catalog }, { success: true, area: { ...area, version: '1' }, catalog },
    { success: true, area, catalog: {} }, { success: false, message: 'بازخوانی کنید' }]) {
    spy.network.mockResolvedValueOnce(reply(response));
    expect((await client.saveWorkerServiceArea(input)).ok).toBe(false);
  }
  expect(spy.write).not.toHaveBeenCalled();
});
it('reads preview fixtures and blocks saving before touching real network or worker storage', async () => {
  const preview = await import('./previewRuntime'); preview.beginPreview('worker');
  const result = await client.loadWorkerServiceArea();
  expect(result.ok).toBe(true);
  spy.read.mockClear();
  expect((await client.saveWorkerServiceArea(input)).ok).toBe(false);
  expect(spy.network).not.toHaveBeenCalled(); expect(spy.read).not.toHaveBeenCalled(); expect(spy.write).not.toHaveBeenCalled();
  preview.beginPreviewShutdown();
  expect((await client.loadWorkerServiceArea()).ok).toBe(false);
});
it('does not let a pending real request commit after switching into preview', async () => {
  let resolve!: (value: Response) => void;
  spy.network.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  const pending = client.saveWorkerServiceArea(input);
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  const preview = await import('./previewRuntime'); preview.beginPreview('worker');
  resolve(reply({ success: true, area, catalog }));
  expect((await pending).ok).toBe(false);
});
