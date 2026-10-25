import { describe, expect, it } from 'vitest';
import { completionInput, readCompletion } from './completionInput';

describe('actual completion figures', () => {
  it('accepts localized actual hours and whole amounts without using estimates', () => {
    expect(completionInput(true, '۲۶٫۲۵', '۹۰۰۰۰۰')).toEqual({ actualHours: 26.25, finalAmount: 900000 });
    expect(completionInput(false, '', '0')).toEqual({ actualHours: null, finalAmount: 0 });
    expect(completionInput(false, 'stale hidden hours', '250')).toEqual({ actualHours: null, finalAmount: 250 });
  });
  it.each(['', '-1', '1.1', '1e5', 'Infinity', '9007199254740992', '۱۲٬۰۰۰'])('rejects invalid final amount %s', amount => {
    expect(completionInput(false, '', amount)).toBeNull();
  });
  it.each(['', '0', '-1', '2.333', '1e2', 'Infinity', '9007199254740992'])('rejects invalid actual hours %s', hours => {
    expect(completionInput(true, hours, '100')).toBeNull();
  });
  it('does not turn absent or malformed approval data into an actionable request', () => {
    const valid = { requestId: 'request-1', status: 'pending', mode: 'customer_confirmation', actualHours: 3.5, finalAmount: 700000, policyVersion: 0 };
    expect(readCompletion(valid)).toEqual(valid);
    for (const patch of [{ requestId: '' }, { status: 'unknown' }, { finalAmount: -1 }, { finalAmount: '700000' }, { actualHours: undefined }, { policyVersion: -1 }]) {
      expect(readCompletion({ ...valid, ...patch })).toBeNull();
    }
    expect(readCompletion(null)).toBeNull();
  });
});
