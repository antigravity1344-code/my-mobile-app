import { Platform } from 'react-native';
import { WorkerBookingProvider } from './src/context/WorkerBookingContext';
import { OrdersProvider } from './src/features/orders';
import { ProfileProvider } from './src/features/profile';
import { CleanersProvider } from './src/features/cleaners';
import { NativeWorkerApp } from './src/components/native/NativeWorkerApp';

// اپلیکیشن مستقل متخصص/کارگر — بدون هیچ وابستگی به کد مشتری
export default function App() {
  return (
    <WorkerBookingProvider>
      <OrdersProvider>
        <ProfileProvider>
          <CleanersProvider>
            {Platform.OS === 'web' ? (
              <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
                <h2>پاکشو — نسخه متخصص (وب)</h2>
                <p>برای استفاده کامل، اپلیکیشن موبایل را نصب کنید.</p>
              </div>
            ) : (
              <NativeWorkerApp />
            )}
          </CleanersProvider>
        </ProfileProvider>
      </OrdersProvider>
    </WorkerBookingProvider>
  );
}
