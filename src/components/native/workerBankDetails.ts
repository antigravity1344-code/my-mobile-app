import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { appStorage } from '../../utils/storage';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';
import { previewActive } from './previewRuntime';

export type BankDetails = { bankShebaMasked: string | null; hasPin: boolean; lockedUntil: string | null; version: number };
export type BankResult = { ok: true; bankDetails: BankDetails; otpRequired: boolean } | { ok: false; message: string; sessionExpired?: boolean };
export type BankOtpPurpose = 'bank-details' | 'bank-pin';
export type BankDependencies = {
  request: (path: string, options?: RequestInit) => Promise<unknown>;
  prepare: () => Promise<void>;
  preview: () => boolean;
};
const defaults: BankDependencies = {
  request: apiFetch,
  prepare: () => attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY),
  preview: previewActive,
};
const PREVIEW_MESSAGE = 'مشاهده و تغییر اطلاعات بانکی واقعی در پیش‌نمایش غیرفعال است.';
const UNKNOWN_SAVE = 'تأیید ذخیره دریافت نشد؛ پیش از تلاش دوباره، اطلاعات را بازخوانی کنید.';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function bankDigits(value: string): string {
  return value.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
}
export function normalizeSheba(value: string): string { return bankDigits(value).replace(/\s/g, '').toUpperCase(); }
export function validBankPin(value: string): boolean { return /^\d{6}$/.test(value); }
export function validBankSheba(value: string): boolean {
  if (!/^IR\d{24}$/.test(value)) return false;
  let remainder = 0;
  for (const digit of value.slice(4) + '1827' + value.slice(2, 4)) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
export function parseBankResponse(value: unknown): BankResult {
  if (!record(value) || value.success !== true) return {
    ok: false,
    message: record(value) && typeof value.message === 'string' ? value.message : 'اطلاعات بانکی معتبر دریافت نشد.',
    sessionExpired: record(value) && (value.httpStatus === 401 || value.httpStatus === 403),
  };
  const bank = value.bankDetails;
  if (!record(bank) || typeof bank.hasPin !== 'boolean' || !Number.isSafeInteger(bank.version) || (bank.version as number) < 0
    || !(bank.bankShebaMasked === null || (typeof bank.bankShebaMasked === 'string' && /^IR\d{2}\*+\d{4}$/.test(bank.bankShebaMasked)))
    || !(bank.lockedUntil === null || (typeof bank.lockedUntil === 'string' && Number.isFinite(Date.parse(bank.lockedUntil))))
    || typeof value.otpRequired !== 'boolean') return { ok: false, message: 'ساختار اطلاعات بانکی معتبر نیست؛ بازخوانی کنید.' };
  return { ok: true, bankDetails: {
    bankShebaMasked: bank.bankShebaMasked as string | null, hasPin: bank.hasPin,
    lockedUntil: bank.lockedUntil as string | null, version: bank.version as number,
  }, otpRequired: value.otpRequired };
}
async function bankRequest(path: string, options: RequestInit, deps: BankDependencies): Promise<unknown> {
  if (deps.preview()) return { success: false, message: PREVIEW_MESSAGE };
  await deps.prepare();
  if (deps.preview() || options.signal?.aborted) return { success: false, message: PREVIEW_MESSAGE };
  const response = await deps.request(path, options);
  if (deps.preview()) return { success: false, message: PREVIEW_MESSAGE };
  return response;
}
async function detailsRequest(path: string, options: RequestInit, deps: BankDependencies): Promise<BankResult> {
  try { return parseBankResponse(await bankRequest(path, options, deps)); }
  catch { return { ok: false, message: options.method === 'PUT' ? UNKNOWN_SAVE : 'دریافت اطلاعات انجام نشد؛ اتصال را بررسی و دوباره تلاش کنید.' }; }
}
export function loadBankDetails(signal?: AbortSignal, deps = defaults): Promise<BankResult> {
  return detailsRequest('/workers/me/bank-details', { signal }, deps);
}
export function saveBankDetails(input: { bankSheba: string; pin: string; expectedVersion: number; otp?: string }, signal?: AbortSignal, deps = defaults): Promise<BankResult> {
  if (!validBankSheba(input.bankSheba) || !validBankPin(input.pin) || (input.otp !== undefined && !/^\d{4}$/.test(input.otp))) return Promise.resolve({ ok: false, message: 'شبای معتبر، رمز شش‌رقمی و کد پیامکی معتبر وارد کنید.' });
  return detailsRequest('/workers/me/bank-details', { method: 'PUT', body: JSON.stringify(input), signal }, deps);
}
export function saveBankPin(input: { newPin: string; currentPin?: string; expectedVersion: number; otp?: string }, signal?: AbortSignal, deps = defaults): Promise<BankResult> {
  if (!validBankPin(input.newPin) || (input.currentPin !== undefined && !validBankPin(input.currentPin)) || (input.otp !== undefined && !/^\d{4}$/.test(input.otp))) return Promise.resolve({ ok: false, message: 'رمز باید شش رقم و کد پیامکی چهار رقم باشد.' });
  return detailsRequest('/workers/me/bank-pin', { method: 'PUT', body: JSON.stringify(input), signal }, deps);
}
export async function requestBankOtp(purpose: BankOtpPurpose, signal?: AbortSignal, deps = defaults): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await bankRequest('/workers/me/bank-otp', { method: 'POST', body: JSON.stringify({ purpose }), signal }, deps);
    const ok = record(result) && result.success === true;
    return { ok, message: record(result) && typeof result.message === 'string' ? result.message : ok ? 'کد تأیید ارسال شد.' : 'وضعیت ارسال کد تأیید دریافت نشد.' };
  } catch { return { ok: false, message: 'ارسال کد تأیید انجام نشد؛ اتصال را بررسی کنید.' }; }
}
