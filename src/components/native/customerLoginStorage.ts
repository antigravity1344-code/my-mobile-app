import { setApiAuthToken } from '../../api/authToken';

export const CUSTOMER_LOGGED_IN_KEY = 'PAKSHO_IS_LOGGED_IN';
export const CUSTOMER_USER_KEY = 'PAKSHO_USER_CUSTOMER';
export const CUSTOMER_ROLE_KEY = 'PAKSHO_ACTIVE_ROLE';
export const CUSTOMER_TOKEN_KEY = 'PAKSHO_CUSTOMER_TOKEN';

export interface CustomerSessionUser {
  id: string;
  phone: string;
  name: string;
  avatar: string;
  role: string;
  isProfileComplete?: boolean;
}

interface SessionStore {
  getItem<T>(key: string, defaultValue: T): Promise<T>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export async function saveCustomerSession(
  store: SessionStore,
  user: CustomerSessionUser,
  token?: string,
): Promise<void> {
  await store.setItem(CUSTOMER_LOGGED_IN_KEY, 'true');
  await store.setItem(CUSTOMER_ROLE_KEY, 'CUSTOMER');
  await store.setItem(CUSTOMER_USER_KEY, JSON.stringify(user));
  if (typeof token === 'string' && token.trim()) {
    await store.setItem(CUSTOMER_TOKEN_KEY, token.trim());
    setApiAuthToken(token.trim());
  }
}

export async function clearCustomerSession(store: SessionStore): Promise<void> {
  await store.setItem(CUSTOMER_LOGGED_IN_KEY, 'false');
  await store.removeItem(CUSTOMER_USER_KEY);
  await store.removeItem(CUSTOMER_ROLE_KEY);
  await store.removeItem(CUSTOMER_TOKEN_KEY);
  setApiAuthToken('');
}

export function parseCustomerSession(
  savedLogin: unknown,
  savedUserRaw: unknown,
): CustomerSessionUser | null {
  if (savedLogin !== 'true' || savedUserRaw == null || savedUserRaw === '') return null;
  try {
    const user = typeof savedUserRaw === 'string' ? JSON.parse(savedUserRaw) : savedUserRaw;
    if (!user || typeof user !== 'object' || typeof user.id !== 'string' || user.id.trim() === '') {
      return null;
    }
    return user as CustomerSessionUser;
  } catch {
    return null;
  }
}

export async function loadCustomerSession(
  store: SessionStore,
): Promise<CustomerSessionUser | null> {
  const savedLogin = await store.getItem(CUSTOMER_LOGGED_IN_KEY, 'false');
  const savedUserRaw = await store.getItem<unknown>(CUSTOMER_USER_KEY, '');
  const savedToken = await store.getItem<unknown>(CUSTOMER_TOKEN_KEY, '');
  if (typeof savedToken === 'string' && savedToken.trim()) {
    setApiAuthToken(savedToken.trim());
  }
  return parseCustomerSession(savedLogin, savedUserRaw);
}
