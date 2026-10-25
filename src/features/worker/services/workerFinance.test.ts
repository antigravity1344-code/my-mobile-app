import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('../../../api/authToken', () => ({ attachStoredAuthToken: vi.fn(async () => undefined) }));
vi.mock('../../../utils/storage', () => ({ appStorage: {} }));
vi.mock('../../../components/native/previewRuntime', () => ({ previewActive: () => false }));
vi.mock('../../../components/native/workerLoginStorage', () => ({ WORKER_TOKEN_KEY: 'isolated-worker-token' }));
import {
  loadWorkerCommissionPolicy,
  loadWorkerWallet,
  parseWorkerWalletResponse,
  startWorkerWalletTopup,
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
    expect(result.value.topUpAvailable).toBe(false);
  });

  it('accepts a server-enabled top-up flag without treating it as a credited payment', () => {
    const enabled = structuredClone(walletResponse);
    enabled.wallet.topUpAvailable = true;
    const result = parseWorkerWalletResponse(enabled);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.topUpAvailable).toBe(true);
    expect(result.value.balances[0].balance).toBe(-1250);
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

  it('does not start a top-up from preview and does not credit from a browser-only response', async () => {
    const request = vi.fn();
    const preview = await startWorkerWalletTopup(500, 'تومان', request, () => true, async () => undefined);
    expect(preview.success).toBe(false);
    expect(request).not.toHaveBeenCalled();
    const result = await startWorkerWalletTopup(500, 'تومان', async () => ({ success: false, code: 'PAYMENT_NOT_CONFIGURED', message: 'درگاه شرکت متصل نیست؛ موجودی کیف پول تغییر نکرد.' }), () => false, async () => undefined);
    expect(result).toEqual({ success: false, message: 'درگاه شرکت متصل نیست؛ موجودی کیف پول تغییر نکرد.' });
  });
});
