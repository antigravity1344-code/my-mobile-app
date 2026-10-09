import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const data = new Map<string, unknown>();
  return {
    data,
    getItem: vi.fn(async (key: string, fallback: unknown) => (data.has(key) ? data.get(key) : fallback)),
    setItem: vi.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      data.delete(key);
    }),
  };
});
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('../../../utils/storage', () => ({ appStorage: storage }));
vi.mock('../../../api/apiClient', () => ({
  apiFetch: api.apiFetch,
  CONNECTION_ERROR_MESSAGE: 'connection',
}));
vi.mock('../../../api/authToken', () => ({
  attachStoredAuthToken: vi.fn(async () => ''),
  setApiAuthToken: vi.fn(),
  getApiAuthToken: vi.fn(() => ''),
}));

import { orderService } from './orderService';

// Key the old app versions wrote the whole order list under (never read back).
const LEGACY_ORDERS_STORAGE_KEY = 'paksho_orders_list';

const userAOrder = {
  id: 'order-user-a',
  status: 'PENDING',
  serviceTitle: 'نظافت منزل',
  customerName: 'مشتری الف',
  customerPhone: '09120000001',
  address: 'سعادت‌آباد، کوچه ۵',
  date: 'آبان ۱۴۰۵ 19',
  time: 'صبح زود',
  price: 800000,
  createdAt: '2026-10-09T00:40:00.000Z',
};

describe('customer orders cache across logout (I12)', () => {
  beforeEach(() => {
    storage.data.clear();
    vi.clearAllMocks();
  });

  it('does not persist the customer order list to device storage', async () => {
    api.apiFetch.mockResolvedValueOnce({ success: true, orders: [userAOrder] });
    const loaded = await orderService.getOrders('ALL', '', 'NEWEST', 'user-a');
    expect(loaded.orders.map((order) => order.id)).toEqual(['order-user-a']);
    expect(storage.data.has(LEGACY_ORDERS_STORAGE_KEY)).toBe(false);
  });

  it('forgets the previous customer orders and removes the legacy stored list on logout', async () => {
    storage.data.set(LEGACY_ORDERS_STORAGE_KEY, [{ id: 'stale-from-old-app-version' }]);
    api.apiFetch.mockResolvedValueOnce({ success: true, orders: [userAOrder] });
    await orderService.getOrders('ALL', '', 'NEWEST', 'user-a');
    expect(await orderService.getOrderById('order-user-a')).toBeDefined();

    await orderService.clearOrdersCache();

    expect(await orderService.getOrderById('order-user-a')).toBeUndefined();
    expect(orderService.getLastOrdersLoadError()).toBeNull();
    expect(storage.data.has(LEGACY_ORDERS_STORAGE_KEY)).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledWith(LEGACY_ORDERS_STORAGE_KEY);
  });
});
