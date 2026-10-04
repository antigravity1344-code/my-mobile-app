import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';
import CustomerApp from './App.customer';
import WorkerApp from './App.worker';

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
} else if (process.env.EXPO_PUBLIC_APP_FLAVOR === 'worker') {
  // روی گوشی: اپ متخصص
  registerRootComponent(WorkerApp);
} else {
  // روی گوشی: اپ مشتری (پیش‌فرض)
  registerRootComponent(CustomerApp);
}
