import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Scoped version of the lightweight hook harness in workerOrderDetailFlow/supportLoadOrdering.
// Only platform, storage and HTTP boundaries are mocked; order hooks, screens and cards are real.
const harness = vi.hoisted(() => {
  type Slot = { value?: unknown; ref?: { current: unknown }; deps?: readonly unknown[]; cleanup?: () => void };
  const scopes = new Map<string, Slot[]>();
  let slots: Slot[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  const equal = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) =>
    Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  const createElement = (type: unknown, props: unknown, ...children: unknown[]) => ({
    type, props: { ...(props as object), ...(children.length ? { children } : {}) },
  });
  const memo = (factory: () => unknown, deps: readonly unknown[]) => {
    const index = cursor++;
    if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { deps, value: factory() };
    return slots[index].value;
  };
  const react = {
    default: { createElement },
    useState(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[index];
      return [slot.value, (next: unknown) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { ref: { current: initial } };
      return slots[index].ref;
    },
    useMemo: memo,
    useCallback: (callback: unknown, deps: readonly unknown[]) => memo(() => callback, deps),
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const index = cursor++;
      const old = slots[index];
      if (old && equal(old.deps, deps)) return;
      const slot: Slot = { deps, cleanup: old?.cleanup };
      slots[index] = slot;
      effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined; });
    },
    createContext(initial: unknown) {
      const context = { current: initial, Provider: ({ value }: { value: unknown }) => { context.current = value; return null; } };
      return context;
    },
    useContext: (context: { current: unknown }) => context.current,
  };
  const unmount = (scope: string) => { scopes.get(scope)?.forEach(slot => slot.cleanup?.()); scopes.delete(scope); };
  return {
    react, api: vi.fn(), alert: vi.fn(), attachToken: vi.fn(), unmount,
    render<T>(scope: string, render: () => T): T {
      slots = scopes.get(scope) ?? []; scopes.set(scope, slots); cursor = 0;
      const result = render();
      const pending = effects; effects = []; pending.forEach(effect => effect());
      return result;
    },
    reset() { [...scopes.keys()].forEach(unmount); slots = []; cursor = 0; effects = []; },
  };
});

vi.mock('react', () => harness.react);
vi.mock('react/jsx-runtime', () => ({
  jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }),
}));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (value: unknown) => value },
  Linking: { openURL: vi.fn() }, Alert: { alert: harness.alert },
  BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock('lucide-react-native', () => Object.fromEntries([
  'Briefcase', 'MapPin', 'Clock', 'CheckCircle', 'Phone', 'User', 'Calendar', 'ChevronLeft',
  'Star', 'Repeat', 'CheckCircle2', 'Sparkles', 'Check', 'AlertTriangle',
  'Search', 'X', 'RotateCw', 'SlidersHorizontal', 'Wallet', 'PackageCheck',
].map(name => [name, 'Icon'])));
vi.mock('../../theme/customerHome', () => ({ colors: {}, type: {}, shadowSm: {}, shadowMd: {} }));
vi.mock('../../theme', () => ({ colors: {}, fontFamily: {}, ui: {}, type: {}, TOUCH_MIN: 44 }));
vi.mock('../../utils/storage', () => ({ appStorage: {
  getItem: vi.fn(async (key: string, fallback: unknown) => key === 'PAKSHO_USER_CUSTOMER' ? JSON.stringify({ id: 'QA-CUSTOMER' }) : fallback),
  removeItem: vi.fn(async () => {}),
} }));
vi.mock('../../api/apiClient', () => ({ apiFetch: harness.api, CONNECTION_ERROR_MESSAGE: 'connection' }));
vi.mock('../../api/authToken', () => ({ attachStoredAuthToken: harness.attachToken }));
vi.mock('./previewRuntime', () => ({ previewActive: () => false }));
vi.mock('./WorkerIncomeReportNativePanel', () => ({ WorkerIncomeReportNativePanel: 'Income' }));
vi.mock('./WorkerWalletNativePanel', () => ({ WorkerWalletNativePanel: 'Wallet' }));
vi.mock('../../features/orders/components/OrderFilterTabs', () => ({ OrderFilterTabs: 'FilterTabs' }));
vi.mock('../../features/orders/components/EmptyOrdersState', () => ({ EmptyOrdersState: 'EmptyOrders' }));
vi.mock('../../features/orders/components/OrderDetailModal', () => ({ OrderDetailModal: 'DetailModal' }));
vi.mock('../../features/orders/components/OrderRatingModal', () => ({ OrderRatingModal: 'RatingModal' }));

import type { ApiOrder } from '../../api/types';
import { OrdersProvider } from '../../features/orders/context/OrdersContext';
import { OrdersScreen } from '../../features/orders/components/OrdersScreen';
import { OrderCard } from '../../features/orders/components/OrderCard';
import { orderService } from '../../features/orders/services/orderService';
import { CUSTOMER_ORDER_STATUS_INTERVAL_MS } from '../../features/orders/services/orderStatusWatch';
import { NativeWorkerPortal } from './NativeWorkerPortal';
import { useWorkerOrders } from './useWorkerOrders';
import { mapWorkerOrder } from './workerOrderMapper';
import { WorkerAvailableOrderCard, WorkerAvailableOrderDetails } from './WorkerAvailableOrder';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';
import { CUSTOMER_TOKEN_KEY } from './customerLoginStorage';

type Node = { type: unknown; props: { children?: unknown; [key: string]: unknown } };
function hidden(style: unknown): boolean {
  return Array.isArray(style) ? style.some(hidden) : Boolean(style && (style as { display?: string }).display === 'none');
}
// Expand real stateless cards/badges, and exclude the mounted-but-hidden list on details.
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as Node;
  if (hidden(node.props?.style)) return [];
  return [node, ...nodes(typeof node.type === 'function' ? node.type(node.props) : node.props?.children)];
}
const text = (tree: unknown) => nodes(tree).filter(node => node.type === 'Text')
  .map(node => [node.props.children].flat(Infinity).filter(value => typeof value === 'string' || typeof value === 'number').join('')).join(' ');
function press(tree: unknown, matches: (node: Node) => boolean) {
  const buttons = nodes(tree).filter(node => node.type === 'Pressable' && matches(node));
  expect(buttons).toHaveLength(1);
  expect(buttons[0].props.disabled).not.toBe(true);
  (buttons[0].props.onPress as () => void)();
}

beforeEach(async () => {
  harness.reset(); vi.resetAllMocks(); vi.useFakeTimers();
  await orderService.clearOrdersCache();
});
afterEach(async () => {
  harness.reset(); vi.clearAllTimers(); vi.useRealTimers();
  await orderService.clearOrdersCache();
});

describe('worker acceptance → my jobs → customer status (mock API)', () => {
  it('opens the summary card, accepts in details, moves the order to my jobs and refreshes the customer badge', async () => {
    const worker = { id: 'QA-WORKER', name: 'متخصص آزمایشی', phone: '', role: 'WORKER' as const, status: 'ACTIVE' as const };
    let stored = {
      id: 'QA-ACCEPTANCE-1', userId: 'QA-CUSTOMER', status: 'PENDING',
      serviceId: 'home_unit_cleaning', serviceTitle: 'نظافت واحد', area: 'ونک',
      address: 'نشانی دقیق آزمایشی', date: '1405/08/05', time: '09:00', durationHours: 3,
      price: 450000, currencyUnit: 'minor', createdAt: '2026-10-27T07:00:00Z',
    } as ApiOrder;
    let tokenKey: string;
    harness.attachToken.mockImplementation(async (_storage: unknown, key: string) => { tokenKey = key; });
    // One shared response fixture changes only in response to the real accept handler's request.
    // This exercises client integration, not a live server or database.
    harness.api.mockImplementation(async (path: string, options?: { method?: string; body?: string }) => {
      if (path === `/orders/${stored.id}/accept` && options?.method === 'PUT' && tokenKey === WORKER_TOKEN_KEY) {
        expect(JSON.parse(options.body!)).toEqual({ cleanerId: worker.id });
        expect(stored.status).toBe('PENDING');
        stored = { ...stored, status: 'ACCEPTED', cleanerId: worker.id, cleanerName: worker.name };
        return { success: true };
      }
      if (options?.method) throw new Error(`Unexpected mutation: ${path}`);
      if (path === '/orders/available' && tokenKey === WORKER_TOKEN_KEY) {
        return { success: true, orders: stored.status === 'PENDING' ? [{ ...stored, address: stored.area, notes: undefined, addressNotes: null }] : [] };
      }
      if (path === '/orders' && tokenKey === WORKER_TOKEN_KEY) {
        return { success: true, orders: stored.cleanerId === worker.id ? [{ ...stored }] : [] };
      }
      if (path === '/orders' && tokenKey === CUSTOMER_TOKEN_KEY) return { success: true, orders: [{ ...stored }] };
      throw new Error(`Unexpected request: ${path}`);
    });

    const customer = () => {
      const provider = harness.render('customer-provider', () => OrdersProvider({ children: null })) as Node;
      // Publish the real provider value to the harness context, as React's Provider would.
      (provider.type as (props: unknown) => unknown)(provider.props);
      return harness.render('customer-screen', () => OrdersScreen({}));
    };
    const specialist = () => {
      const orders = harness.render('worker-orders', () => useWorkerOrders(worker.id, mapWorkerOrder));
      return harness.render('worker-portal', () => NativeWorkerPortal({ user: worker, orders, contentBackRef: { current: null } }));
    };
    customer(); await vi.advanceTimersByTimeAsync(0);
    expect(text(customer())).toContain('در انتظار متخصص');
    specialist(); await vi.advanceTimersByTimeAsync(0);
    let view = specialist();
    const card = nodes(view).find(node => node.type === WorkerAvailableOrderCard)!;
    expect((card.props.order as { id: string }).id).toBe(stored.id);
    expect(text(view)).toContain('کارهای من (۰)');
    press(view, node => node.props.accessibilityHint === 'نمایش جزئیات سفارش');
    view = specialist();
    const details = nodes(view).find(node => node.type === WorkerAvailableOrderDetails)!;
    expect((details.props.order as { id: string }).id).toBe(stored.id);
    expect(text(view)).toContain('جزئیات سفارش');
    expect(text(view)).not.toContain(stored.address);
    expect(harness.api.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0);

    press(view, node => node.props.accessibilityLabel === 'پذیرش سفارش');
    await vi.advanceTimersByTimeAsync(0);
    view = specialist();
    expect(harness.api.mock.calls.filter(([, options]) => options?.method === 'PUT')).toEqual([
      [`/orders/${stored.id}/accept`, { method: 'PUT', body: JSON.stringify({ cleanerId: worker.id }) }],
    ]);
    expect(nodes(view).some(node => node.type === WorkerAvailableOrderDetails || node.type === WorkerAvailableOrderCard)).toBe(false);
    expect(text(view)).toContain('سفارش‌های جدید (۰)');
    press(view, node => text(node) === 'کارهای من (۱)');
    view = specialist();
    expect(text(view)).toContain(stored.serviceTitle);
    expect(text(view)).toContain(stored.address);
    expect(text(view)).toContain('پذیرفته‌شده');
    expect(text(view)).not.toContain('هنوز سفارشی نپذیرفته‌اید');

    // Stop the worker polling when switching roles; the already-mounted customer screen
    // must update through its own real timer, provider, service, mapper and status badge.
    harness.unmount('worker-orders'); harness.unmount('worker-portal');
    expect(text(customer())).toContain('در انتظار متخصص');
    await vi.advanceTimersByTimeAsync(CUSTOMER_ORDER_STATUS_INTERVAL_MS);
    const customerView = customer();
    const customerCard = nodes(customerView).find(node => node.type === OrderCard)!;
    expect(customerCard.props.order).toMatchObject({ id: stored.id, status: 'ACCEPTED', cleaner: { id: worker.id } });
    expect(text(customerCard)).toContain('پذیرفته‌شده');
    expect(text(customerCard)).not.toContain('در انتظار متخصص');
    expect(harness.alert).not.toHaveBeenCalled();
  });
});
