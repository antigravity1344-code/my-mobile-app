import { describe, expect, it } from 'vitest';

import { classifyWorkerOrder, describeWorkerServiceFacts } from './workerServiceCategory';

describe('worker service category', () => {
  it('maps a stored service id to the specialist category and catalog badge', () => {
    expect(classifyWorkerOrder({ serviceId: 'hourly_labor', serviceTitle: 'عنوان دیگر' })).toEqual({
      category: 'hourly_laborer',
      badge: 'ساعتی',
    });
    expect(classifyWorkerOrder({ serviceId: 'building_painting' })).toEqual({
      category: 'painter',
      badge: 'متراژی',
    });
    expect(classifyWorkerOrder({ serviceId: 'sofa_carpet_washing' })).toEqual({
      category: 'sofa_cleaner',
      badge: 'تعدادی',
    });
    expect(classifyWorkerOrder({ serviceId: 'home_unit_cleaning' })).toEqual({
      category: 'cleaner',
      badge: 'ساعتی',
    });
    expect(classifyWorkerOrder({ serviceId: 'office_company_cleaning' })).toEqual({
      category: 'cleaner',
      badge: 'سازمانی',
    });
  });

  it('classifies an old order only when its title matches a catalog service exactly', () => {
    expect(classifyWorkerOrder({ serviceId: null, serviceTitle: 'کارگر ساعتی' })).toEqual({
      category: 'hourly_laborer',
      badge: 'ساعتی',
    });
    expect(classifyWorkerOrder({ serviceTitle: 'نظافت داخل منزل / واحد' })).toEqual({
      category: 'cleaner',
      badge: 'ساعتی',
    });
    expect(classifyWorkerOrder({ serviceId: '  ', serviceTitle: 'نظافت' })).toEqual({
      category: null,
      badge: '',
    });
    expect(classifyWorkerOrder({ serviceTitle: 'کارگر ساعتی ' })).toEqual({
      category: null,
      badge: '',
    });
  });

  it('describes stored service facts without inventing a duration', () => {
    expect(describeWorkerServiceFacts({
      serviceId: 'hourly_labor',
      durationHours: 5,
      genderPreference: 'MALE',
      serviceOptions: { workerCount: '۲ نفر' },
      notes: 'زنگ بزنید',
      addressNotes: 'طبقه دوم',
    })).toBe([
      'مدت: 5 ساعت',
      'تعداد نیروی کارگر: ۲ نفر',
      'جنسیت متخصص: آقا',
      'یادداشت سفارش: زنگ بزنید',
      'یادداشت آدرس: طبقه دوم',
    ].join('\n'));
    expect(describeWorkerServiceFacts({})).toBe('');
  });
});
