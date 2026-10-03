export const CUSTOMER_ORDER_STATUS_INTERVAL_MS = 10_000;

export function createLatestRequestGuard() {
  let current = 0;
  return () => {
    const id = ++current;
    return () => id === current;
  };
}

export function createOrderStatusTicker(refresh: () => Promise<void>) {
  let stopped = false;
  let inFlight = false;

  return {
    async tick() {
      if (stopped || inFlight) return false;
      inFlight = true;
      try {
        await refresh();
        return true;
      } finally {
        inFlight = false;
      }
    },
    stop() {
      stopped = true;
    },
  };
}

export function startOrderStatusWatch(options: {
  refresh: () => Promise<void>;
  intervalMs?: number;
  setIntervalFn?: (callback: () => void, intervalMs: number) => unknown;
  clearIntervalFn?: (timer: unknown) => void;
}): () => void {
  const ticker = createOrderStatusTicker(options.refresh);
  const setIntervalFn = options.setIntervalFn ?? ((callback, intervalMs) => setInterval(callback, intervalMs));
  const clearIntervalFn = options.clearIntervalFn ?? ((timer) => {
    clearInterval(timer as ReturnType<typeof setInterval>);
  });
  const timer = setIntervalFn(() => {
    void ticker.tick();
  }, options.intervalMs ?? CUSTOMER_ORDER_STATUS_INTERVAL_MS);
  return () => {
    ticker.stop();
    clearIntervalFn(timer);
  };
}
