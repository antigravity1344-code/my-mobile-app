import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Latin digits in user-visible native text (audit LOW «Latin digits»). Inputs keep what the user types;
// tel: links keep Latin digits. Source-level checks: RN screens cannot render under node vitest.
const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

const cases: [string, string[], string[]][] = [
  ['components/booking/NativeBookingWizard.tsx',
    ['{toPersianDigits(hours)} ساعت', '{toPersianDigits(date.dayOfMonth)}', '{toPersianDigits(slot.startTime)} تا {toPersianDigits(slot.endTime)}',
     "{toPersianDigits(booking.selectedDate?.dayOfMonth ?? '')}", 'formatServerAmount(review.total, review.currencyUnit)', 'formatServerAmount(review.amount, review.currencyUnit)'],
    ['>{hours} ساعت<', '>{date.dayOfMonth}<']],
  ['features/orders/components/OrderDetailModal.tsx',
    ['${toPersianDigits(order.durationHours)} ساعت', "{toPersianDigits(order.ratings?.customerRating ?? '')} از ۵"],
    ['{order.ratings?.customerRating} از ۵', '${order.durationHours} ساعت']],
  ['features/orders/components/OrderCard.tsx', ['${toPersianDigits(order.durationHours)} ساعت'], ['${order.durationHours} ساعت']],
  ['features/orders/components/OrderRatingModal.tsx', ['{toPersianDigits(order.ratings.cleanerRating)} از ۵'], []],
  ['features/profile/components/NativeProfileScreen.tsx',
    ["{toPersianDigits(profile.phoneNumber || '')}", '{toPersianDigits(profile.loyalty.completedOrdersCount)}'], ['{profile.phoneNumber}<']],
  ['components/native/NativeWorkerPortal.tsx',
    ["({toPersianDigits(order.phone || '')})", '({toPersianDigits(availableOrders.length)})', '({toPersianDigits(activeJobs.length)})'],
    ['({availableOrders.length})', '({activeJobs.length})']],
];

describe('Persian digits in user-visible native text', () => {
  for (const [file, must, mustNot] of cases) {
    it(file, () => {
      const src = read(file);
      for (const m of must) expect(src).toContain(m);
      for (const m of mustNot) expect(src).not.toContain(m);
    });
  }
});
