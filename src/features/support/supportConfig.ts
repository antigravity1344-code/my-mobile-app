/** Shared customer support contact + FAQ for Paksho. */
export const SUPPORT_PHONE = '02191001234';
export const SUPPORT_TEL_URL = `tel:${SUPPORT_PHONE}`;
export const SUPPORT_HOURS = 'همه‌روزه ۹ تا ۲۱';

export type FaqItem = { id: string; question: string; answer: string };

export const SUPPORT_FAQ: FaqItem[] = [
  {
    id: 'faq_1',
    question: 'چطور سفارش ثبت کنم؟',
    answer: 'از صفحه اصلی سرویس را انتخاب کنید، زمان و آدرس را وارد کنید و سفارش را بدون پرداخت اولیه ثبت کنید. پرداخت بعد از انجام کار انجام می‌شود.',
  },
  {
    id: 'faq_2',
    question: 'آیا قبل از کار باید پرداخت کنم؟',
    answer: 'خیر. در اپ مشتری پرداخت جلوتر از انجام کار لازم نیست؛ مبلغ بعد از اتمام سرویس دریافت می‌شود.',
  },
  {
    id: 'faq_3',
    question: 'چطور آدرس ذخیره‌شده اضافه کنم؟',
    answer: 'از آیکون تنظیمات/پروفایل وارد شوید، بخش آدرس‌های ذخیره‌شده را باز کنید و آدرس جدید را اضافه کنید.',
  },
  {
    id: 'faq_4',
    question: 'لغو سفارش چطور است؟',
    answer: 'از فهرست سفارش‌ها جزئیات سفارش را باز کنید و در صورت مجاز بودن وضعیت، درخواست لغو را ثبت کنید. برای موارد خاص با پشتیبانی تماس بگیرید.',
  },
  {
    id: 'faq_5',
    question: 'ساعات پاسخگویی پشتیبانی؟',
    answer: `تیم پشتیبانی پاکشو ${SUPPORT_HOURS} پاسخگوی تماس‌های شماست.`,
  },
];
