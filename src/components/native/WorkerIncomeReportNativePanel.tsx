import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatStoredAmount } from '../../features/orders/services/money';
import { loadWorkerIncomeReport, type WorkerIncomeReport } from '../../features/worker/services/workerFinance';
import { JALALI_MONTH_NAMES, toPersianDigits } from '../../utils/jalaliDateOptions';
import { previewActive } from './previewRuntime';

function monthTitle(year: number, month: number): string {
  return `${JALALI_MONTH_NAMES[month - 1]} ${toPersianDigits(year)}`;
}

export const WorkerIncomeReportNativePanel: React.FC = () => {
  const [report, setReport] = useState<WorkerIncomeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (previewActive()) { setReport(null); setError('گزارش درآمد واقعی در پیش‌نمایش در دسترس نیست.'); return; }
    setLoading(true); setError(null); setReport(null);
    const result = await loadWorkerIncomeReport();
    if (result.success) setReport(result.value);
    else setError(result.message);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <View style={styles.container}>
    <Text style={styles.title}>گزارش ماهانه کارها</Text>
    <Text style={styles.note}>فقط کارهای پایان‌یافته با مبلغ قطعی این‌جا جمع می‌شوند: مبلغ کار، کمیسیون شرکت و سهم خالص شما. شارژ کیف پول و گردش اعتبار درآمد کاری نیست و در این گزارش نیست.</Text>
    <Pressable onPress={() => void refresh()} disabled={loading} style={styles.refresh} accessibilityRole="button"><Text style={styles.refreshText}>{loading ? 'در حال بارگیری…' : 'بازخوانی گزارش درآمد'}</Text></Pressable>
    {loading ? <ActivityIndicator accessibilityLabel="در حال بارگیری گزارش درآمد" /> : null}
    {error ? <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable onPress={() => void refresh()} disabled={loading} style={styles.refresh}><Text style={styles.refreshText}>تلاش دوباره</Text></Pressable></View> : null}
    {report ? report.months.length ? report.months.map((item) => <View key={`${item.year}-${item.month}`} style={styles.month}>
      <Text style={styles.section}>{monthTitle(item.year, item.month)}</Text>
      {item.totals.map((total) => <View key={total.currencyUnit} style={styles.card}>
        <Text style={styles.label}>{toPersianDigits(total.jobCount)} کار قطعی · {total.currencyUnit}</Text>
        <Text style={styles.meta}>مبلغ کارها: {formatStoredAmount(total.grossAmount, total.currencyUnit)}</Text>
        <Text style={styles.meta}>کمیسیون: {formatStoredAmount(total.commissionAmount, total.currencyUnit)}</Text>
        <Text style={styles.meta}>سهم خالص: {formatStoredAmount(total.netAmount, total.currencyUnit)}</Text>
      </View>)}
    </View>) : <Text style={styles.note}>هنوز کار قطعی‌شده‌ای برای گزارش ماهانه ثبت نشده است.</Text> : null}
  </View>;
};

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'right', color: '#0f172a' },
  note: { textAlign: 'right', color: '#475569', lineHeight: 22 },
  refresh: { padding: 10, alignItems: 'center' },
  refreshText: { color: '#0369a1', fontWeight: '700' },
  error: { color: '#b91c1c', textAlign: 'right' },
  month: { gap: 8 },
  section: { fontSize: 16, fontWeight: '700', textAlign: 'right', marginTop: 6, color: '#0f172a' },
  card: { padding: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, gap: 5 },
  label: { color: '#334155', textAlign: 'right' },
  meta: { textAlign: 'right', color: '#64748b', fontSize: 12 },
});
