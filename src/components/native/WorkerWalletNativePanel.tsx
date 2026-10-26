import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatStoredAmount } from '../../features/orders/services/money';
import { loadWorkerWallet, type WorkerWallet } from '../../features/worker/services/workerFinance';
import { previewActive } from './previewRuntime';
import { WORKER_MANUAL_TOPUP_HELP, WORKER_ONLINE_TOPUP_HELP, WORKER_ONLINE_TOPUP_LABEL, WORKER_WALLET_EXPLANATION } from '../../features/worker/services/workerFinanceCopy';

export const WorkerWalletNativePanel: React.FC = () => {
  const [wallet, setWallet] = useState<WorkerWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (previewActive()) { setWallet(null); setError('کیف پول واقعی در پیش‌نمایش در دسترس نیست.'); return; }
    setLoading(true); setError(null); setWallet(null);
    const result = await loadWorkerWallet();
    if (result.success) setWallet(result.value);
    else setError(result.message);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const onTopUp = () => {
    if (previewActive()) { setNotice('شارژ واقعی در پیش‌نمایش انجام نمی‌شود.'); return; }
    setNotice(wallet?.topUpAvailable ? 'پرداخت باید در درگاه تأیید شود؛ این دکمه موجودی را زیاد نمی‌کند.' : 'درگاه پرداخت هنوز متصل نیست.');
  };

  return <View style={styles.container}>
    <Text style={styles.title}>کیف پول متخصص</Text>
    <Text style={styles.note}>{WORKER_WALLET_EXPLANATION}</Text>
    <Text style={styles.note}>{WORKER_MANUAL_TOPUP_HELP}</Text>
    <Pressable onPress={onTopUp} disabled style={styles.disabledButton} accessibilityRole="button" accessibilityState={{ disabled: true }}><Text style={styles.disabledText}>{WORKER_ONLINE_TOPUP_LABEL}</Text></Pressable>
    <Text style={styles.note}>{WORKER_ONLINE_TOPUP_HELP}</Text>
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    <Pressable onPress={() => void refresh()} disabled={loading} style={styles.refresh} accessibilityRole="button"><Text style={styles.refreshText}>{loading ? 'در حال بارگیری…' : 'بازخوانی کیف پول'}</Text></Pressable>
    {loading ? <ActivityIndicator accessibilityLabel="در حال بارگیری کیف پول" /> : null}
    {error ? <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable onPress={() => void refresh()} disabled={loading} style={styles.refresh}><Text style={styles.refreshText}>تلاش دوباره</Text></Pressable></View> : null}
    {wallet ? <>
      <Text style={styles.section}>مانده‌ها</Text>
      {wallet.balances.length ? wallet.balances.map((item, index) => <View key={`${item.currencyUnit}-${index}`} style={styles.row}><Text style={styles.amount}>{formatStoredAmount(item.balance, item.currencyUnit)}</Text><Text style={styles.label}>{item.currencyUnit}</Text></View>) : <Text style={styles.note}>مانده‌ای ثبت نشده است.</Text>}
      <Text style={styles.section}>گردش کیف پول</Text>
      {wallet.transactions.length ? wallet.transactions.map(item => <View key={item.id} style={styles.transaction}>
        <View style={styles.row}><Text style={styles.amount}>{formatStoredAmount(item.amount, item.currencyUnit)}</Text><Text style={styles.label}>{item.type === 'COMMISSION' ? 'کمیسیون' : 'شارژ'}{item.orderId ? ` · سفارش ${item.orderId}` : ''}</Text></View>
        <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString('fa-IR')}</Text>
        {item.grossAmount !== null ? <Text style={styles.meta}>مبلغ کار: {formatStoredAmount(item.grossAmount, item.currencyUnit)}</Text> : null}
        {item.commissionAmount !== null ? <Text style={styles.meta}>کمیسیون: {formatStoredAmount(item.commissionAmount, item.currencyUnit)}</Text> : null}
        {item.netAmount !== null ? <Text style={styles.meta}>خالص کار: {formatStoredAmount(item.netAmount, item.currencyUnit)}</Text> : null}
        {item.ratePercent !== null ? <Text style={styles.meta}>درصد کمیسیون: {item.ratePercent}٪</Text> : null}
      </View>) : <Text style={styles.note}>تراکنشی ثبت نشده است.</Text>}
      {!wallet.canAcceptNewOrders ? <Text accessibilityRole="alert" style={styles.negative}>به‌دلیل مانده منفی، فعلاً امکان پذیرش سفارش جدید ندارید.</Text> : null}
    </> : null}
  </View>;
};

const styles = StyleSheet.create({ container: { padding: 16, gap: 10 }, title: { fontSize: 20, fontWeight: '700', textAlign: 'right', color: '#0f172a' }, note: { textAlign: 'right', color: '#475569', lineHeight: 22 }, disabledButton: { padding: 12, borderRadius: 10, backgroundColor: '#cbd5e1', alignItems: 'center' }, disabledText: { color: '#475569', fontWeight: '700' }, refresh: { padding: 10, alignItems: 'center' }, refreshText: { color: '#0369a1', fontWeight: '700' }, error: { color: '#b91c1c', textAlign: 'right' }, notice: { color: '#92400e', textAlign: 'right' }, section: { fontSize: 16, fontWeight: '700', textAlign: 'right', marginTop: 10, color: '#0f172a' }, row: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 12 }, amount: { color: '#0f172a', fontWeight: '700' }, label: { color: '#334155', textAlign: 'right', flexShrink: 1 }, transaction: { padding: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, gap: 5 }, meta: { textAlign: 'right', color: '#64748b', fontSize: 12 }, negative: { color: '#b91c1c', backgroundColor: '#fee2e2', padding: 10, borderRadius: 8, textAlign: 'right' } });
