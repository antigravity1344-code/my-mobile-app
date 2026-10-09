import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  WORKER_ORDERS_LOAD_ERROR,
  WORKER_SESSION_EXPIRED_MESSAGE,
  applyWorkerOrdersLoad,
  classifyWorkerOrdersResponse,
  shouldStartWorkerOrdersFetch,
  showsWorkerOrdersSpinner,
  type WorkerOrdersState,
} from './workerOrdersFetch';

const empty: WorkerOrdersState<string> = { available: [], mine: [], error: null, sessionExpired: false };
const loaded: WorkerOrdersState<string> = { available: ['a1'], mine: ['m1'], error: null, sessionExpired: false };

describe('worker orders fetch (#5 #6 #8)', () => {
  it('shows the spinner only for the initial and manual loads, never for background polls (#5)', () => {
    expect(showsWorkerOrdersSpinner('initial')).toBe(true);
    expect(showsWorkerOrdersSpinner('manual')).toBe(true);
    expect(showsWorkerOrdersSpinner('poll')).toBe(false);
    expect(showsWorkerOrdersSpinner('after-action')).toBe(false);
  });

  it('skips a background poll while another fetch is still running (#8)', () => {
    expect(shouldStartWorkerOrdersFetch('poll', true)).toBe(false);
    expect(shouldStartWorkerOrdersFetch('poll', false)).toBe(true);
    expect(shouldStartWorkerOrdersFetch('manual', true)).toBe(true);
    expect(shouldStartWorkerOrdersFetch('after-action', true)).toBe(true);
  });

  it('classifies responses: ok list, failure, expired session (#6)', () => {
    expect(classifyWorkerOrdersResponse({ success: true, orders: [{ id: '1' }] })).toEqual({ kind: 'ok', orders: [{ id: '1' }] });
    expect(classifyWorkerOrdersResponse({ success: false, message: 'خطای سرور' })).toEqual({ kind: 'error', message: 'خطای سرور' });
    expect(classifyWorkerOrdersResponse({ success: true })).toEqual({ kind: 'error', message: WORKER_ORDERS_LOAD_ERROR });
    expect(classifyWorkerOrdersResponse(undefined)).toEqual({ kind: 'error', message: WORKER_ORDERS_LOAD_ERROR });
    expect(classifyWorkerOrdersResponse({ success: false, httpStatus: 401, message: 'x' })).toEqual({ kind: 'expired' });
    expect(classifyWorkerOrdersResponse({ success: false, message: 'ورود لازم است.' })).toEqual({ kind: 'expired' });
  });

  it('a failed load keeps the previous lists and shows an error instead of an empty list (#6)', () => {
    const next = applyWorkerOrdersLoad(loaded, { available: { kind: 'error', message: 'قطع' }, mine: { kind: 'ok', orders: ['m2'] } }, 'manual');
    expect(next.available).toEqual(['a1']);
    expect(next.mine).toEqual(['m2']);
    expect(next.error).toBe('قطع');
  });

  it('a failed background poll changes nothing; a later success clears the error', () => {
    const failed = { available: { kind: 'error', message: 'قطع' }, mine: { kind: 'error', message: 'قطع' } } as const;
    expect(applyWorkerOrdersLoad(loaded, failed, 'poll')).toBe(loaded);
    const withError = { ...loaded, error: 'قطع' };
    const ok = applyWorkerOrdersLoad(withError, { available: { kind: 'ok', orders: [] }, mine: { kind: 'ok', orders: ['m1'] } }, 'poll');
    expect(ok).toEqual({ available: [], mine: ['m1'], error: null, sessionExpired: false });
  });

  it('an expired session is reported even from a poll (#6 401)', () => {
    const next = applyWorkerOrdersLoad(empty, { available: { kind: 'expired' }, mine: null }, 'poll');
    expect(next.sessionExpired).toBe(true);
    expect(next.error).toBe(WORKER_SESSION_EXPIRED_MESSAGE);
  });
});

describe('blocked account (403 ACCOUNT_BLOCKED)', () => {
  it('is its own kind, separate from other 403s', () => {
    expect(classifyWorkerOrdersResponse({ success: false, httpStatus: 403, code: 'ACCOUNT_BLOCKED', message: 'حساب شما مسدود شده است.' }))
      .toEqual({ kind: 'blocked', message: 'حساب شما مسدود شده است.' });
    expect(classifyWorkerOrdersResponse({ success: false, httpStatus: 403, message: 'دسترسی ندارید.' }))
      .toEqual({ kind: 'error', message: 'دسترسی ندارید.' });
  });

  it('stops the portal (even from a poll) and shows the server message', () => {
    const next = applyWorkerOrdersLoad(loaded, { available: { kind: 'blocked', message: 'حساب شما مسدود شده است.' }, mine: null }, 'poll');
    expect(next.sessionExpired).toBe(true);
    expect(next.error).toBe('حساب شما مسدود شده است.');
    expect(next.available).toEqual(['a1']);
  });
});

describe('worker portal dialogs (#7 #14)', () => {
  const source = readFileSync(join(__dirname, 'NativeWorkerPortal.tsx'), 'utf8');

  it('never calls the browser alert()', () => {
    expect(source).not.toMatch(/(^|[^.\w])alert\(/m);
  });

  it('asks for confirmation with an RN Alert before completing a job', () => {
    expect(source).toMatch(/Alert\.alert\(\s*'اتمام کار'/);
  });
});
