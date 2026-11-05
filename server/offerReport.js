'use strict';
// گزارش فقط‌نمایشی برای مدیر: متخصص‌هایی که رزروهای پیشنهادی‌شان الگوی احتمالاً مشکوک دارد.
// هیچ محدودیتی اعمال نمی‌کند؛ پیگیری با مدیر است. آستانه‌ها اینجا ثابت و شفاف‌اند.
const MIN_BOOKINGS = 3;           // حداقل رزرو برای قضاوت دربارهٔ الگو
const NEAR_MIN_MARGIN_BPS = 1000; // «نزدیک حداقل» یعنی تا ۱۰٪ بالاتر از حداقل مجاز
const REPEAT_LOW_BPS = 8500;      // رزروِ تکراریِ مشتری با قیمت ≤ ۸۵٪ تعرفه

/**
 * @param {{offers: object[], getOrder: Function, getUser: Function, minBps: number}} input
 * offers: فقط پیشنهادهای رزروشده. خروجی: ردیف هر متخصص با پرچم‌ها؛ فقط ردیف‌های پرچم‌دار به‌ترتیب شدت.
 */
function buildOfferReport({ offers, getOrder, getUser, minBps }) {
  const byWorker = new Map();
  for (const offer of offers) {
    const order = offer.bookedOrderId ? getOrder(offer.bookedOrderId) : null;
    if (!order || order.status === 'CANCELLED') continue;
    const row = byWorker.get(offer.workerId) || { workerId: offer.workerId, bookings: 0, sumBps: 0, nearMin: 0, byCustomer: new Map() };
    row.bookings += 1;
    row.sumBps += offer.adjustmentBasisPoints;
    if (offer.adjustmentBasisPoints <= minBps + NEAR_MIN_MARGIN_BPS) row.nearMin += 1;
    if (offer.adjustmentBasisPoints <= REPEAT_LOW_BPS) {
      row.byCustomer.set(order.customerId, (row.byCustomer.get(order.customerId) || 0) + 1);
    }
    byWorker.set(offer.workerId, row);
  }
  const rows = [];
  for (const row of byWorker.values()) {
    const averageBps = Math.round(row.sumBps / row.bookings);
    const repeatMax = Math.max(0, ...row.byCustomer.values());
    const flags = [];
    if (row.bookings >= MIN_BOOKINGS && row.nearMin >= MIN_BOOKINGS) flags.push('NEAR_MINIMUM_PRICE');
    if (repeatMax >= MIN_BOOKINGS) flags.push('REPEAT_CUSTOMER_LOW_PRICE');
    if (!flags.length) continue;
    const worker = getUser(row.workerId);
    rows.push({
      workerId: row.workerId,
      workerName: worker && worker.name ? String(worker.name) : '',
      workerPhone: worker && worker.phone ? String(worker.phone) : '',
      bookings: row.bookings,
      averagePercent: Math.round(averageBps) / 100,
      nearMinimumBookings: row.nearMin,
      maxRepeatSameCustomer: repeatMax,
      flags,
    });
  }
  rows.sort((a, b) => b.flags.length - a.flags.length || b.bookings - a.bookings);
  return rows;
}

module.exports = { buildOfferReport, MIN_BOOKINGS, NEAR_MIN_MARGIN_BPS, REPEAT_LOW_BPS };
