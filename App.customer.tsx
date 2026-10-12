import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { IsolatedUiPreview, isUiPreviewEnabled } from './src/components/native/IsolatedUiPreview';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { BookingProvider } from './src/context/BookingContext';
import { OrdersProvider } from './src/features/orders';
import { ProfileProvider } from './src/features/profile';
import { NativeCustomerApp } from './src/components/native/NativeCustomerApp';

function ProductionApp() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <BookingProvider>
      <OrdersProvider>
        <ProfileProvider>
          <NativeCustomerApp />
        </ProfileProvider>
      </OrdersProvider>
    </BookingProvider>
    </SafeAreaProvider>
  );
}

/** A preview never mounts production providers or contacts production APIs. */
export default function App() {
  const [mode, setMode] = useState<'select' | 'real' | 'preview'>('select');
  if (!isUiPreviewEnabled()) return <ProductionApp />;
  if (mode === 'preview') return <IsolatedUiPreview role="customer" onExit={() => setMode('select')} />;
  if (mode === 'real') return <ProductionApp />;
  return (
    <View style={previewStyle.container}>
      <Text style={previewStyle.title}>پاکشو — مشتری</Text>
      <Text style={previewStyle.note}>نسخه توسعه | حالت پیش‌نمایش کاملاً آزمایشی</Text>
      <Pressable style={previewStyle.button} onPress={() => setMode('preview')}>
        <Text style={previewStyle.buttonText}>ورود به پیش‌نمایش بدون پیامک</Text>
      </Pressable>
      <Pressable style={previewStyle.button} onPress={() => setMode('real')}>
        <Text style={previewStyle.buttonText}>ورود واقعی با پیامک</Text>
      </Pressable>
    </View>
  );
}
const previewStyle = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#102b43', justifyContent: 'center', padding: 24, gap: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  note: { color: '#f8d78b', fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: '#087caf', padding: 17, minHeight: 52, borderRadius: 14, justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
