import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiOrder } from '../../../api/types';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const auth = vi.hoisted(() => ({ attachStoredAuthToken: vi.fn(async () => 'customer-token') }));
const storage = vi.hoisted(() => ({
  getItem: vi.fn(async () => ''),
  setItem: vi.fn(async () => undefined),
  removeItem: vi.fn(async () => undefined),
}));

vi.mock('../../../utils/storage', () => ({ appStorage: storage }));
vi.mock('../../../api/apiClient', () => ({
  apiFetch: api.apiFetch,
  CONNECTION_ERROR_MESSAGE: 'connection',
}));
vi.mock('../../../api/authToken', () => ({
  attachStoredAuthToken: auth.attachStoredAuthToken,
}));

import { mapApiOrderForCustomer, orderService } from './orderService';
import { CUSTOMER_TOKEN_KEY } from '../../../components/native/customerLoginStorage';

const order = (extra: Record<string, unknown> = {}) => ({
  id: 'ORDER-START',
  status: 'ACCEPTED',
  serviceTitle: 'نظافت',
  address: 'تهران',
  date: '',
  time: '',
  price: 800000,
  createdAt: '2026-10-12T08:00:00.000Z',
  startPrompt: 'ask_started',
  startPromptEventId: 'EVENT-QUESTION-1',
  ...extra,
} as ApiOrder);

async function rememberOrder(apiOrder: ApiOrder) {
  api.apiFetch.mockResolvedValueOnce({ success: true, orders: [apiOrder] });
  await orderService.getOrders('ALL', '', 'NEWEST', 'CUSTOMER-1');
  api.apiFetch.mockClear();
  auth.attachStoredAuthToken.mockClear();
}

describe('customer start-response binds the answer to the displayed event', () => {
  beforeEach(async () => {
    await orderService.clearOrdersCache();
    vi.clearAllMocks();
  });

  it('keeps the exact server event reference with a pending question', () => {
    const mapped = mapApiOrderForCustomer(order());
    expect(mapped.startPrompt).toBe('ask_started');
    expect(mapped.startPromptEventId).toBe('EVENT-QUESTION-1');
  });

  it.each([
    { startPromptEventId: null },
    { startPromptEventId: undefined },
    { startPromptEventId: '' },
    { startPromptEventId: 123 },
    { startPrompt: 'unknown_prompt' },
    { startPrompt: null },
  ])('does not offer an answer for an incomplete or unknown question %j', (extra) => {
    const mapped = mapApiOrderForCustomer(order(extra));
    expect(mapped.startPrompt).toBeNull();
    expect(mapped.startPromptEventId).toBeNull();
  });

  it('sends the displayed reference rather than replacing it with a newer cached report', async () => {
    await rememberOrder(order({ startPrompt: 'confirm_report', startPromptEventId: 'EVENT-REPORT-2' }));
    api.apiFetch.mockResolvedValueOnce({ success: true, order: order({ startPrompt: null, startPromptEventId: null }) });

    const result = await orderService.respondToStart('ORDER-START', 'yes', 'EVENT-QUESTION-1');

    expect(api.apiFetch).toHaveBeenCalledTimes(1);
    const [path, request] = api.apiFetch.mock.calls[0];
    expect(path).toBe('/orders/ORDER-START/start-response');
    expect(request.method).toBe('PUT');
    expect(JSON.parse(request.body)).toEqual({ answer: 'yes', promptEventId: 'EVENT-QUESTION-1' });
    expect(auth.attachStoredAuthToken).toHaveBeenCalledWith(storage, CUSTOMER_TOKEN_KEY);
    expect(auth.attachStoredAuthToken.mock.invocationCallOrder[0]).toBeLessThan(api.apiFetch.mock.invocationCallOrder[0]);
    expect(result.success).toBe(true);
    expect(result.order?.startPrompt).toBeNull();
    expect(result.order?.startPromptEventId).toBeNull();
  });

  it('keeps a stale 409 as a failure, adopts the current server question and requests a refresh', async () => {
    await rememberOrder(order());
    api.apiFetch.mockResolvedValueOnce({
      success: false,
      httpStatus: 409,
      message: 'پرسش شروع کار تغییر کرده است. لطفاً دوباره بررسی کنید.',
      order: order({ startPrompt: 'confirm_report', startPromptEventId: 'EVENT-REPORT-2' }),
    });

    const result = await orderService.respondToStart('ORDER-START', 'no', 'EVENT-QUESTION-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/تغییر/);
    expect(result.needsRefresh).toBe(true);
    expect(result.order?.startPrompt).toBe('confirm_report');
    expect(result.order?.startPromptEventId).toBe('EVENT-REPORT-2');
    expect((await orderService.getOrderById('ORDER-START'))?.startPromptEventId).toBe('EVENT-REPORT-2');
    expect(api.apiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(api.apiFetch.mock.calls[0][1].body)).toEqual({ answer: 'no', promptEventId: 'EVENT-QUESTION-1' });
  });

  it('requests a refresh after a 409 without silently accepting or retrying the answer', async () => {
    api.apiFetch.mockResolvedValueOnce({ success: false, httpStatus: 409, message: 'دوباره بررسی کنید.' });

    const result = await orderService.respondToStart('ORDER-START', 'yes', 'EVENT-QUESTION-1');

    expect(result.success).toBe(false);
    expect(result.needsRefresh).toBe(true);
    expect(result.order).toBeUndefined();
    expect(api.apiFetch).toHaveBeenCalledTimes(1);
  });

  it('does not adopt another order from a conflict response', async () => {
    await rememberOrder(order());
    api.apiFetch.mockResolvedValueOnce({
      success: false,
      httpStatus: 409,
      order: order({ id: 'ANOTHER-ORDER', startPromptEventId: 'UNRELATED-EVENT' }),
    });

    const result = await orderService.respondToStart('ORDER-START', 'yes', 'EVENT-QUESTION-1');

    expect(result.success).toBe(false);
    expect(result.needsRefresh).toBe(true);
    expect(result.order).toBeUndefined();
    expect((await orderService.getOrderById('ORDER-START'))?.startPromptEventId).toBe('EVENT-QUESTION-1');
  });
});
