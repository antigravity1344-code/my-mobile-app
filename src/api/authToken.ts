import { previewActive } from '../components/native/previewRuntime';
let currentToken = '';

export function setApiAuthToken(token: string): void {
  if (previewActive()) return;
  currentToken = token || '';
}

export function getApiAuthToken(): string {
  if (previewActive()) return '';
  return currentToken;
}

export async function attachStoredAuthToken(
  store: { getItem<T>(key: string, defaultValue: T): Promise<T> },
  storageKey: string,
): Promise<void> {
  if (previewActive()) return;
  const saved = await store.getItem<unknown>(storageKey, '');
  if (typeof saved === 'string' && saved.trim()) {
    currentToken = saved.trim();
  } else {
    currentToken = '';
  }
}
