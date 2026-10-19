/** Full amount in toman, formatted like the order-card price: «۶۰۰٬۰۰۰ تومان». */
export function formatTomanAmount(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString('fa-IR')} تومان`;
}

function finiteAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Read the amount and server unit exactly as a reloaded order carries them. */
export function reloadedOrderMoney(input: { price?: unknown; pricing?: { total?: unknown; currencyUnit?: unknown } | null }): {
  total: number;
  currencyUnit: string | undefined;
} {
  const pricing = input.pricing && typeof input.pricing === 'object' ? input.pricing : null;
  const total = pricing && typeof pricing.total === 'number' ? pricing.total : finiteAmount(input.price);
  const unit = pricing && typeof pricing.currencyUnit === 'string' ? pricing.currencyUnit.trim() : '';
  return { total, currencyUnit: unit || undefined };
}

/** Server unit is shown unchanged. Orders with no server unit keep the historical toman label and the same number. */
export function formatStoredAmount(amount: unknown, currencyUnit: string | null | undefined): string {
  const unit = typeof currencyUnit === 'string' ? currencyUnit.trim() : '';
  const safe = finiteAmount(amount);
  if (!unit) return formatTomanAmount(safe);
  return `${safe.toLocaleString('fa-IR')} ${unit}`;
}

export function summarizeCompletedSpend(orders: Array<{ status?: string; pricing?: { total?: number } | null; quoteCurrencyUnit?: string | null }>): {
  totalSpent: number;
  currencyUnit: string | null;
  mixed: boolean;
} {
  const completed = orders.filter((order) => order.status === 'COMPLETED');
  const units = new Set(completed.map((order) => (typeof order.quoteCurrencyUnit === 'string' ? order.quoteCurrencyUnit.trim() : '')));
  if (units.size > 1) return { totalSpent: 0, currencyUnit: null, mixed: true };
  const only = units.values().next().value;
  const currencyUnit = typeof only === 'string' && only !== '' ? only : null;
  let totalSpent = 0;
  for (const order of completed) totalSpent += finiteAmount(order.pricing?.total);
  return { totalSpent, currencyUnit, mixed: false };
}
