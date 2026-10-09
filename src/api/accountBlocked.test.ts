import { describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_BLOCKED_CODE,
  ACCOUNT_BLOCKED_MESSAGE,
  createAccountBlockedGate,
  emitAccountBlocked,
  isAccountBlockedResponse,
  onAccountBlocked,
} from './accountBlocked';

describe('account blocked detection', () => {
  it('recognises the requireUser 403 by code or by its exact message (older servers)', () => {
    expect(isAccountBlockedResponse({ success: false, httpStatus: 403, code: ACCOUNT_BLOCKED_CODE, message: 'x' })).toBe(true);
    expect(isAccountBlockedResponse({ success: false, httpStatus: 403, message: ACCOUNT_BLOCKED_MESSAGE })).toBe(true);
  });

  it('does not treat other 403s or other errors as blocked', () => {
    expect(isAccountBlockedResponse({ success: false, httpStatus: 403, message: 'فقط مشتری می‌تواند سفارش ثبت کند.' })).toBe(false);
    expect(isAccountBlockedResponse({ success: false, httpStatus: 401, message: 'ورود لازم است.' })).toBe(false);
    expect(isAccountBlockedResponse({ success: false, httpStatus: 409, code: ACCOUNT_BLOCKED_CODE })).toBe(false);
    expect(isAccountBlockedResponse({ success: true })).toBe(false);
    expect(isAccountBlockedResponse(undefined)).toBe(false);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn();
    const off = onAccountBlocked(listener);
    emitAccountBlocked('پیام');
    off();
    emitAccountBlocked('دوباره');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('پیام');
  });

  it('handles a burst of blocked responses once until reopened', () => {
    const gate = createAccountBlockedGate();
    expect(gate.tryEnter()).toBe(true);
    expect(gate.tryEnter()).toBe(false);
    gate.reopen();
    expect(gate.tryEnter()).toBe(true);
  });
});
