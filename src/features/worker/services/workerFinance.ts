import { apiFetch } from '../../../api/apiClient';
import { previewActive } from '../../../components/native/previewRuntime';
import { attachStoredAuthToken } from '../../../api/authToken';
import { appStorage } from '../../../utils/storage';
import { WORKER_TOKEN_KEY } from '../../../components/native/workerLoginStorage';

export type WorkerWalletBalance = { currencyUnit: string; balance: number };
export type WorkerWalletTransaction = {
  id: string;
  type: 'COMMISSION' | 'TOPUP';
  amount: number;
  currencyUnit: string;
  orderId: string | null;
  createdAt: string;
  grossAmount: number | null;
  commissionAmount: number | null;
  netAmount: number | null;
  ratePercent: number | null;
};
export type WorkerWallet = {
  balances: WorkerWalletBalance[];
  canAcceptNewOrders: boolean;
  topUpAvailable: false;
  transactions: WorkerWalletTransaction[];
};
export type WorkerCommissionPolicy = {
  version: number;
  ratePercent: number;
  effectiveAt: string | null;
};
export type FinanceResult<T> = { success: true; value: T } | { success: false; message: string };
export type FinanceRequester = (path: string, options?: RequestInit) => Promise<unknown>;
export type WorkerAuthPreparer = () => Promise<void>;
const prepareWorkerAuth: WorkerAuthPreparer = () => attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isAmount = (value: unknown): value is number => isFiniteNumber(value) && Number.isSafeInteger(value);
const nullableAmount = (value: unknown): value is number | null => value === null || isAmount(value);
const nullableRate = (value: unknown): value is number | null => value === null || (isFiniteNumber(value) && value >= 0 && value <= 100);

export function parseWorkerWalletResponse(input: unknown): FinanceResult<WorkerWallet> {
  if (!isRecord(input) || input.success !== true || !isRecord(input.wallet)) {
    return { success: false, message: isRecord(input) && typeof input.message === 'string' ? input.message : 'اطلاعات کیف پول معتبر نیست.' };
  }
  const wallet = input.wallet;
  if (!Array.isArray(wallet.balances) || !Array.isArray(wallet.transactions) || typeof wallet.canAcceptNewOrders !== 'boolean' || wallet.topUpAvailable !== false) {
    return { success: false, message: 'ساختار اطلاعات کیف پول معتبر نیست.' };
  }
  const balances: WorkerWalletBalance[] = [];
  for (const row of wallet.balances) {
    if (!isRecord(row) || typeof row.currencyUnit !== 'string' || !row.currencyUnit.trim() || !isAmount(row.balance)) {
      return { success: false, message: 'مانده کیف پول معتبر نیست.' };
    }
    balances.push({ currencyUnit: row.currencyUnit, balance: row.balance });
  }
  const transactions: WorkerWalletTransaction[] = [];
  for (const row of wallet.transactions) {
    if (!isRecord(row) || typeof row.id !== 'string' || !row.id || (row.type !== 'COMMISSION' && row.type !== 'TOPUP') || !isAmount(row.amount) ||
      typeof row.currencyUnit !== 'string' || !row.currencyUnit.trim() || !(row.orderId === null || typeof row.orderId === 'string') || typeof row.createdAt !== 'string' || !row.createdAt ||
      !nullableAmount(row.grossAmount) || !nullableAmount(row.commissionAmount) || !nullableAmount(row.netAmount) || !nullableRate(row.ratePercent)) {
      return { success: false, message: 'گردش کیف پول معتبر نیست.' };
    }
    transactions.push({
      id: row.id, type: row.type, amount: row.amount, currencyUnit: row.currencyUnit,
      orderId: row.orderId, createdAt: row.createdAt, grossAmount: row.grossAmount,
      commissionAmount: row.commissionAmount, netAmount: row.netAmount, ratePercent: row.ratePercent,
    });
  }
  return { success: true, value: { balances, canAcceptNewOrders: wallet.canAcceptNewOrders, topUpAvailable: false, transactions } };
}

export function parseWorkerCommissionPolicyResponse(input: unknown): FinanceResult<WorkerCommissionPolicy> {
  const policy = isRecord(input) && isRecord(input.policy) ? input.policy : null;
  if (!isRecord(input) || input.success !== true || !policy || !isAmount(policy.version) || policy.version < 0 || !isFiniteNumber(policy.ratePercent) || policy.ratePercent < 0 || policy.ratePercent > 100 ||
    !(policy.effectiveAt === null || typeof policy.effectiveAt === 'string')) {
    return { success: false, message: isRecord(input) && typeof input.message === 'string' ? input.message : 'درصد جاری کمیسیون دریافت نشد.' };
  }
  return { success: true, value: { version: policy.version, ratePercent: policy.ratePercent, effectiveAt: policy.effectiveAt } };
}

export async function loadWorkerWallet(request: FinanceRequester = apiFetch, isPreview: () => boolean = previewActive, prepareAuth: WorkerAuthPreparer = prepareWorkerAuth): Promise<FinanceResult<WorkerWallet>> {
  if (isPreview()) return { success: false, message: 'کیف پول واقعی در پیش‌نمایش در دسترس نیست.' };
  try {
    await prepareAuth();
    if (isPreview()) return { success: false, message: 'کیف پول واقعی در پیش‌نمایش در دسترس نیست.' };
    const response = await request('/workers/me/wallet');
    if (isPreview()) return { success: false, message: 'کیف پول واقعی در پیش‌نمایش در دسترس نیست.' };
    return parseWorkerWalletResponse(response);
  } catch {
    return { success: false, message: 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.' };
  }
}

export async function loadWorkerCommissionPolicy(request: FinanceRequester = apiFetch, isPreview: () => boolean = previewActive, prepareAuth: WorkerAuthPreparer = prepareWorkerAuth): Promise<FinanceResult<WorkerCommissionPolicy>> {
  if (isPreview()) return { success: false, message: 'درصد کمیسیون در پیش‌نمایش قابل دریافت نیست.' };
  try {
    await prepareAuth();
    if (isPreview()) return { success: false, message: 'درصد کمیسیون در پیش‌نمایش قابل دریافت نیست.' };
    const response = await request('/workers/me/commission-policy');
    if (isPreview()) return { success: false, message: 'درصد کمیسیون در پیش‌نمایش قابل دریافت نیست.' };
    return parseWorkerCommissionPolicyResponse(response);
  } catch {
    return { success: false, message: 'ارتباط با سرور برقرار نشد. درصد کمیسیون را بعداً دوباره بارگیری کنید.' };
  }
}
