import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { createAccountBlockedGate, onAccountBlocked } from '../../api/accountBlocked';

/**
 * حساب مسدود (۴۰۳ ACCOUNT_BLOCKED روی هر درخواست): یک دیالوگ با پیام سرور، و بعد از «باشه»
 * خروج با همان مسیر خروج موجود اپ. چند پاسخ همزمان فقط یک دیالوگ می‌سازند.
 */
export function useAccountBlockedLogout(active: boolean, logout: () => Promise<void> | void): void {
  const gate = useRef(createAccountBlockedGate());
  const activeRef = useRef(active);
  const logoutRef = useRef(logout);
  activeRef.current = active;
  logoutRef.current = logout;

  useEffect(
    () =>
      onAccountBlocked((message) => {
        if (!activeRef.current || !gate.current.tryEnter()) return;
        Alert.alert(
          'حساب مسدود است',
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
