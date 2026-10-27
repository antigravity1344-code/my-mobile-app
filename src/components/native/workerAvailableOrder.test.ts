import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)('react-native-web');
});

vi.mock('../../theme/customerHome', () => ({ colors: {}, type: {}, shadowSm: {} }));

import { Pressable, Text } from 'react-native';
import type { ApiOrder } from '../../api/types';
import { formatStoredAmount } from '../../features/orders/services/money';
import { WorkerAvailableOrderCard, WorkerAvailableOrderDetails } from './WorkerAvailableOrder';
import { mapWorkerOrder } from './workerOrderMapper';
import { preAcceptOrderView } from './workerOrderStatus';
import { WORKER_PRICE_UNKNOWN } from './workerHomeModel';

const order = mapWorkerOrder(preAcceptOrderView({
  id: 'ORDER-DETAIL-1', status: 'PENDING', serviceId: 'home_unit_cleaning', serviceTitle: 'نظافت واحد',
  area: 'ونک', address: 'PRIVATE-ADDRESS', notes: 'PRIVATE-NOTE', addressNotes: 'PRIVATE-ADDRESS-NOTE',
  customerPhone: '09121111111', date: '1405/08/05', time: '09:00 تا 12:00', price: 450000,
  currencyUnit: 'minor', durationHours: 3, genderPreference: 'MALE', createdAt: '2026-10-27T07:00:00Z',
} as unknown as ApiOrder));

type Node = ReactElement<{ children?: ReactNode; numberOfLines?: number; disabled?: boolean; accessibilityLabel?: string; onPress?: () => void }>;
function elements(node: ReactNode): Node[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement(child)) return [];
    const element = child as Node;
    return [element, ...elements(element.props.children)];
  });
}
const details = (overrides: Partial<Parameters<typeof WorkerAvailableOrderDetails>[0]> = {}) => WorkerAvailableOrderDetails({
  order, busy: false, loading: false, onBack: vi.fn(), onAccept: vi.fn(), ...overrides,
});

describe('compact available-order cards and details', () => {
  it('shows exactly four one-line fields and opens details without an accept button on the card', () => {
    const onOpen = vi.fn();
    const card = WorkerAvailableOrderCard({ order, onOpen });
    const texts = elements(card).filter(node => node.type === Text);
    expect(texts.map(node => node.props.children)).toEqual([
      'نظافت واحد', 'ونک', '۱۴۰۵/۰۸/۰۵ | ۰۹:۰۰ تا ۱۲:۰۰', WORKER_PRICE_UNKNOWN,
    ]);
    expect(texts.every(node => node.props.numberOfLines === 1)).toBe(true);
    expect(elements(card).filter(node => node.type === Pressable)).toHaveLength(1);
    card.props.onPress();
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(order.id);
  });

  it.each([
    { serviceId: 'home_unit_cleaning', rawPrice: 450000, expected: WORKER_PRICE_UNKNOWN },
    { serviceId: 'staircase_common_areas', rawPrice: 450000, expected: `مبلغ سفارش: ${formatStoredAmount(450000, order.currencyUnit)}` },
    { serviceId: 'staircase_common_areas', rawPrice: null, expected: WORKER_PRICE_UNKNOWN },
  ])('preserves the existing price rule in both views: $serviceId / $rawPrice', ({ serviceId, rawPrice, expected }) => {
    const value = { ...order, serviceId, rawPrice };
    const card = renderToStaticMarkup(createElement(WorkerAvailableOrderCard, { order: value, onOpen: vi.fn() }));
    const page = renderToStaticMarkup(details({ order: value }));
    expect(card).toContain(expected);
    expect(page).toContain(expected);
    expect(card).not.toContain('PRIVATE-');
    expect(page).not.toContain('PRIVATE-');
    expect(page).not.toContain('09121111111');
    expect(page).toContain('مدت: ۳ ساعت');
  });

  it('keeps complete details readable and routes the two buttons to back and the existing accept action', () => {
    const onBack = vi.fn();
    const onAccept = vi.fn();
    const tree = details({ onBack, onAccept });
    const buttons = elements(tree).filter(node => node.type === Pressable);
    buttons.find(node => node.props.accessibilityLabel === 'بازگشت به سفارش‌های جدید')!.props.onPress!();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
    buttons.find(node => node.props.accessibilityLabel === 'پذیرش سفارش')!.props.onPress!();
    expect(onAccept).toHaveBeenCalledExactlyOnceWith(order);
    expect(elements(tree).filter(node => node.type === Text).every(node => node.props.numberOfLines === undefined)).toBe(true);
  });

  it('disables acceptance while the existing request is pending', () => {
    const button = elements(details({ busy: true })).find(node => node.props.accessibilityLabel === 'پذیرش سفارش');
    expect(button?.props.disabled).toBe(true);
    expect(renderToStaticMarkup(details({ busy: true }))).toContain('در حال پذیرش...');
  });

  it.each([undefined, { ...order, status: 'CANCELLED' as const }])('has no acceptance action for an unavailable or no-longer-pending order', value => {
    const tree = details({ order: value });
    expect(elements(tree).some(node => node.props.accessibilityLabel === 'پذیرش سفارش')).toBe(false);
    expect(elements(tree).some(node => node.props.accessibilityLabel === 'بازگشت به سفارش‌های جدید')).toBe(true);
    if (!value) expect(renderToStaticMarkup(tree)).toContain('این سفارش دیگر در فهرست سفارش‌های جدید نیست');
  });

  it('shows the existing load/session notice on the details page', () => {
    expect(renderToStaticMarkup(details({ notice: createElement(Text, null, 'ورود دوباره') }))).toContain('ورود دوباره');
  });
});
