import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

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
  registerRootComponent(require('./App').default);
} else {
  // روی گوشی (اکسپو گو): نسخهٔ جدید اپ مشتری، یا متخصص با EXPO_PUBLIC_APP_FLAVOR=worker
  if (process.env.EXPO_PUBLIC_APP_FLAVOR === 'worker') {
    registerRootComponent(require('./App.worker').default);
  } else {
    registerRootComponent(require('./App.customer').default);
  }
}
