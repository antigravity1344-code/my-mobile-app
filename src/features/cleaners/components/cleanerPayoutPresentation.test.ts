import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('unapproved specialist settlement policy', () => {
  it('never presents a client-computed commission deduction as specialist pay', () => {
    const source = readFileSync(join(__dirname, 'CleanerDetailModal.tsx'), 'utf8');
    expect(source).not.toMatch(/price\.cleanerNetAmount/);
    expect(source).toContain('تسویه متخصص پس از تعیین سیاست مالی');
  });

  it('worker orders show the gross amount without a fixed payout deduction', () => {
    const source = readFileSync(join(__dirname, '../../../components/native/NativeWorkerPortal.tsx'), 'utf8');
    expect(source).toContain('workerPriceLine(order.serviceId, order.rawPrice');
    expect(source).not.toContain('منتظر تأیید مشتری بمانید');
    expect(source).not.toMatch(/price\s*\*\s*0\.8/);
  });
});
