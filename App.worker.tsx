import { WorkerBookingProvider } from './src/context/WorkerBookingContext';
import { OrdersProvider } from './src/features/orders';
import { ProfileProvider } from './src/features/profile';
import { CleanersProvider } from './src/features/cleaners';
import { NativeWorkerApp } from './src/components/native/NativeWorkerApp';

export default function App() {
  return (
    <WorkerBookingProvider>
      <OrdersProvider>
        <ProfileProvider>
          <CleanersProvider>
            <NativeWorkerApp />
          </CleanersProvider>
        </ProfileProvider>
      </OrdersProvider>
    </WorkerBookingProvider>
  );
}
