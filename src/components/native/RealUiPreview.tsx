import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { previewScenario, setPreviewScenario, type Scenario } from './previewRuntime';

const scenarios: Array<[Scenario, string]> = [
  ['PENDING', 'در انتظار'],
  ['ACCEPTED', 'پذیرفته‌شده'],
  ['IN_PROGRESS', 'در حال انجام'],
  ['CANCEL_REQUESTED', 'درخواست لغو'],
  ['COMPLETED', 'تکمیل‌شده'],
  ['CANCELLED', 'لغوشده'],
  ['EMPTY', 'بدون سفارش'],
  ['ERROR', 'خطای شبکه'],
];

export function RealUiPreview({ role, onExit, renderApp }: {
  role: 'customer' | 'worker';
  onExit: () => void;
  renderApp: (revision: number) => ReactNode;
}) {
  const [selected, setSelected] = useState<Scenario>(previewScenario());
  const [revision, setRevision] = useState(0);
  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.title}>حالت پیش‌نمایش | {role === 'worker' ? 'متخصص' : 'مشتری'}</Text>
        <Pressable onPress={onExit} accessibilityRole="button">
          <Text style={styles.exit}>خروج از پیش‌نمایش</Text>
        </Pressable>
        <ScrollView horizontal contentContainerStyle={styles.scenarios}>
          {scenarios.map(([key, label]) => (
            <Pressable key={key} accessibilityRole="button"
              onPress={() => { setPreviewScenario(key); setSelected(key); setRevision((v) => v + 1); }}
              style={[styles.chip, selected === key && styles.active]}>
              <Text style={[styles.chipText, selected === key && styles.activeText]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={styles.app}>{renderApp(revision)}</View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  toolbar: { paddingTop: 8, paddingHorizontal: 10, paddingBottom: 6, backgroundColor: '#102b43', gap: 7 },
  title: { color: '#fff', fontWeight: '800', textAlign: 'right', fontSize: 13 },
  exit: { color: '#f8d78b', textAlign: 'right', textDecorationLine: 'underline', fontSize: 12 },
  scenarios: { flexDirection: 'row-reverse', gap: 5, paddingBottom: 2 },
  chip: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 9, backgroundColor: '#304e63' },
  active: { backgroundColor: '#e3f6ff' },
  chipText: { color: '#fff', fontSize: 11 },
  activeText: { color: '#164a63', fontWeight: '800' },
  app: { flex: 1 },
});
