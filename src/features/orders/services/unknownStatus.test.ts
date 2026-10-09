import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/storage', () => ({ appStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } }));
vi.mock('../../../api/apiClient', () => ({ apiFetch: vi.fn(), CONNECTION_ERROR_MESSAGE: 'connection' }));
vi.mock('../../../api/authToken', () => ({ attachStoredAuthToken: vi.fn(), setApiAuthToken: vi.fn(), getApiAuthToken: vi.fn() }));

import { isOrderCancellable, mapApiOrderForCustomer } from './orderService';
import { CUSTOMER_ORDER_STATUS_LABELS } from '../orderStatusLabels';

describe('unknown server status (F13)', () => {
  it('is not turned into PENDING and is not cancellable', () => {
    const order = mapApiOrderForCustomer({ id: 'o1', status: 'SOMETHING_NEW', price: 100000 } as never);
    expect(order.status).toBe('UNKNOWN');
    expect(isOrderCancellable(order.status)).toBe(false);
    expect(CUSTOMER_ORDER_STATUS_LABELS[order.status]).toBe('وضعیت نامشخص');
  });

  it('known statuses still map as before', () => {
    expect(mapApiOrderForCustomer({ id: 'o2', status: 'ACCEPTED', price: 1 } as never).status).toBe('ACCEPTED');
    expect(mapApiOrderForCustomer({ id: 'o3', status: 'PENDING', price: 1 } as never).status).toBe('PENDING');
  });
});
