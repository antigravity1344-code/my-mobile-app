import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { createAccountBlockedGate } from '../../api/accountBlocked';
import { SESSION_EXPIRED_TITLE, onSessionExpired } from '../../api/sessionExpired';

/**
 * نشست منقضی (۴۰۱ روی درخواست با توکن): یک دیالوگ کوتاه فارسی و بعد از «باشه» خروج با مسیر خروج
 * موجود اپ (پاک شدن سفارش‌ها، پروفایل و نشست ذخیره‌شده). چند ۴۰۱ همزمان فقط یک دیالوگ می‌سازند.
 */
export function useSessionExpiredLogout(active: boolean, logout: () => Promise<void> | void): void {
  const gate = useRef(createAccountBlockedGate());
  const activeRef = useRef(active);
  const logoutRef = useRef(logout);
  activeRef.current = active;
  logoutRef.current = logout;

  useEffect(
    () =>
      onSessionExpired((message) => {
        if (!activeRef.current || !gate.current.tryEnter()) return;
        Alert.alert(
          SESSION_EXPIRED_TITLE,
          message,
          [
            {
              text: 'باشه',
              onPress: () => void Promise.resolve(logoutRef.current()).finally(() => gate.current.reopen()),
            },
          ],
          { cancelable: false },
        );
      }),
    [],
  );
}
