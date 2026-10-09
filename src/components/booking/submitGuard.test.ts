import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSubmitGuard } from './submitGuard';

describe('booking submit guard (F10)', () => {
  it('lets only the first of two rapid taps through', () => {
    const guard = createSubmitGuard();
    expect(guard.tryBegin()).toBe(true);
    expect(guard.tryBegin()).toBe(false);
  });

  it('allows a retry after a failed submit, but never after a successful one', () => {
    const guard = createSubmitGuard();
    guard.tryBegin();
    guard.finish(false);
    expect(guard.tryBegin()).toBe(true);
    guard.finish(true);
    expect(guard.tryBegin()).toBe(false);
  });

  it('the wizard checks the guard synchronously before anything else', () => {
    const src = readFileSync(join(__dirname, 'NativeBookingWizard.tsx'), 'utf8');
    const start = src.indexOf('const submitCurrentBooking = async () => {');
    const body = src.slice(start, start + 400);
    expect(body).toMatch(/submitGuard\.current\.tryBegin\(\)/);
  });
});
