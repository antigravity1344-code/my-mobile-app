import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { describeSourceIdentity } from '../../config/buildIdentity';

type IdentityRole = 'customer' | 'worker' | 'web-dashboard' | 'generic-app';
type IdentityMode = 'select' | 'real' | 'preview' | 'dashboard' | 'simulator';

export function SourceIdentityBadge({ role, mode }: { role: IdentityRole; mode: IdentityMode }) {
  const [expanded, setExpanded] = useState(false);
  const identity = describeSourceIdentity();
  const roleLabel = { customer: 'مشتری', worker: 'متخصص', 'web-dashboard': 'وب', 'generic-app': 'اپ عمومی' }[role];
  const modeLabel = { select: 'انتخاب ورود', real: 'واقعی', preview: 'پیش‌نمایش', dashboard: 'داشبورد', simulator: 'شبیه‌ساز' }[mode];
  return (
    <View style={[styles.container, { paddingBottom: 6 + (initialWindowMetrics?.insets.bottom || 0) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="جزئیات نسخه اجرا" onPress={() => setExpanded(!expanded)}>
        <Text style={styles.label}>نسخه اجرا: {roleLabel} · {modeLabel} · {identity.shortCommit} · {identity.state}</Text>
      </Pressable>
      {expanded ? <Text selectable style={styles.details}>{identity.details}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#e8edf2', paddingHorizontal: 10, paddingVertical: 6 },
  label: { color: '#334155', fontSize: 11, textAlign: 'right' },
  details: { color: '#334155', fontSize: 11, lineHeight: 18, textAlign: 'right', paddingTop: 6 },
});
