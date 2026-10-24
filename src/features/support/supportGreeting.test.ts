import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORT_GREETING, supportSenderLine } from './supportGreeting';

describe('support greeting (no name, ever)', () => {
  it('fixed text pointing to FAQ / support', () => {
    expect(SUPPORT_GREETING).toBe('سوال‌های متداول را ببینید یا با پشتیبانی تماس بگیرید.');
  });
  it('sender line: phone only, Persian digits', () => {
    expect(supportSenderLine('09121234567')).toBe('از طرف ۰۹۱۲۱۲۳۴۵۶۷');
    expect(supportSenderLine('')).toBe('');
    expect(supportSenderLine(undefined)).toBe('');
  });
  it('NativeSupportScreen shows no user name anywhere', () => {
    const src = readFileSync(join(__dirname, 'components', 'NativeSupportScreen.tsx'), 'utf8');
    expect(src).toContain('{SUPPORT_GREETING}');
    expect(src).toContain('{supportSenderLine(user.phone)}');
    expect(src).not.toContain('عزیز');
    expect(src).not.toContain('displayName');
    expect(src).not.toMatch(/\{user\.name\}/);
  });
});

describe('support: after sending, the new message is shown', () => {
  const src = readFileSync(join(__dirname, 'components', 'NativeSupportScreen.tsx'), 'utf8');
  it('dismisses the keyboard, closes the sheet and scrolls the page to «پیام‌های شما»', () => {
    expect(src).toContain('Keyboard.dismiss();');
    expect(src).toMatch(/onLayout=\{\(e\) => \{\s*messagesYRef\.current = e\.nativeEvent\.layout\.y;/);
    expect(src).toMatch(/pageScrollRef\.current\?\.scrollTo\(\{ y: Math\.max\(0, messagesYRef\.current - 8\), animated: true \}\)/);
    expect(src).toContain('ref={pageScrollRef}');
  });
});

describe('support sheet: «ثبت پیام» button keeps its height (label visible)', () => {
  const src = readFileSync(join(__dirname, 'components', 'NativeSupportScreen.tsx'), 'utf8');
  it('submit button does not use flex:1 inside the column sheet', () => {
    expect(src).toMatch(/<Pressable onPress=\{submitMessage\} style=\{\[styles\.primaryBtn, (workerAppearance && workerStyles\.primaryBtn, )?styles\.submitBtn\]\}>/);
    expect(src).toMatch(/submitBtn: \{ flex: 0, minHeight: 48 \}/);
  });
});
