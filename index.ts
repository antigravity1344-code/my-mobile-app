import { registerRootComponent } from 'expo';
import React from 'react';
import { Platform } from 'react-native';
import App from './App';
import CustomerApp from './App.customer';
import WorkerApp from './App.worker';

type NativeRootProps = {
  appFlavor?: string;
};

function resolveNativeFlavor(appFlavor?: string): 'worker' | 'customer' {
  const fromProps = String(appFlavor || '').toLowerCase();
  if (fromProps === 'worker') return 'worker';
  if (fromProps === 'customer') return 'customer';

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
  // داشبورد وب
  registerRootComponent(App);
} else {
  registerRootComponent(NativeRoot);
}
