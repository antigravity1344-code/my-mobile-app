import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { notificationOrderTarget, unreadCountFromResponse } from './notificationsUnread';

const home = readFileSync(join(__dirname, '..', '..', 'components', 'native', 'CustomerHomeScreen.tsx'), 'utf8');
const customerApp = readFileSync(join(__dirname, '..', '..', 'components', 'native', 'NativeCustomerApp.tsx'), 'utf8');

describe('bell dot (F9)', () => {
  it('uses the server unreadCount, or counts unread items, and is 0 when unknown', () => {
    expect(unreadCountFromResponse({ success: true, unreadCount: 3, notifications: [] })).toBe(3);
    expect(unreadCountFromResponse({ success: true, notifications: [{ readAt: null }, { readAt: '2026-10-09' }] })).toBe(1);
    expect(unreadCountFromResponse({ success: true, unreadCount: 0, notifications: [{ readAt: null }] })).toBe(0);
    expect(unreadCountFromResponse({ success: false, message: 'x' })).toBe(0);
    expect(unreadCountFromResponse(undefined)).toBe(0);
  });

  it('home shows the dot only when there is something unread', () => {
    expect(home).toMatch(/unreadCount > 0 \? <View style=\{styles\.notifDot\} \/> : null/);
    expect(home).not.toMatch(/<IconBell \/>\s*<View style=\{styles\.notifDot\} \/>/);
  });
});

describe('notification → order (F9)', () => {
  it('returns the order id only when there is one', () => {
    expect(notificationOrderTarget({ orderId: 'abc' })).toBe('abc');
    expect(notificationOrderTarget({ orderId: '  ' })).toBeNull();
    expect(notificationOrderTarget({ orderId: null })).toBeNull();
  });

  it('customer app opens that order from the notifications screen', () => {
    expect(customerApp).toMatch(/<NativeNotificationsScreen\s+onOpenOrder=/);
  });
});
