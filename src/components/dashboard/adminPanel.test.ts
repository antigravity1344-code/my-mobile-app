import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Existing lightweight hook harness (workerOrderDetailFlow/supportLoadOrdering).
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

vi.mock('lucide-react', () => Object.fromEntries(['ShieldAlert', 'DollarSign', 'Package', 'TrendingUp', 'UserCheck', 'CheckCircle', 'XCircle', 'RefreshCw'].map(name => [name, 'Icon'])));
vi.mock('../../api/apiClient', () => ({ apiFetch: harness.api }));
vi.mock('../native/previewRuntime', () => ({ previewActive: () => false }));
import { AdminPanelScreen } from './AdminPanelScreen';

type Node = { type: string; props: { children?: unknown; [key: string]: any } };
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as Node;
  return [node, ...nodes(node.props?.children)];
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return text((tree as Node).props.children);
}
const render = () => harness.render(AdminPanelScreen, {});
function button(label: string) {
  const found = nodes(render()).find(node => node.type === 'button' && text(node).trim() === label);
  expect(found, label).toBeDefined(); return found!;
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(overrides: Record<string, unknown> = {}) {
  harness.api.mockImplementation(async (path: string) => {
    if (path in overrides) return overrides[path];
    if (path === '/admin/login') return { success: true, token: 'test-admin' };
    if (path === '/admin/logout') return { success: true };
    if (path === '/admin/stats') return { success: true, stats: {} };
    if (path === '/admin/users?role=WORKER') return { success: true, users: [] };
    if (path === '/admin/orders') return { success: true, orders: [] };
    throw new Error('Unexpected path: ' + path);
  });
}
async function login() {
  button('ورود').props.onClick(); await flush(); render(); await flush();
}
beforeEach(() => harness.reset());
afterEach(() => harness.reset());

describe('admin data loading feedback', () => {
  it('shows loading until the response and only then shows a genuinely empty list', async () => {
    const pending = deferred(); fixture({ '/admin/orders': pending.promise });
    await login();
    expect(text(render())).toContain('در حال دریافت اطلاعات');
    expect(text(render())).not.toContain('هیچ سفارشی ثبت نشده');
    pending.resolve({ success: true, orders: [] }); await flush();
    expect(text(render())).toContain('هیچ سفارشی ثبت نشده');
    expect(text(render())).not.toContain('در حال دریافت اطلاعات');
  });
  it('shows failed and malformed responses with a retry instruction, not an empty result', async () => {
    fixture({ '/admin/orders': { success: false, message: 'قطع ارتباط سفارش‌ها' }, '/admin/users?role=WORKER': { success: true } });
    await login();
    expect(text(render())).toContain('قطع ارتباط سفارش‌ها');
    expect(text(render())).toContain('متخصصین: دریافت اطلاعات انجام نشد');
    expect(text(render())).toContain('برای تلاش دوباره');
    expect(text(render())).not.toContain('هیچ سفارشی ثبت نشده');
    button('متخصصین (0)').props.onClick();
    expect(text(render())).not.toContain('هیچ متخصصی ثبت نام نکرده');
    fixture(); button('بروزرسانی').props.onClick(); await flush();
    expect(nodes(render()).some(node => node.props.role === 'alert')).toBe(false);
    expect(text(render())).toContain('هیچ متخصصی ثبت نام نکرده');
  });
  it('keeps loaded rows when a refresh throws and clears the error on retry', async () => {
    fixture({ '/admin/orders': { success: true, orders: [{ id: 'O1', serviceTitle: 'سفارش آزمایشی', status: 'PENDING' }] } });
    await login();
    harness.api.mockRejectedValue(new Error('offline'));
    button('بروزرسانی').props.onClick(); await flush();
    expect(text(render())).toContain('سفارش آزمایشی');
    expect(text(render())).toContain('دریافت اطلاعات انجام نشد');
    expect(button('بروزرسانی').props.disabled).toBe(false);
  });
  it('ignores an old load after logout and the next login', async () => {
    const old = deferred(); fixture({ '/admin/orders': old.promise }); await login();
    button('خروج').props.onClick(); await flush(); render();
    fixture(); await login();
    old.resolve({ success: true, orders: [{ id: 'OLD', serviceTitle: 'سفارش نشست قبلی' }] }); await flush();
    expect(text(render())).not.toContain('سفارش نشست قبلی');
    expect(text(render())).toContain('هیچ سفارشی ثبت نشده');
  });
});
