import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The same lightweight hook harness used by supportLoadOrdering.test.ts.
const harness = vi.hoisted(() => {
  type Slot = { value?: unknown; ref?: { current: unknown }; deps?: readonly unknown[]; cleanup?: () => void };
  let slots: Slot[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  const api = vi.fn();
  const alert = vi.fn();
  const createElement = (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props: { ...(props as object), children } });
  const react = {
    default: { createElement },
    useState(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, (next: unknown) => {
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { ref: { current: initial } };
      return slots[index].ref;
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++;
      const old = slots[index];
      if (old?.deps?.length === deps.length && deps.every((value, i) => Object.is(value, old.deps?.[i]))) return;
      const slot: Slot = { deps, cleanup: old?.cleanup };
      slots[index] = slot;
      effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined; });
    },
  };
  return {
    api, alert, react,
    reset() { slots.forEach(slot => slot.cleanup?.()); slots = []; cursor = 0; effects = []; api.mockReset(); alert.mockReset(); },
    render(component: (props: never) => unknown, props: unknown) {
      cursor = 0;
      const tree = component(props as never);
      const pending = effects; effects = []; pending.forEach(effect => effect());
      return tree;
    },
  };
});
vi.mock('react', () => harness.react);
vi.mock('react/jsx-runtime', () => ({ jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) }));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (value: unknown) => value },
  Linking: { openURL: vi.fn() }, Alert: { alert: harness.alert }, BackHandler: { addEventListener: vi.fn() },
}));
vi.mock('lucide-react-native', () => ({ Briefcase: 'Icon', MapPin: 'Icon', Clock: 'Icon', CheckCircle: 'Icon', Phone: 'Icon', User: 'Icon' }));
vi.mock('../../theme/customerHome', () => ({ colors: {}, type: {}, shadowSm: {}, shadowMd: {} }));
vi.mock('../../utils/storage', () => ({ appStorage: {} }));
vi.mock('../../api/apiClient', () => ({ apiFetch: harness.api }));
vi.mock('../../api/authToken', () => ({ attachStoredAuthToken: vi.fn() }));
vi.mock('./previewRuntime', () => ({ previewActive: () => false }));
vi.mock('./useWorkerOrders', () => ({ useWorkerOrders: vi.fn() }));
vi.mock('./WorkerIncomeReportNativePanel', () => ({ WorkerIncomeReportNativePanel: 'Income' }));
vi.mock('./WorkerWalletNativePanel', () => ({ WorkerWalletNativePanel: 'Wallet' }));
vi.mock('./WorkerAvailableOrder', () => ({ WorkerAvailableOrderCard: 'OrderCard', WorkerAvailableOrderDetails: 'OrderDetails' }));

import type { ComponentProps } from 'react';
import type { ApiOrder } from '../../api/types';
import { NativeWorkerPortal } from './NativeWorkerPortal';
import { mapWorkerOrder, type NativeOrder } from './workerOrderMapper';
import type { WorkerContentBackRef } from './workerBackNavigation';

type TreeNode = { type: string; props: { children?: unknown; [key: string]: unknown } };
function nodes(tree: unknown): TreeNode[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as TreeNode;
  return [node, ...nodes(node.props?.children)];
}
const find = (tree: unknown, type: string) => nodes(tree).find(node => node.type === type);
const order = mapWorkerOrder({ id: 'O1', status: 'PENDING', serviceId: 'home_unit_cleaning', serviceTitle: 'نظافت واحد', date: '1405/08/05', time: '09:00', area: 'ونک', price: 450000 } as ApiOrder);
function fixture() {
  const contentBackRef: WorkerContentBackRef = { current: null };
  const fetchOrders = vi.fn(async () => {});
  const props: ComponentProps<typeof NativeWorkerPortal> = {
    user: { id: 'W1', name: 'متخصص', phone: '', role: 'WORKER', status: 'ACTIVE' },
    orders: { ordersState: { available: [order], mine: [], error: null, sessionExpired: false }, loading: false, hasLoaded: true, fetchOrders },
    contentBackRef,
  };
  const render = () => harness.render(NativeWorkerPortal, props);
  const open = () => {
    (find(render(), 'OrderCard')!.props.onOpen as (id: string) => void)(order.id);
    return find(render(), 'OrderDetails')!;
  };
  return { props, fetchOrders, contentBackRef, render, open };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => { harness.reset(); vi.useFakeTimers(); });
afterEach(() => { harness.reset(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('available order list → details → acceptance', () => {
  it('opens details without accepting and both back actions return to the list', () => {
    const f = fixture();
    expect(f.open().props.order).toBe(order);
    expect(harness.api).not.toHaveBeenCalled();
    expect(f.contentBackRef.current?.()).toBe(true);
    expect(find(f.render(), 'OrderDetails')).toBeUndefined();
    expect(f.contentBackRef.current?.()).toBe(false);
    (f.open().props.onBack as () => void)();
    expect(find(f.render(), 'OrderDetails')).toBeUndefined();
    expect(find(f.render(), 'OrderCard')).toBeDefined();
  });

  it('uses current available data and never falls back to a stale or accepted snapshot', () => {
    const f = fixture(); f.open();
    const refreshed = { ...order, timeSlot: '14:00' };
    f.props.orders.ordersState.available = [refreshed];
    expect(find(f.render(), 'OrderDetails')!.props.order).toBe(refreshed);
    f.props.orders.ordersState.available = [];
    f.props.orders.ordersState.mine = [{ ...order, status: 'ACCEPTED', address: 'PRIVATE-AFTER-ACCEPT' }];
    expect(find(f.render(), 'OrderDetails')!.props.order).toBeUndefined();
    expect(f.contentBackRef.current?.()).toBe(true);
    expect(find(f.render(), 'OrderDetails')).toBeUndefined();
  });

  it('keeps the existing accept request and duplicate guard, then closes details and refreshes', async () => {
    let resolve!: (response: unknown) => void;
    harness.api.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const f = fixture();
    const accept = f.open().props.onAccept as (order: NativeOrder) => void;
    accept(order); accept(order);
    expect(harness.api).toHaveBeenCalledExactlyOnceWith('/orders/O1/accept', { method: 'PUT', body: JSON.stringify({ cleanerId: 'W1' }) });
    expect(find(f.render(), 'OrderDetails')!.props.busy).toBe(true);
    resolve({ success: true }); await flush();
    expect(find(f.render(), 'OrderDetails')).toBeUndefined();
    expect(f.fetchOrders).toHaveBeenCalledExactlyOnceWith('after-action');
  });

  it('keeps details open on an acceptance error and retains the existing message and refresh', async () => {
    harness.api.mockResolvedValueOnce({ success: false, message: 'این سفارش دیگر قابل پذیرش نیست.' });
    const f = fixture();
    (f.open().props.onAccept as (order: NativeOrder) => void)(order);
    await flush();
    expect(find(f.render(), 'OrderDetails')!.props.busy).toBe(false);
    expect(harness.alert).toHaveBeenCalledWith('خطا', 'این سفارش دیگر قابل پذیرش نیست.', [{ text: 'باشه' }]);
    expect(f.fetchOrders).toHaveBeenCalledExactlyOnceWith('after-action');
  });
});
