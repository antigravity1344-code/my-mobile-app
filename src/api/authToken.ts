let currentToken = '';

export function setApiAuthToken(token: string): void {
  currentToken = token || '';
}

export function getApiAuthToken(): string {
  return currentToken;
}

export async function attachStoredAuthToken(
  store: { getItem<T>(key: string, defaultValue: T): Promise<T> },
  storageKey: string,
): Promise<void> {
  const saved = await store.getItem<unknown>(storageKey, '');
  if (typeof saved === 'string' && saved.trim()) {
    currentToken = saved.trim();
  }
}
