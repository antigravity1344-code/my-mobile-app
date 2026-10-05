import { NativeCustomerApp } from './src/components/native/NativeCustomerApp';
import { BookingProvider } from './src/context/BookingContext';
import { PakshoThemeProvider } from './src/design-system';
import { OrdersProvider } from './src/features/orders';
import { ProfileProvider } from './src/features/profile';

import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <PakshoThemeProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <BookingProvider>
          <OrdersProvider>
            <ProfileProvider>
              <NativeCustomerApp />
            </ProfileProvider>
          </OrdersProvider>
        </BookingProvider>
      </SafeAreaProvider>
    </PakshoThemeProvider>
  );
}
