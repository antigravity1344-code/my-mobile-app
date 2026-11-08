import { describe, expect, it } from 'vitest';
import { buildCustomerRequestPayload, type CustomerRequestForm } from './customerRequestPayload';

const base: CustomerRequestForm = {
  serviceId: 'hourly_labor', dateString: '1405-08-17', hour: 23, hours: 1, percent: 100, address: ' تهران ، خیابان نمونه ', gender: 'NO_PREFERENCE',
};

describe('buildCustomerRequestPayload', () => {
  it('builds a bounded request with the chosen window and percent in basis points', () => {
    const result = buildCustomerRequestPayload(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.adjustmentBasisPoints).toBe(10000);
    expect(Date.parse(result.payload.endAt) - Date.parse(result.payload.startAt)).toBe(3600000);
    expect(result.payload.address).toBe('تهران ، خیابان نمونه');
    expect(result.payload.genderPreference).toBe('NO_PREFERENCE');
    expect(result.payload).not.toHaveProperty('price');
  });

  it('rejects missing or invalid input in Persian messages', () => {
    expect(buildCustomerRequestPayload({ ...base, dateString: null })).toEqual({ ok: false, message: 'روز مورد نظر را انتخاب کنید.' });
    expect(buildCustomerRequestPayload({ ...base, hour: null })).toEqual({ ok: false, message: 'ساعت شروع را انتخاب کنید.' });
    expect(buildCustomerRequestPayload({ ...base, address: '  ' })).toEqual({ ok: false, message: 'آدرس خدمت را وارد کنید.' });
    expect(buildCustomerRequestPayload({ ...base, percent: 140 })).toEqual({ ok: false, message: 'درصد قیمت معتبر نیست.' });
    expect(buildCustomerRequestPayload({ ...base, hours: 5 })).toEqual({ ok: false, message: 'مدت کار معتبر نیست.' });
  });
});
