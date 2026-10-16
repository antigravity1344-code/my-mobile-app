'use strict';

/** Poll interval is an implementation detail, not a product rule. The 10-minute review window stays in dataStore. */
const DEFAULT_INTERVAL_MS = 30 * 1000;

function startCancelDueScheduler(store, options = {}) {
  const allowInTest = options.allowInTest === true;
  if (process.env.NODE_ENV === 'test' && !allowInTest) {
    return { stop() {} };
  }
  const intervalMs = Number.isFinite(options.intervalMs) && options.intervalMs > 0
    ? options.intervalMs
    : DEFAULT_INTERVAL_MS;
  const tick = () => {
    try {
      store.finalizeDueCancelRequests();
    } catch (error) {
      console.error('[Paksho] بررسی درخواست لغو سررسیدشده انجام نشد.');
    }
  };
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

module.exports = { startCancelDueScheduler, DEFAULT_INTERVAL_MS };
