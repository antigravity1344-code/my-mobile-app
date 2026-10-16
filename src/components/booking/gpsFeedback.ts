/** User-facing GPS copy. Keep numbers and product policy out of this helper. */
export const GPS_UNAVAILABLE_MESSAGE =
  'موقعیت دریافت نشد. مجوز مکان را بررسی کنید یا آدرس را دستی وارد کنید.';

export function messageForGpsResult(found: boolean): string | null {
  return found ? null : GPS_UNAVAILABLE_MESSAGE;
}
