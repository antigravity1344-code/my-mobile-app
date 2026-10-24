import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, shadowSm } from '../../theme/customerHome';
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
  const w = role === 'worker';
  return (
    <View style={[styles.container, w && workerStyles.container]}>
      <View style={[styles.toolbar, w && workerStyles.toolbar]}>
        <Text style={[styles.title, w && workerStyles.title]}>حالت پیش‌نمایش | {role === 'worker' ? 'متخصص' : 'مشتری'}</Text>
        <Pressable onPress={onExit} accessibilityRole="button">
          <Text style={[styles.exit, w && workerStyles.exit]}>خروج از پیش‌نمایش</Text>
        </Pressable>
        <ScrollView horizontal contentContainerStyle={styles.scenarios}>
          {scenarios.map(([key, label]) => (
            <Pressable key={key} accessibilityRole="button"
              onPress={() => { setPreviewScenario(key); setSelected(key); setRevision((v) => v + 1); }}
              style={[styles.chip, w && workerStyles.chip, selected === key && (w ? workerStyles.active : styles.active)]}>
              <Text style={[styles.chipText, w && workerStyles.chipText, selected === key && (w ? workerStyles.activeText : styles.activeText)]}>{label}</Text>
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

// Light theme for the worker (specialist) app only; customer look unchanged.
const workerStyles = StyleSheet.create({
  container: { backgroundColor: colors.bg },
  toolbar: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, ...shadowSm },
  title: { color: colors.text },
  exit: { color: colors.teal },
  chip: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.text },
  active: { backgroundColor: colors.teal, borderColor: colors.teal },
  activeText: { color: colors.white, fontWeight: '800' },
});
