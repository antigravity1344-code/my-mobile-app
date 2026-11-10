'use strict';

// وضعیت قیمت سفارش برای نمایش در اپ‌ها (docs/PLAN-server-owned-price-status.fa.md).
// سرور تصمیم می‌گیرد؛ اپ‌ها فقط همین را نمایش می‌دهند.
//
// مرحلهٔ ۱ (افزایشی، بدون تغییر رفتار): قاعدهٔ «قیمت ثابت» فعلاً همان شناسهٔ راه‌پله است.
// حذف این فهرست سخت‌کد و خواندن نوع قیمت از تعرفه، مرحلهٔ بعدی و بعد از تست گوشی است.
const FIXED_PRICE_SERVICE_IDS = ['staircase_common_areas'];

/**
 * @returns {{status: 'locked', lockedAmount: number} | {status: 'hourly_pending'} | {status: 'unknown'}}
 */
function orderPriceStatus(order) {
  const price = order && order.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return { status: 'unknown' };
  }
  const isGolden = Boolean(order.directRequestWorkerId);
  const isFixed = FIXED_PRICE_SERVICE_IDS.includes(order.serviceId);
  if (isGolden || isFixed) {
    return { status: 'locked', lockedAmount: price };
  }
  return { status: 'hourly_pending' };
}

module.exports = { orderPriceStatus, FIXED_PRICE_SERVICE_IDS };
