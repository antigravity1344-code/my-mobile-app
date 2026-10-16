import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { reloadApp } from './src/components/native/reloadApp';
import { beginPreview, endPreview, beginPreviewShutdown, previewAvailable } from './src/components/native/previewRuntime';
import { RealUiPreview } from './src/components/native/RealUiPreview';
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

/** Preview mounts the real UI behind isolated storage/network. Reload clears the sandbox before real login. */
export default function App() {
  const [mode, setMode] = useState<'select' | 'real' | 'preview'>('select');
  if (!previewAvailable()) return <ProductionApp />;
  if (mode === 'preview') return <RealUiPreview role="customer" onExit={() => { beginPreviewShutdown(); reloadApp(); }} renderApp={(revision) => <ProductionApp key={revision} />} />;
  if (mode === 'real') return <ProductionApp />;
  return (
    <View style={previewStyle.container}>
      <Text style={previewStyle.title}>پاکشو — مشتری</Text>
      <Text style={previewStyle.note}>نسخه توسعه | حالت پیش‌نمایش کاملاً آزمایشی</Text>
      <Pressable style={previewStyle.button} onPress={() => { beginPreview('customer'); setMode('preview'); }}>
        <Text style={previewStyle.buttonText}>ورود به پیش‌نمایش بدون پیامک</Text>
      </Pressable>
      <Pressable style={previewStyle.button} onPress={() => { endPreview(); setMode('real'); }}>
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
