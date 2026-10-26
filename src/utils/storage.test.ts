import { afterEach, describe, expect, it, vi } from 'vitest';

const preview = vi.hoisted(() => ({ active: false, values: new Map<string, string>() }));
vi.mock('../components/native/previewRuntime', () => ({
  previewActive: () => preview.active,
  previewRead: (key: string) => preview.values.get(key) ?? null,
  previewWrite: (key: string, value: string) => preview.values.set(key, value),
  previewRemove: (key: string) => preview.values.delete(key),
}));

afterEach(() => {
  preview.active = false;
  preview.values.clear();
  vi.doUnmock('@react-native-async-storage/async-storage');
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('storage backend availability', () => {
  it('survives native import failure with session-only write/read/remove', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.doMock('@react-native-async-storage/async-storage', () => {
      throw new Error('NativeModule: AsyncStorage is null');
    });
    const { appStorage } = await import('./storage');
    expect(warning).not.toHaveBeenCalled();
    expect(await appStorage.getItem('address', 'default')).toBe('default');
    await appStorage.setItem('address', { city: 'Tehran' });
    expect(await appStorage.getItem('address', null)).toEqual({ city: 'Tehran' });
    await appStorage.removeItem('address');
    expect(await appStorage.getItem('address', null)).toBeNull();
    expect(warning).toHaveBeenCalledTimes(1);
    vi.resetModules();
    const freshRuntime = await import('./storage');
    expect(await freshRuntime.appStorage.getItem('address', null)).toBeNull();
  });

  it('uses persistent storage when available across a fresh JS runtime', async () => {
    const values = new Map<string, string>();
    const backend = {
      getItem: vi.fn(async (key: string) => values.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn(async (key: string) => { values.delete(key); }),
    };
    vi.doMock('@react-native-async-storage/async-storage', () => ({ default: backend }));
    const { appStorage } = await import('./storage');
    await appStorage.setItem('address', 'saved');
    expect(backend.setItem).toHaveBeenCalledWith('address', '"saved"');
    vi.resetModules();
    const freshRuntime = await import('./storage');
    expect(await freshRuntime.appStorage.getItem('address', null)).toBe('saved');
    await freshRuntime.appStorage.removeItem('address');
    expect(values.has('address')).toBe(false);
  });

  it('does not load native storage in preview', async () => {
    const factory = vi.fn(() => { throw new Error('Must not load native storage'); });
    vi.doMock('@react-native-async-storage/async-storage', factory);
    preview.active = true;
    const { appStorage } = await import('./storage');
    await appStorage.setItem('address', 'preview');
    expect(await appStorage.getItem('address', null)).toBe('preview');
    await appStorage.removeItem('address');
    expect(await appStorage.getItem('address', null)).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });
});
