import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiOrder } from '../../../api/types';
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const auth = vi.hoisted(() => ({ attachStoredAuthToken: vi.fn(async () => 'customer-token') }));
const preview = vi.hoisted(() => ({ active: false }));
const storage = vi.hoisted(() => ({ getItem: vi.fn(async () => ''), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock('../../../utils/storage', () => ({ appStorage: storage }));
vi.mock('../../../api/apiClient', () => ({ apiFetch: api.apiFetch, CONNECTION_ERROR_MESSAGE: 'connection' }));
vi.mock('../../../api/authToken', () => ({ attachStoredAuthToken: auth.attachStoredAuthToken }));
vi.mock('../../../components/native/previewRuntime', () => ({ previewActive: () => preview.active }));
import { mapApiOrderForCustomer, orderService } from './orderService';
import { CUSTOMER_TOKEN_KEY } from '../../../components/native/customerLoginStorage';
const completion = { requestId: 'REQUEST-1', status: 'pending', mode: 'customer_confirmation', actualHours: 4, finalAmount: 800000, policyVersion: 0 };
const order = (extra: Record<string, unknown> = {}) => ({ id: 'ORDER-1', status: 'ACCEPTED', serviceTitle: 'نظافت', address: 'تهران', date: '', time: '', price: 600000, createdAt: '2026-10-25T08:00:00Z', completion, ...extra } as ApiOrder);

describe('customer completion response', () => {
  beforeEach(async () => { preview.active = false; await orderService.clearOrdersCache(); vi.clearAllMocks(); });
  it('shows actual figures independently of the original booking estimate', () => {
    const mapped = mapApiOrderForCustomer(order());
    expect(mapped.completion?.finalAmount).toBe(800000);
    expect(mapped.completion?.actualHours).toBe(4);
    expect(mapped.pricing.total).toBe(600000);
  });
  it('sends the displayed request reference with customer authentication', async () => {
    api.apiFetch.mockResolvedValueOnce({ success: true, order: order({ status: 'COMPLETED', completion: { ...completion, status: 'completed' } }) });
    const result = await orderService.respondToCompletion('ORDER-1', 'yes', 'REQUEST-DISPLAYED');
    expect(result.success).toBe(true);
    expect(api.apiFetch).toHaveBeenCalledOnce();
    const [url, options] = api.apiFetch.mock.calls[0];
    expect(url).toBe('/orders/ORDER-1/completion-response');
    expect(JSON.parse(options.body)).toEqual({ answer: 'yes', requestId: 'REQUEST-DISPLAYED' });
    expect(auth.attachStoredAuthToken).toHaveBeenCalledWith(storage, CUSTOMER_TOKEN_KEY);
  });
  it('never retries a stale response against a newer request', async () => {
    api.apiFetch.mockResolvedValueOnce({ success: false, httpStatus: 409, order: order({ completion: { ...completion, requestId: 'REQUEST-NEW' } }) });
    const result = await orderService.respondToCompletion('ORDER-1', 'no', 'REQUEST-OLD');
    expect(result.success).toBe(false);
    expect(result.needsRefresh).toBe(true);
    expect(result.order?.completion?.requestId).toBe('REQUEST-NEW');
    expect(api.apiFetch).toHaveBeenCalledOnce();
    expect(JSON.parse(api.apiFetch.mock.calls[0][1].body).requestId).toBe('REQUEST-OLD');
  });
  it('does not adopt a response for another order', async () => {
    api.apiFetch.mockResolvedValueOnce({ success: false, httpStatus: 409, order: order({ id: 'OTHER' }) });
    expect((await orderService.respondToCompletion('ORDER-1', 'yes', 'REQUEST-1')).order).toBeUndefined();
  });
  it('does not submit from preview or without a request reference', async () => {
    preview.active = true;
    expect((await orderService.respondToCompletion('ORDER-1', 'yes', 'REQUEST-1')).success).toBe(false);
    preview.active = false;
    expect((await orderService.respondToCompletion('ORDER-1', 'yes', '')).success).toBe(false);
    expect(api.apiFetch).not.toHaveBeenCalled();
  });
});
