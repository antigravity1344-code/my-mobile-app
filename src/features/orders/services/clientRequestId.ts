/**
 * کلید تکرارنشدنی یک رزرو (D-07). سرور فقط [A-Za-z0-9_-] با طول ۸ تا ۶۴ می‌پذیرد.
 * یکتایی فقط برای همان مشتری لازم است؛ زمان + عدد تصادفی کافی است.
 */
export function createClientRequestId(): string {
  const random = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `bk-${Date.now().toString(36)}-${random()}${random()}`;
}
