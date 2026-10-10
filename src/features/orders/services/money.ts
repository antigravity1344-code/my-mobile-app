/** Full amount in toman, formatted like the order-card price: «۶۰۰٬۰۰۰ تومان». */
export function formatTomanAmount(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString('fa-IR')} تومان`;
}
