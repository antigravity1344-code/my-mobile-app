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

type AppStateLike = string;

/**
 * همان watch بالا، ولی فقط وقتی اپ در پیش‌زمینه است. با برگشت به پیش‌زمینه یک بار فوراً تازه می‌کند
 * و watch را دوباره راه می‌اندازد؛ در پس‌زمینه هیچ درخواستی فرستاده نمی‌شود.
 */
export function startForegroundOrderStatusWatch(options: {
  refresh: () => Promise<void>;
  currentState: () => AppStateLike;
  subscribe: (listener: (state: AppStateLike) => void) => { remove: () => void };
  intervalMs?: number;
  setIntervalFn?: (callback: () => void, intervalMs: number) => unknown;
  clearIntervalFn?: (timer: unknown) => void;
}): () => void {
  let stopWatch: (() => void) | null = null;
  const start = () => {
    if (stopWatch) return;
    stopWatch = startOrderStatusWatch({
      refresh: options.refresh,
      intervalMs: options.intervalMs,
      setIntervalFn: options.setIntervalFn,
      clearIntervalFn: options.clearIntervalFn,
    });
  };
  const stop = () => {
    if (!stopWatch) return;
    stopWatch();
    stopWatch = null;
  };
  if (options.currentState() === 'active') start();
  const subscription = options.subscribe((next) => {
    if (next === 'active') {
      if (!stopWatch) {
        void options.refresh();
        start();
      }
    } else {
      stop();
    }
  });
  return () => {
    stop();
    subscription.remove();
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
