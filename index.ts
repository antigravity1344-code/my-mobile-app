import { registerRootComponent } from 'expo';
import React from 'react';
import { Platform } from 'react-native';
import App from './App';
import CustomerApp from './App.customer';
import WorkerApp from './App.worker';
import { WEB_PREVIEW_GATE } from './src/config/webPreviewGate';
import { webAppRoleFromSearch } from './src/config/webAppRole';

type NativeRootProps = {
  appFlavor?: string;
};

function resolveNativeFlavor(appFlavor?: string): 'worker' | 'customer' {
  const fromProps = String(appFlavor || '').toLowerCase();
  if (fromProps === 'worker') return 'worker';
  if (fromProps === 'customer') return 'customer';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const fromQuery = webAppRoleFromSearch(window.location.search);
    if (fromQuery) return fromQuery;
  }

  const fromEnv = String(process.env.EXPO_PUBLIC_APP_FLAVOR || '').toLowerCase();
  if (fromEnv === 'worker') return 'worker';
  return 'customer';
}

function NativeRoot({ appFlavor }: NativeRootProps) {
  // BuildConfig.FLAVOR از MainActivity به‌صورت initialProps می‌آید؛
  // این برای APKهای release ضروری است چون env در bundle ممکن است اشتباه/خالی باشد.
  const AppComponent = resolveNativeFlavor(appFlavor) === 'worker' ? WorkerApp : CustomerApp;
  return React.createElement(AppComponent);
}

if (Platform.OS === 'web') {
  // تزریق استایل‌های Tailwind جهت نمایش کامل استایل‌ها در مرورگر وب
  if (typeof document !== 'undefined') {
    const existingScript = document.getElementById('tailwind-cdn');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }
}

// داشبورد وب پیش‌فرض می‌ماند. فقط با EXPO_PUBLIC_WEB_NATIVE=1 اپ واقعی مشتری/متخصص روی وب برای QA باز می‌شود.
if (Platform.OS === 'web' && !WEB_PREVIEW_GATE && process.env.EXPO_PUBLIC_WEB_NATIVE !== '1') {
  registerRootComponent(App);
} else {
  registerRootComponent(NativeRoot);
}
