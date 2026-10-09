/**
 * قفل همزمان (بدون انتظار برای state ری‌اکت) برای دکمه «ثبت سفارش»؛ دو لمس سریع فقط یک درخواست می‌فرستند.
 * بعد از خطا دوباره باز می‌شود، بعد از ثبت موفق بسته می‌ماند.
 */
export function createSubmitGuard() {
  let inFlight = false;
  let succeeded = false;
  return {
    tryBegin(): boolean {
      if (inFlight || succeeded) return false;
      inFlight = true;
      return true;
    },
    finish(success: boolean): void {
      inFlight = false;
      if (success) succeeded = true;
    },
  };
}
