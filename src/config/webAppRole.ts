export type WebAppRole = 'customer' | 'worker';

export function webAppRoleFromSearch(search: string): WebAppRole | null {
  const raw = String(search || '');
  const query = raw.startsWith('?') ? raw.slice(1) : raw;
  try {
    const role = new URLSearchParams(query).get('role');
    if (role === 'worker') return 'worker';
    if (role === 'customer') return 'customer';
  } catch {
    return null;
  }
  return null;
}
