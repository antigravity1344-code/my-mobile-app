import { setApiAuthToken } from '../../api/authToken';

export const WORKER_LOGGED_IN_KEY = 'PAKSHO_IS_LOGGED_IN_WORKER';
export const WORKER_USER_KEY = 'PAKSHO_USER_WORKER';
export const WORKER_ROLE_KEY = 'PAKSHO_ACTIVE_ROLE';
export const WORKER_TOKEN_KEY = 'PAKSHO_WORKER_TOKEN';

export interface WorkerSessionUser {
  id: string;
  phone: string;
  name: string;
  avatar: string;
  role: string;
  status: string;
}

interface SessionStore {
  getItem<T>(key: string, defaultValue: T): Promise<T>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export async function saveWorkerSession(
  store: SessionStore,
  user: WorkerSessionUser,
  token?: string,
): Promise<void> {
  await store.setItem(WORKER_LOGGED_IN_KEY, 'true');
  await store.setItem(WORKER_ROLE_KEY, 'WORKER');
  await store.setItem(WORKER_USER_KEY, JSON.stringify(user));
  if (typeof token === 'string' && token.trim()) {
    await store.setItem(WORKER_TOKEN_KEY, token.trim());
    setApiAuthToken(token.trim());
  }
}

export async function clearWorkerSession(store: SessionStore): Promise<void> {
  await store.setItem(WORKER_LOGGED_IN_KEY, 'false');
  await store.removeItem(WORKER_USER_KEY);
  await store.removeItem(WORKER_ROLE_KEY);
  await store.removeItem(WORKER_TOKEN_KEY);
  setApiAuthToken('');
}

export function parseWorkerSession(
  savedLogin: unknown,
  savedUserRaw: unknown,
): WorkerSessionUser | null {
  if (savedLogin !== 'true' || savedUserRaw == null || savedUserRaw === '') return null;
  try {
    const user = typeof savedUserRaw === 'string' ? JSON.parse(savedUserRaw) : savedUserRaw;
    if (!user || typeof user !== 'object' || typeof user.id !== 'string' || user.id.trim() === '') {
      return null;
    }
    return user as WorkerSessionUser;
  } catch {
    return null;
  }
}

export async function loadWorkerSession(
  store: SessionStore,
): Promise<WorkerSessionUser | null> {
  const savedLogin = await store.getItem(WORKER_LOGGED_IN_KEY, 'false');
  const savedUserRaw = await store.getItem<unknown>(WORKER_USER_KEY, '');
  const savedToken = await store.getItem<unknown>(WORKER_TOKEN_KEY, '');
  if (typeof savedToken === 'string' && savedToken.trim()) {
    setApiAuthToken(savedToken.trim());
  }
  return parseWorkerSession(savedLogin, savedUserRaw);
}
