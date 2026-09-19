import { BookingProvider } from './src/context/BookingContext';
import { OrdersProvider } from './src/features/orders';
import { ProfileProvider } from './src/features/profile';
import { NativeCustomerApp } from './src/components/native/NativeCustomerApp';

export default function App() {
  return (
    <BookingProvider>
      <OrdersProvider>
        <ProfileProvider>
          <NativeCustomerApp />
        </ProfileProvider>
      </OrdersProvider>
    </BookingProvider>
  );
}
