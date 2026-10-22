import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  interface HookSlot {
    value?: unknown;
    ref?: { current: unknown };
    deps?: readonly unknown[];
    callback?: unknown;
    cleanup?: () => void;
  }
  let slots: HookSlot[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  let disposed = false;
  let lateWrites = 0;
  const api = vi.fn();
  const equal = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) =>
    Boolean(a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i])));
  const createElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({
    type, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) },
  });
  const react = {
    default: { createElement },
    useState(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next: unknown) => {
        if (disposed) { lateWrites++; return; }
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { ref: { current: initial } };
      return slots[index].ref;
    },
    useCallback(callback: unknown, deps: readonly unknown[]) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const index = cursor++;
      const old = slots[index];
      if (old && equal(old.deps, deps)) return;
      const slot: HookSlot = { deps, cleanup: old?.cleanup };
      slots[index] = slot;
      effects.push(() => {
        slot.cleanup?.();
        const cleanup = effect();
        slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      });
    },
  };
  return {
    api, react, createElement,
    reset() { slots = []; cursor = 0; effects = []; disposed = false; lateWrites = 0; api.mockReset(); },
    render(component: (props: never) => unknown, user: unknown) {
      cursor = 0;
      const tree = component({ user } as never);
      const pending = effects;
      effects = [];
      pending.forEach(effect => effect());
      return tree;
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); disposed = true; },
    lateWrites: () => lateWrites,
  };
});
vi.mock('react', () => harness.react);
vi.mock('react/jsx-runtime', () => ({ jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) }));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView',
  ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (value: unknown) => value },
  Platform: { OS: 'android' }, Linking: { openURL: vi.fn() },
  Alert: { alert: vi.fn() }, Keyboard: { dismiss: vi.fn() },
}));
vi.mock('lucide-react-native', () => ({
  HelpCircle: 'Icon', Phone: 'Icon', MessageCircle: 'Icon',
  ChevronDown: 'Icon', ChevronUp: 'Icon', X: 'Icon', Send: 'Icon',
}));
vi.mock('../../api/apiClient', () => ({ apiFetch: harness.api }));
vi.mock('../../theme', () => ({ type: { regular: {}, bold: {} } }));
vi.mock('../../components/native/BottomSheetModal', () => ({ BottomSheetModal: 'BottomSheetModal' }));
vi.mock('../../components/native/useSheetKeyboard', () => ({ useSheetKeyboard: () => ({}) }));
vi.mock('../../utils/jalaliDisplay', () => ({ formatJalaliDateTime: () => 'date' }));

import { NativeSupportScreen } from './components/NativeSupportScreen';

function nodes(tree: unknown): unknown[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree === null || tree === undefined || typeof tree === 'boolean') return [];
  if (typeof tree !== 'object') return [tree];
  return [tree, ...nodes((tree as { props?: { children?: unknown } }).props?.children)];
}
const text = (tree: unknown) => nodes(tree).filter(value => typeof value === 'string').join(' ');
const userA = { id: 'A', name: 'A', phone: '09120000001' };
const userB = { id: 'B', name: 'B', phone: '09120000002' };
function reply(userId: string, subject: string) {
  return { success: true, messages: [{ id: subject, userId, subject, body: subject,
    status: 'OPEN', createdAt: '2026-10-21T00:00:00Z' }] };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; });
  return { promise, resolve };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); }
interface RetryNode {
  type: string;
  props: { onPress: () => void; disabled?: boolean; accessibilityState?: { disabled?: boolean } };
}
function retry(tree: unknown): RetryNode {
  const found = nodes(tree).find(node => (node as { type?: unknown })?.type === 'Pressable' && text(node).includes('تلاش دوباره'));
  expect(found).toBeDefined();
  return found as RetryNode;
}

describe('support load ordering', () => {
  beforeEach(() => harness.reset());

  it('a late older retry cannot replace a newer response or its cleared error state', async () => {
    harness.api.mockResolvedValueOnce({ success: false, message: 'initial error' });
    harness.render(NativeSupportScreen, userA);
    await flush();
    const action = retry(harness.render(NativeSupportScreen, userA));
    expect(action).toBeDefined();
    const old = deferred();
    const newer = deferred();
    harness.api.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    // Two events already queued before React commits the disabled state.
    action.props.onPress();
    action.props.onPress();
    newer.resolve(reply('A', 'newest result'));
    await flush();
    expect(text(harness.render(NativeSupportScreen, userA))).toContain('newest result');
    old.resolve({ success: false, message: 'stale error', messages: [] });
    await flush();
    const shown = text(harness.render(NativeSupportScreen, userA));
    expect(shown).toContain('newest result');
    expect(shown).not.toContain('stale error');
  });

  it('a response requested for the previous user cannot populate the new user view', async () => {
    const old = deferred();
    const newer = deferred();
    harness.api.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    harness.render(NativeSupportScreen, userA);
    harness.render(NativeSupportScreen, userB);
    newer.resolve(reply('B', 'B message'));
    await flush();
    old.resolve(reply('A', 'A private message'));
    await flush();
    const shown = text(harness.render(NativeSupportScreen, userB));
    expect(shown).toContain('B message');
    expect(shown).not.toContain('A private message');
  });

  it('late completion after unmount performs no state update', async () => {
    const pending = deferred();
    harness.api.mockReturnValueOnce(pending.promise);
    harness.render(NativeSupportScreen, userA);
    harness.unmount();
    pending.resolve(reply('A', 'late message'));
    await flush();
    expect(harness.lateWrites()).toBe(0);
  });

  it('retry is disabled while its request is pending', async () => {
    harness.api.mockResolvedValueOnce({ success: false, message: 'retry me' });
    harness.render(NativeSupportScreen, userA);
    await flush();
    const action = retry(harness.render(NativeSupportScreen, userA));
    const pending = deferred();
    harness.api.mockReturnValueOnce(pending.promise);
    action.props.onPress();
    const waiting = retry(harness.render(NativeSupportScreen, userA));
    expect(waiting.props.disabled).toBe(true);
    expect(waiting.props.accessibilityState?.disabled).toBe(true);
    pending.resolve(reply('A', 'done'));
    await flush();
  });
});
