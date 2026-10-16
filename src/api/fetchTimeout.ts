export const FETCH_TIMEOUT_MS = 30_000;
export const FETCH_TIMEOUT_MESSAGE = 'ارتباط برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.';

export function withTimeoutSignal(
  parent: AbortSignal | null | undefined,
  timeoutMs: number,
  now: () => number,
  startTimer: (fn: () => void, ms: number) => { clear: () => void },
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  const timer = startTimer(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => {
      timer.clear();
      if (parent) parent.removeEventListener('abort', onParentAbort);
      void now;
    },
  };
}
