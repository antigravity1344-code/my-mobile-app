import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: null, expoGoConfig: null } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: vi.fn() } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) },
}));

const root = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('batch4 #1: the customer app never maps the specialist phone', () => {
  it('mapApiOrderForCustomer ignores cleanerPhone even if an old server sends it', async () => {
    const { mapApiOrderForCustomer } = await import('./orderService');
    const order = mapApiOrderForCustomer({
      id: 'ORD-1',
      status: 'ACCEPTED',
      serviceTitle: 'نظافت',
      address: 'تهران',
      date: '',
      time: '',
      price: 800000,
      createdAt: '2026-10-10T10:00:00.000Z',
      cleanerId: 'W1',
      cleanerName: 'متخصص',
      cleanerPhone: '09120000000',
    } as never);
    expect(order.cleaner?.name).toBe('متخصص');
    expect(order.cleaner?.phone).toBe('');
    expect(JSON.stringify(order).includes('09120000000')).toBe(false);
  });

  it('order search no longer looks at a specialist phone', () => {
    expect(read('features/orders/services/orderPayload.ts')).not.toMatch(/cleaner\?\.phone/);
  });
});

describe('batch4 #3: expired session (401) → message + logout in the customer app', () => {
  it('detects only a 401 on a request that carried a token, never on logout itself', async () => {
    const mod = await import('../../../api/sessionExpired');
    expect(mod.isSessionExpiredResponse({ httpStatus: 401 }, { hadToken: true, endpoint: '/orders' })).toBe(true);
    expect(mod.isSessionExpiredResponse({ httpStatus: 401 }, { hadToken: false, endpoint: '/orders' })).toBe(false);
    expect(mod.isSessionExpiredResponse({ httpStatus: 401 }, { hadToken: true, endpoint: '/auth/logout' })).toBe(false);
    expect(mod.isSessionExpiredResponse({ httpStatus: 401 }, { hadToken: true, endpoint: '/admin/orders' })).toBe(false);
    expect(mod.isSessionExpiredResponse({ httpStatus: 403 }, { hadToken: true, endpoint: '/orders' })).toBe(false);
    expect(mod.SESSION_EXPIRED_MESSAGE).toMatch(/دوباره وارد شوید/);
    const seen: string[] = [];
    const off = mod.onSessionExpired((m) => seen.push(m));
    mod.emitSessionExpired();
    off();
    mod.emitSessionExpired();
    expect(seen).toEqual([mod.SESSION_EXPIRED_MESSAGE]);
  });

  it('apiFetch emits it, and the customer app logs out through handleLogout after a dialog', () => {
    expect(read('api/apiClient.ts')).toMatch(/isSessionExpiredResponse\(parsed, \{ hadToken: Boolean\(token\), endpoint \}\)\) emitSessionExpired\(\)/);
    const app = read('components/native/NativeCustomerApp.tsx');
    const call = app.indexOf('useSessionExpiredLogout(isLoggedIn, handleLogout)');
    expect(call).toBeGreaterThan(-1);
    const hook = read('components/native/useSessionExpiredLogout.ts');
    expect(hook).toMatch(/onSessionExpired\(/);
    expect(hook).toMatch(/Alert\.alert\(/);
    expect(hook).toMatch(/tryEnter\(\)/);
  });
});

describe('batch4 #4: home refreshes periodically only while the app is in the foreground', () => {
  it('starts on active, stops on background, restarts on return, and cleans up', async () => {
    const { startForegroundOrderStatusWatch } = await import('./orderStatusWatch');
    let listener: ((s: string) => void) | undefined;
    const removed = vi.fn();
    const timers: Array<{ cb: () => void; cleared: boolean }> = [];
    const refresh = vi.fn(async () => undefined);
    const stop = startForegroundOrderStatusWatch({
      refresh,
      currentState: () => 'active',
      subscribe: (cb) => {
        listener = cb;
        return { remove: removed };
      },
      setIntervalFn: (cb) => {
        const t = { cb, cleared: false };
        timers.push(t);
        return t;
      },
      clearIntervalFn: (t) => {
        (t as { cleared: boolean }).cleared = true;
      },
    });
    expect(timers.length).toBe(1);
    listener?.('background');
    expect(timers[0].cleared).toBe(true);
    listener?.('active');
    expect(timers.length).toBe(2);
    expect(refresh).toHaveBeenCalledTimes(1); // immediate refresh on return
    listener?.('active');
    expect(timers.length).toBe(2); // no duplicate watch
    stop();
    expect(timers[1].cleared).toBe(true);
    expect(removed).toHaveBeenCalled();
  });

  it('CustomerHomeScreen uses it', () => {
    expect(read('components/native/CustomerHomeScreen.tsx')).toMatch(/startForegroundOrderStatusWatch\(/);
  });
});

describe('batch4 #5: one idempotency key per booking', () => {
  it('createClientRequestId makes server-valid, distinct keys', async () => {
    const { createClientRequestId } = await import('./clientRequestId');
    const a = createClientRequestId();
    const b = createClientRequestId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(a).not.toBe(b);
  });

  it('addOrder sends the key and the wizard keeps it across retries until success', () => {
    expect(read('features/orders/services/orderService.ts')).toMatch(/clientRequestId: newOrder\.clientRequestId/);
    const wizard = read('components/booking/NativeBookingWizard.tsx');
    expect(wizard).toMatch(/if \(!clientRequestKey\.current\) clientRequestKey\.current = createClientRequestId\(\)/);
    expect(wizard).toMatch(/clientRequestId: clientRequestKey\.current/);
    expect(wizard).toMatch(/if \(result\.success\) clientRequestKey\.current = null/);
    const webWizard = read('components/booking/BookingWizardContainer.tsx');
    expect(webWizard).toMatch(/if \(!clientRequestKey\.current\) clientRequestKey\.current = createClientRequestId\(\)/);
    expect(webWizard).toMatch(/clientRequestId: clientRequestKey\.current/);
    expect(webWizard).toMatch(/clientRequestKey\.current = null/);
  });
});
