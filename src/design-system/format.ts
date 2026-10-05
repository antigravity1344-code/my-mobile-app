const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Display helper. Does not change stored numbers or pricing math. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

export function formatToman(amount: number): string {
  const grouped = new Intl.NumberFormat('en-US').format(Math.round(amount)).replace(/,/g, '٬');
  return `${toPersianDigits(grouped)} تومان`;
}
