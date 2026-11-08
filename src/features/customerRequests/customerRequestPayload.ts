import { expectedStartAtFromSelection } from '../../utils/expectedStartAt';

export type CustomerRequestGender = 'NO_PREFERENCE' | 'FEMALE' | 'MALE';

export type CustomerRequestForm = {
  serviceId: string;
  dateString: string | null;
  hour: number | null;
  hours: number;
  percent: number;
  address: string;
  gender: CustomerRequestGender;
};

export type CustomerRequestPayload = {
  serviceId: string;
  startAt: string;
  endAt: string;
  adjustmentBasisPoints: number;
  address: string;
  genderPreference: CustomerRequestGender;
};

/** درصدهای قابل انتخاب مشتری؛ سرور همین بازه را دوباره بررسی می‌کند (۷۰٪ تا ۱۳۰٪ تعرفه). */
export const CUSTOMER_REQUEST_PERCENTS = [70, 80, 90, 100, 110, 120, 130] as const;
export const CUSTOMER_REQUEST_HOURS = [1, 2, 3, 4] as const;

/**
 * فرم را به بدنهٔ درخواست تبدیل می‌کند. فقط ورودی‌های معتبر را می‌پذیرد؛ قیمت نهایی هرگز ساخته یا فرستاده نمی‌شود.
 * خطا: یک پیام فارسی برای نمایش به مشتری.
 */
export function buildCustomerRequestPayload(form: CustomerRequestForm): { ok: true; payload: CustomerRequestPayload } | { ok: false; message: string } {
  if (!form.dateString) return { ok: false, message: 'روز مورد نظر را انتخاب کنید.' };
  if (form.hour == null || form.hour < 0 || form.hour > 23) return { ok: false, message: 'ساعت شروع را انتخاب کنید.' };
  const address = form.address.trim();
  if (!address) return { ok: false, message: 'آدرس خدمت را وارد کنید.' };
  if (!(CUSTOMER_REQUEST_PERCENTS as readonly number[]).includes(form.percent)) return { ok: false, message: 'درصد قیمت معتبر نیست.' };
  if (!(CUSTOMER_REQUEST_HOURS as readonly number[]).includes(form.hours)) return { ok: false, message: 'مدت کار معتبر نیست.' };
  const startAt = expectedStartAtFromSelection(form.dateString, `${String(form.hour).padStart(2, '0')}:00`);
  if (!startAt) return { ok: false, message: 'زمان انتخاب‌شده معتبر نیست.' };
  const endAt = new Date(Date.parse(startAt) + form.hours * 3600000).toISOString();
  return {
    ok: true,
    payload: {
      serviceId: form.serviceId,
      startAt,
      endAt,
      adjustmentBasisPoints: form.percent * 100,
      address,
      genderPreference: form.gender,
    },
  };
}
