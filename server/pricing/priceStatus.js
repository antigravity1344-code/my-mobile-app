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
 * @param completion خلاصهٔ درخواست تکمیل (store.completionFor)؛ وقتی قطعی شده، مبلغ نهایی همان است.
 * @returns {{status: 'locked', lockedAmount: number} | {status: 'hourly_pending'} | {status: 'unknown'}}
 */
function orderPriceStatus(order, now = new Date(), completion = null) {
  // مبلغ نهایی تکمیلِ قطعی‌شده بر برآورد رزرو مقدم است (حتی اگر با آن فرق کند).
  if (completion && completion.status === 'completed' &&
      Number.isSafeInteger(completion.finalAmount) && completion.finalAmount > 0) {
    return { status: 'locked', lockedAmount: completion.finalAmount };
  }
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

/** حداقل دستمزد پایه، بر اساس همان نسخهٔ تعرفه که سفارش با آن ثبت شد. */
function workerMinimumBaseAmount(order) {
  const pricing = order.pricing;
  if (pricing?.source !== 'server' || !pricing.tariffVersionId) return null;
  try {
    const policy = loadCommittedTariff();
    if (policy.currencyUnit !== pricing.currencyUnit) return null;
    const version = policy.versions.find((item) => item.id === pricing.tariffVersionId);
    const service = version?.services[order.serviceId];
    if (service?.model !== 'hourly') return null;
    const minimum = Math.max(service.minCharge ?? 0, service.rate * (service.minQuantity ?? 1));
    return Number.isSafeInteger(minimum) && minimum > 0 ? minimum : null;
  } catch {
    return null;
  }
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
        ...(service.model === 'hourly' && service.minQuantity != null ? { minQuantity: service.minQuantity } : {}),
        ...(service.staircaseKey ? { staircaseKey: service.staircaseKey } : {}),
        exemptFromTierLock: service.exemptFromTierLock === true,
        pricingMode: service.pricingMode == null ? null : service.pricingMode,
        seatSizes: service.pricingMode === 'mattress_seat' ? ['7', '9'] : null,
        // آیا تعرفهٔ همین خدمت هم‌اکنون قیمت پکیج مواد شوینده دارد؛ بدون افشای مبلغ.
        detergentAvailable: Boolean(service.staircaseKey) || service.surcharges.some((item) => item.optionId === 'detergent'),
      };
    });
  } catch (error) {
    return [];
  }
}

module.exports = { orderPriceStatus, currentPricingRules, workerMinimumBaseAmount };
