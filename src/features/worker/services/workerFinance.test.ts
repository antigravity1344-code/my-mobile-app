import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('../../../api/authToken', () => ({ attachStoredAuthToken: vi.fn(async () => undefined) }));
vi.mock('../../../utils/storage', () => ({ appStorage: {} }));
vi.mock('../../../components/native/previewRuntime', () => ({ previewActive: () => false }));
vi.mock('../../../components/native/workerLoginStorage', () => ({ WORKER_TOKEN_KEY: 'isolated-worker-token' }));
import {
  loadWorkerCommissionPolicy,
  loadWorkerWallet,
  loadWorkerWeeklyIncome,
  parseWorkerWalletResponse,
  parseWorkerWeeklyIncomeResponse,
} from './workerFinance';

const walletResponse = {
  success: true,
  message: 'ok',
  wallet: {
    balances: [
      { currencyUnit: 'تومان', balance: -1250 },
      { currencyUnit: 'ریال', balance: 3000 },
    ],
    canAcceptNewOrders: false,
    topUpAvailable: false,
    transactions: [{
      id: 'commission-1', type: 'COMMISSION', amount: -1250, currencyUnit: 'تومان', orderId: 'order-9',
      createdAt: '2026-10-25T08:00:00.000Z', grossAmount: 5000, commissionAmount: 1250,
      netAmount: 3750, ratePercent: 25,
    }],
  },
};

describe('worker finance client contracts', () => {
  it('keeps wallet balances separate by unit and preserves signed ledger values', () => {
    const result = parseWorkerWalletResponse(walletResponse);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.balances).toEqual([
      { currencyUnit: 'تومان', balance: -1250 },
      { currencyUnit: 'ریال', balance: 3000 },
    ]);
    expect(result.value).not.toHaveProperty('balance');
    expect(result.value.transactions[0]).toMatchObject({ amount: -1250, commissionAmount: 1250, ratePercent: 25 });
    expect(result.value.canAcceptNewOrders).toBe(false);
  });

  it('rejects malformed financial values instead of rendering them as zero', () => {
    const malformed = structuredClone(walletResponse);
    malformed.wallet.balances[0].balance = Number.NaN;
    expect(parseWorkerWalletResponse(malformed).success).toBe(false);
  });

  it('does not make a request in preview mode', async () => {
    const request = vi.fn();
    const prepareAuth = vi.fn(async () => undefined);
    const result = await loadWorkerWallet(request, () => true, prepareAuth);
    expect(result.success).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(prepareAuth).not.toHaveBeenCalled();
  });

  it('never invents a commission rate when policy loading fails', async () => {
    const result = await loadWorkerCommissionPolicy(async () => ({ success: false, message: 'offline' }), () => false, async () => undefined);
    expect(result).toEqual({ success: false, message: 'offline' });
  });

  it('attaches worker authentication and reads only the own-wallet endpoint', async () => {
    const prepareAuth = vi.fn(async () => undefined);
    const request = vi.fn(async () => walletResponse);
    const result = await loadWorkerWallet(request, () => false, prepareAuth);
    expect(prepareAuth).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/workers/me/wallet');
    expect(result.success).toBe(true);
  });

  it('prevents a request when preview starts while authentication is pending', async () => {
    let preview = false;
    const request = vi.fn();
    const result = await loadWorkerWallet(request, () => preview, async () => { preview = true; });
    expect(result.success).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not expose a delayed real response after preview becomes active', async () => {
    let preview = false;
    const result = await loadWorkerWallet(async () => { preview = true; return walletResponse; }, () => preview, async () => undefined);
    expect(result.success).toBe(false);
  });

  it('parses a jalali weekly income report and rejects top-up shaped payloads', () => {
    const parsed = parseWorkerWeeklyIncomeResponse({
      success: true,
      report: {
        calendar: 'jalali',
        weekStart: { year: 1405, month: 8, day: 2 },
        weekEnd: { year: 1405, month: 8, day: 8 },
        totals: [{ currencyUnit: 'تومان', jobCount: 2, grossAmount: 4000, commissionAmount: 1000, netAmount: 3000 }],
      },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.value.totals[0].netAmount).toBe(3000);
    expect(parseWorkerWeeklyIncomeResponse({
      success: true,
      report: { calendar: 'jalali', weekStart: { year: 1405, month: 8, day: 2 }, weekEnd: { year: 1405, month: 8, day: 8 }, totals: [{ currencyUnit: 'تومان', jobCount: 0, grossAmount: 5000, commissionAmount: 0, netAmount: 5000 }] },
    }).success).toBe(false);
  });

  it('loads only the own weekly-income endpoint and skips preview requests', async () => {
    const prepareAuth = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({
      success: true,
      report: {
        calendar: 'jalali',
        weekStart: { year: 1405, month: 8, day: 2 },
        weekEnd: { year: 1405, month: 8, day: 8 },
        totals: [],
      },
    }));
    const result = await loadWorkerWeeklyIncome(request, () => false, prepareAuth);
    expect(prepareAuth).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/workers/me/weekly-income');
    expect(result.success).toBe(true);
    expect((await loadWorkerWeeklyIncome(request, () => true, prepareAuth)).success).toBe(false);
  });
});
