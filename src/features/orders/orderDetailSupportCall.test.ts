import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Product decision (9 Oct 2026): the customer never calls the specialist from the app;
// order detail offers a single «تماس با پشتیبانی» button that dials SUPPORT_TEL_URL.
describe('order detail: support call instead of specialist call', () => {
  const src = readFileSync(join(__dirname, 'components', 'OrderDetailModal.tsx'), 'utf8');
  it('has no customer → specialist call', () => {
    expect(src).not.toContain('handleCallCleaner');
    expect(src).not.toMatch(/tel:\$\{order\.cleaner/);
    expect(src).not.toContain('canCallCleaner');
  });
  it('exactly one call action, and it dials support', () => {
    expect(src.match(/Linking\.openURL\(/g)?.length).toBe(1);
    expect(src).toContain('Linking.openURL(SUPPORT_TEL_URL)');
    expect(src.match(/onPress=\{handleCallSupport\}/g)?.length).toBe(1);
    expect(src).toContain('>تماس با پشتیبانی</Text>');
  });
});

describe('customer never sees the specialist phone number', () => {
  const detail = readFileSync(join(__dirname, 'components', 'OrderDetailModal.tsx'), 'utf8');
  const card = readFileSync(join(__dirname, 'components', 'OrderCard.tsx'), 'utf8');
  it('order detail and order card do not render cleaner.phone', () => {
    expect(detail).not.toMatch(/cleaner\??\.phone/);
    expect(card).not.toMatch(/cleaner\??\.phone/);
  });
  it('falls back to a neutral text when the name is missing', () => {
    expect(detail).toContain("{order.cleaner?.name || 'اطلاعات متخصص روی سفارش ثبت نشده'}");
    expect(card).toContain("{order.cleaner?.name || 'اطلاعات متخصص ثبت نشده'}");
  });
});

// تست گوشی ۲۱ نوامبر ۲۰۲۶: «تأیید شروع کار» بیرون از اسکرول ثابت بود ولی «پایان کار و مبلغ نهایی»
// ته اسکرول می‌ماند و مالک فکر کرد درخواست تأیید پایان اصلاً نیامده.
describe('customer completion prompt stays visible while it needs an answer', () => {
  const src = readFileSync(join(__dirname, 'components', 'OrderDetailModal.tsx'), 'utf8');
  const scrollEnd = src.indexOf('</ScrollView>');
  it('pins the pending completion beside the start prompt, outside the scroll body', () => {
    const pinned = src.indexOf('{completionNeedsAnswer ? completionBox : null}');
    expect(pinned).toBeGreaterThan(scrollEnd);
    expect(pinned).toBeGreaterThan(src.indexOf('تأیید شروع کار</Text>'));
  });
  it('keeps the answered completion as information inside the scroll body', () => {
    const inScroll = src.indexOf('{completionNeedsAnswer ? null : completionBox}');
    expect(inScroll).toBeGreaterThan(0);
    expect(inScroll).toBeLessThan(scrollEnd);
  });
  it('renders the completion actions in exactly one place and only while pending', () => {
    expect(src.match(/respondToCompletion\('yes'\)/g)?.length).toBe(1);
    expect(src.match(/respondToCompletion\('no'\)/g)?.length).toBe(1);
    expect(src).toContain("const completionNeedsAnswer = order.completion?.status === 'pending' && order.status !== 'CANCEL_REQUESTED';");
  });
});
