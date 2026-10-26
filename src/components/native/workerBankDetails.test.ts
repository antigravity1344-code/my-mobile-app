import { describe, expect, it, vi } from 'vitest';
vi.mock('../../api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('../../api/authToken', () => ({ attachStoredAuthToken: vi.fn() }));
vi.mock('../../utils/storage', () => ({ appStorage: {} }));
vi.mock('./previewRuntime', () => ({ previewActive: () => false }));
import { bankDigits, loadBankDetails, normalizeSheba, parseBankResponse, requestBankOtp, saveBankDetails, saveBankPin, validBankPin, validBankSheba } from './workerBankDetails';

const bankDetails = { bankShebaMasked: 'IR12****0001', hasPin: true, lockedUntil: null, version: 3 };
const response = { success: true, bankDetails, otpRequired: false };
function testSheba() {
  const body = '0'.repeat(21) + '1';
  let remainder = 0;
  for (const digit of body + '182700') remainder = (remainder * 10 + Number(digit)) % 97;
  return 'IR' + String(98 - remainder).padStart(2, '0') + body;
}
function fixture() { return { request: vi.fn().mockResolvedValue(response), prepare: vi.fn().mockResolvedValue(undefined), preview: vi.fn(() => false) }; }

describe('worker bank details contract', () => {
  it('validates checksum and six-digit PIN, including normalized Persian input', () => {
    expect(validBankSheba(testSheba())).toBe(true);
    expect(validBankSheba(testSheba().slice(0, -1) + '2')).toBe(false);
    expect(validBankSheba('IR' + '1'.repeat(24))).toBe(false);
    expect(normalizeSheba(' ir۱۲ ۳٤ ')).toBe('IR1234');
    expect(bankDigits('۱۲٣٤۵۶')).toBe('123456');
    expect(validBankPin('123456')).toBe(true);
    for (const invalid of ['12345', '1234567', '123 45', '12a456']) expect(validBankPin(invalid)).toBe(false);
  });
  it('accepts only masked bank details and never returns unexpected private fields', () => {
    expect(parseBankResponse({ ...response, bankDetails: { ...bankDetails, secret: 'should not be copied' } })).toEqual({ ok: true, bankDetails, otpRequired: false });
    for (const invalid of [
      { ...response, bankDetails: { ...bankDetails, bankShebaMasked: testSheba() } },
      { ...response, bankDetails: { ...bankDetails, version: -1 } },
      { ...response, bankDetails: { ...bankDetails, lockedUntil: 'invalid' } },
      { ...response, otpRequired: undefined },
    ]) expect(parseBankResponse(invalid).ok).toBe(false);
    expect(parseBankResponse({ success: true, bankDetails: { ...bankDetails, bankShebaMasked: null, hasPin: false }, otpRequired: true }).ok).toBe(true);
  });
  it('loads only the session-owned route after authentication', async () => {
    const deps = fixture();
    expect((await loadBankDetails(undefined, deps)).ok).toBe(true);
    expect(deps.prepare).toHaveBeenCalledOnce();
    expect(deps.request).toHaveBeenCalledWith('/workers/me/bank-details', { signal: undefined });
  });
  it('propagates reauthentication and temporary-credential state without copying the credential', () => {
    const temporaryExpiresAt = new Date(Date.now() + 600000).toISOString();
    const parsed = parseBankResponse({ ...response, temporaryPin: '987654', reauthenticationRequired: true, bankDetails: { ...bankDetails, pinTemporary: true, temporaryExpiresAt } });
    expect(parsed).toEqual({ ok: true, bankDetails: { ...bankDetails, pinTemporary: true, temporaryExpiresAt }, otpRequired: false, reauthenticationRequired: true });
    expect(JSON.stringify(parsed)).not.toContain('987654');
  });
  it('sends the bank revision, PIN and optional step-up proof without an account selector', async () => {
    const deps = fixture();
    const body = { bankSheba: testSheba(), pin: '123456', expectedVersion: 3, otp: '6543' };
    expect((await saveBankDetails(body, undefined, deps)).ok).toBe(true);
    expect(deps.request).toHaveBeenCalledWith('/workers/me/bank-details', { method: 'PUT', body: JSON.stringify(body), signal: undefined });
  });
  it('distinguishes first PIN setup from changing an existing PIN', async () => {
    const deps = fixture();
    await saveBankPin({ newPin: '654321', expectedVersion: 0 }, undefined, deps);
    expect(JSON.parse(deps.request.mock.calls[0][1].body)).toEqual({ newPin: '654321', expectedVersion: 0 });
    await saveBankPin({ newPin: '654321', currentPin: '123456', expectedVersion: 3 }, undefined, deps);
    expect(JSON.parse(deps.request.mock.calls[1][1].body)).toEqual({ newPin: '654321', currentPin: '123456', expectedVersion: 3 });
  });
  it('rejects invalid bank details or PIN locally without a write', async () => {
    const deps = fixture();
    expect((await saveBankDetails({ bankSheba: 'bad', pin: '123456', expectedVersion: 0 }, undefined, deps)).ok).toBe(false);
    expect((await saveBankPin({ newPin: '123', expectedVersion: 0 }, undefined, deps)).ok).toBe(false);
    expect(deps.request).not.toHaveBeenCalled();
  });
  it('blocks reads, writes and OTP in preview before preparing authentication', async () => {
    const deps = fixture(); deps.preview.mockReturnValue(true);
    expect((await loadBankDetails(undefined, deps)).ok).toBe(false);
    expect((await saveBankDetails({ bankSheba: testSheba(), pin: '123456', expectedVersion: 3 }, undefined, deps)).ok).toBe(false);
    expect((await saveBankPin({ newPin: '123456', expectedVersion: 3 }, undefined, deps)).ok).toBe(false);
    expect((await requestBankOtp('bank-details', undefined, deps)).ok).toBe(false);
    expect(deps.prepare).not.toHaveBeenCalled(); expect(deps.request).not.toHaveBeenCalled();
  });
  it('blocks a write when preview begins during authentication', async () => {
    const deps = fixture(); deps.prepare.mockImplementation(async () => { deps.preview.mockReturnValue(true); });
    expect((await saveBankPin({ newPin: '123456', expectedVersion: 3 }, undefined, deps)).ok).toBe(false);
    expect(deps.request).not.toHaveBeenCalled();
  });
  it('discards real bank details if preview begins while loading', async () => {
    const deps = fixture(); deps.request.mockImplementation(async () => { deps.preview.mockReturnValue(true); return response; });
    expect((await loadBankDetails(undefined, deps)).ok).toBe(false);
  });
  it('does not report a timed-out save as success and requests read-back', async () => {
    const deps = fixture(); deps.request.mockRejectedValue(new Error('network unavailable'));
    const result = await saveBankDetails({ bankSheba: testSheba(), pin: '123456', expectedVersion: 3 }, undefined, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('بازخوانی');
  });
  it('retains lock, conflict and expired-session responses as failures', async () => {
    const deps = fixture();
    for (const httpStatus of [401, 409, 423]) {
      deps.request.mockResolvedValue({ success: false, httpStatus, message: 'server rejection' });
      const result = await saveBankPin({ newPin: '123456', currentPin: '654321', expectedVersion: 3 }, undefined, deps);
      expect(result).toEqual({ ok: false, message: 'server rejection', sessionExpired: httpStatus === 401 });
    }
  });
  it('preserves a server lock timestamp so the form disables immediately after the fifth failure', () => {
    const lockedUntil = new Date(Date.now() + 900000).toISOString();
    expect(parseBankResponse({ success: false, httpStatus: 423, message: 'locked', lockedUntil })).toEqual({ ok: false, message: 'locked', sessionExpired: false, lockedUntil });
    expect(parseBankResponse({ success: false, message: 'locked', lockedUntil: 'invalid' })).not.toHaveProperty('lockedUntil');
  });
  it('requests a purpose-bound OTP without exposing a delivery code', async () => {
    const deps = fixture(); deps.request.mockResolvedValue({ success: true, message: 'sent', otp: 'must not return' });
    expect(await requestBankOtp('bank-pin', undefined, deps)).toEqual({ ok: true, message: 'sent' });
    expect(deps.request).toHaveBeenCalledWith('/workers/me/bank-otp', { method: 'POST', body: JSON.stringify({ purpose: 'bank-pin' }), signal: undefined });
  });
});
