import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginPreview, endPreview } from './previewRuntime';
import { previewAuditCounts } from './previewNetworkAudit';

const saved = process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
beforeEach(() => {
  vi.stubGlobal('__DEV__', true);
  process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = '1';
});
afterEach(() => {
  endPreview();
  vi.unstubAllGlobals();
  if (saved === undefined) delete process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW;
  else process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW = saved;
});

describe('preview outbound network barrier', () => {
  it('blocks external direct fetch without handing it to native transport', async () => {
    const original = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', original);
    beginPreview('customer');
    await expect(fetch('https://api.example.test/api/orders', { method: 'POST' })).rejects.toThrow('مسدود');
    expect(original).not.toHaveBeenCalled();
    expect(previewAuditCounts().blocked).toBe(1);
    endPreview();
    expect(globalThis.fetch).toBe(original);
  });
  it('permits only local development Metro port, and rejects other localhost ports', async () => {
    const native = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', native);
    beginPreview('worker');
    await fetch('http://127.0.0.1:8081/status');
    expect(native).toHaveBeenCalledTimes(1);
    await expect(fetch('http://127.0.0.1:3000/api/orders')).rejects.toThrow('مسدود');
    expect(native).toHaveBeenCalledTimes(1);
  });
  it('blocks direct XHR from calling original open', () => {
    class FakeXHR { open(_method: string, _url: string) { return undefined; } }
    const open = vi.spyOn(FakeXHR.prototype, 'open');
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    beginPreview('customer');
    const xhr = new XMLHttpRequest();
    expect(() => xhr.open('PUT', 'http://192.168.1.2:3000/api/orders')).toThrow('مسدود');
    expect(open).not.toHaveBeenCalled();
    endPreview();
    expect(XMLHttpRequest.prototype.open).toBe(open);
  });
});
