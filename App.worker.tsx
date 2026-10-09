import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { WorkerBookingProvider } from './src/context/WorkerBookingContext';
import { ProfileProvider } from './src/features/profile';
import { CleanersProvider } from './src/features/cleaners';
import { NativeWorkerApp } from './src/components/native/NativeWorkerApp';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <WorkerBookingProvider>
      {/* Provider سفارش‌های مشتری عمداً اینجا نیست: هیچ صفحه متخصص از آن استفاده نمی‌کند و توکن/کاربر مشتری را می‌خواند. */}
      <ProfileProvider>
        <CleanersProvider>
          <NativeWorkerApp />
        </CleanersProvider>
      </ProfileProvider>
    </WorkerBookingProvider>
    </SafeAreaProvider>
  );
}
