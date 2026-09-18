import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

// تزریق استایل‌های Tailwind جهت نمایش کامل استایل‌ها در مرورگر وب
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const existingScript = document.getElementById('tailwind-cdn');
  if (!existingScript) {
    const script = document.createElement('script');
    script.id = 'tailwind-cdn';
    script.src = 'https://cdn.tailwindcss.com';
    document.head.appendChild(script);
  }
}

registerRootComponent(App);
