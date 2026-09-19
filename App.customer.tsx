import { Platform } from 'react-native';
import { BookingProvider } from './src/context/BookingContext';
import { OrdersProvider } from './src/features/orders';
import { ProfileProvider } from './src/features/profile';
import { NativeCustomerApp } from './src/components/native/NativeCustomerApp';

// اپلیکیشن مستقل مشتری — بدون هیچ وابستگی به کد متخصص/کارگر
export default function App() {
  return (
    <BookingProvider>
      <OrdersProvider>
        <ProfileProvider>
          {Platform.OS === 'web' ? (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
              <h2>پاکشو — نسخه مشتری (وب)</h2>
              <p>برای استفاده کامل، اپلیکیشن موبایل را نصب کنید.</p>
            </div>
          ) : (
            <NativeCustomerApp />
          )}
        </ProfileProvider>
      </OrdersProvider>
    </BookingProvider>
  );
}
