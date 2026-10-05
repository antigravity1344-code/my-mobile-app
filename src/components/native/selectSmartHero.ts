import type { OrderStatus } from '../../features/orders/types/order';

export const SMART_HERO_ACTIVE_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'CONFIRMED',
  'ASSIGNED',
  'IN_PROGRESS',
];

export type SmartHeroOrder = {
  id: string;
  status: OrderStatus;
  createdAt: string;
  serviceId: string;
  serviceTitle: string;
};

export type SmartHeroSelection<T extends SmartHeroOrder = SmartHeroOrder> =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'active'; order: T; otherActiveCount: number }
  | { kind: 'reorder'; order: T }
  | { kind: 'none' };

function timestamp(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function newestFirst<T extends SmartHeroOrder>(left: T, right: T): number {
  return timestamp(right.createdAt) - timestamp(left.createdAt);
}

export function selectSmartHero<T extends SmartHeroOrder>(
  orders: readonly T[],
  state: { loading: boolean; error: string | null },
  isReorderableService: (serviceId: string) => boolean,
): SmartHeroSelection<T> {
  const hasOrders = orders.length > 0;
  if (state.loading && !hasOrders) {
    return { kind: 'loading' };
  }
  if (state.error && !hasOrders) {
    return { kind: 'error', message: state.error };
  }

  const active = orders
    .filter((order) => SMART_HERO_ACTIVE_STATUSES.includes(order.status))
    .slice()
    .sort(newestFirst);
  if (active.length > 0) {
    return {
      kind: 'active',
      order: active[0],
      otherActiveCount: active.length - 1,
    };
  }

  const latestCompleted = orders
    .filter((order) => order.status === 'COMPLETED')
    .slice()
    .sort(newestFirst)[0];
  if (latestCompleted && isReorderableService(latestCompleted.serviceId)) {
    return { kind: 'reorder', order: latestCompleted };
  }

  return { kind: 'none' };
}
