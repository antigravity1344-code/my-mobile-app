'use strict';

// وضعیت قیمت سفارش برای نمایش در اپ‌ها (docs/PLAN-server-owned-price-status.fa.md).
// سرور تصمیم می‌گیرد؛ اپ‌ها فقط همین را نمایش می‌دهند.
// قیمت ثابت از model تعرفه می‌آید. نام خدمت این تصمیم را عوض نمی‌کند.
const { loadCommittedTariff } = require('./tariffPublication');
const { selectVersion } = require('./tariffEngine');

function tariffService(serviceId, now) {
  if (typeof serviceId !== 'string' || serviceId === '') return null;
  try {
    const version = selectVersion(loadCommittedTariff(), now);
    return version.services[serviceId] || null;
  } catch (error) {
    return null;
  }
}

/**
 * @returns {{status: 'locked', lockedAmount: number} | {status: 'hourly_pending'} | {status: 'unknown'}}
 */
function orderPriceStatus(order, now = new Date()) {
  const price = order && order.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return { status: 'unknown' };
  }
  const isGolden = Boolean(order.directRequestWorkerId);
  const service = tariffService(order.serviceId, now);
  const isFixed = Boolean(service && service.model === 'fixed');
  if (isGolden || isFixed) {
    return { status: 'locked', lockedAmount: price };
  }
  return { status: 'hourly_pending' };
}

/** مدل و پرچم معافیت هر خدمت در تعرفهٔ معتبر الان؛ برای نمایش اپ، بدون نرخ. */
function currentPricingRules(now = new Date()) {
  try {
    const version = selectVersion(loadCommittedTariff(), now);
    return Object.keys(version.services).map((serviceId) => {
      const service = version.services[serviceId];
      return {
        serviceId,
        model: service.model,
        exemptFromTierLock: service.exemptFromTierLock === true,
      };
    });
  } catch (error) {
    return [];
  }
}

module.exports = { orderPriceStatus, currentPricingRules };
