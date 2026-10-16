/** DEVELOPMENT-ONLY runtime diagnostic. Never records URLs, headers, tokens or bodies. */
let restore: (() => void) | undefined;
let blocked = 0;
let mocked = 0;

function isMetroRequest(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.port === '8081' && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}
export function previewAuditMock(method: string): void {
  mocked += 1;
  console.info('[PAKSHO_PREVIEW_NETWORK_AUDIT]', 'mocked_request', method.toUpperCase(), 'mocked_count', mocked);
}
export function previewAuditCounts(): { mocked: number; blocked: number } {
  return { mocked, blocked };
}
export function startPreviewNetworkAudit(): void {
  if (restore) return;
  mocked = 0;
  blocked = 0;
  const originalFetch = globalThis.fetch;
  const originalOpen = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.prototype.open : undefined;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (isMetroRequest(url)) return originalFetch(input, init);
    blocked++;
    console.warn('[PAKSHO_PREVIEW_NETWORK_AUDIT]', 'blocked_fetch', 'blocked_count', blocked);
    return Promise.reject(new Error('درخواست خارجی در حالت پیش‌نمایش مسدود شد.'));
  }) as typeof fetch;
  if (originalOpen && typeof XMLHttpRequest !== 'undefined') {
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
      if (!isMetroRequest(String(url))) {
        blocked++;
        console.warn('[PAKSHO_PREVIEW_NETWORK_AUDIT]', 'blocked_xhr', 'blocked_count', blocked);
        throw new Error('درخواست خارجی در حالت پیش‌نمایش مسدود شد.');
      }
      return (originalOpen as (...args: any[]) => void).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
  }
  console.info('[PAKSHO_PREVIEW_NETWORK_AUDIT]', 'guard_enabled');
  restore = () => {
    globalThis.fetch = originalFetch;
    if (originalOpen && typeof XMLHttpRequest !== 'undefined') XMLHttpRequest.prototype.open = originalOpen;
    console.info('[PAKSHO_PREVIEW_NETWORK_AUDIT]', 'guard_disabled', 'mocked_count', mocked, 'blocked_count', blocked);
  };
}
export function stopPreviewNetworkAudit(): void {
  restore?.();
  restore = undefined;
}
