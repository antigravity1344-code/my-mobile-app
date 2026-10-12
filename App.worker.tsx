import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { beginPreview, endPreview, previewAvailable } from './src/components/native/previewRuntime';
import { RealUiPreview } from './src/components/native/RealUiPreview';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { WorkerBookingProvider } from './src/context/WorkerBookingContext';
import { ProfileProvider } from './src/features/profile';
import { CleanersProvider } from './src/features/cleaners';
import { NativeWorkerApp } from './src/components/native/NativeWorkerApp';

function ProductionApp() {
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

/** A preview never mounts production providers or contacts production APIs. */
export default function App() {
  const [mode, setMode] = useState<'select' | 'real' | 'preview'>('select');
  if (!previewAvailable()) return <ProductionApp />;
  if (mode === 'preview') return <RealUiPreview role="worker" onExit={() => setMode('select')} renderApp={(revision) => <ProductionApp key={revision} />} />;
  if (mode === 'real') return <ProductionApp />;
  return (
    <View style={previewStyle.container}>
      <Text style={previewStyle.title}>پاکشو — متخصص</Text>
      <Text style={previewStyle.note}>نسخه توسعه | حالت پیش‌نمایش کاملاً آزمایشی</Text>
      <Pressable style={previewStyle.button} onPress={() => { beginPreview('worker'); setMode('preview'); }}>
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
