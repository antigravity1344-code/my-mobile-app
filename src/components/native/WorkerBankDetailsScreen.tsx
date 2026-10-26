import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, type } from '../../theme/customerHome';
import { previewActive } from './previewRuntime';
import { bankDigits, loadBankDetails, normalizeSheba, requestBankOtp, saveBankDetails, saveBankPin, validBankPin, validBankSheba, type BankResult, type BankOtpPurpose } from './workerBankDetails';

export function WorkerBankDetailsScreen({ onBack }: { onBack: () => void }) {
  const [bank, setBank] = useState<Extract<BankResult, { ok: true }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [bankSheba, setBankSheba] = useState('');
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [repeatPin, setRepeatPin] = useState('');
  const [bankOtp, setBankOtp] = useState('');
  const [pinOtp, setPinOtp] = useState('');
  const request = useRef<AbortController | null>(null);
  const preview = previewActive();

  const clearSecrets = () => { setPin(''); setCurrentPin(''); setNewPin(''); setRepeatPin(''); setBankOtp(''); setPinOtp(''); };
  const load = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(''); setError(false);
    const result = await loadBankDetails(controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null; setBusy(false);
    if (result.ok) { setBank(result); setSessionExpired(false); }
    else { setBank(null); setMessage(result.message); setError(true); setSessionExpired(!!result.sessionExpired); }
  }, []);
  useEffect(() => {
    void load();
    return () => { request.current?.abort(); request.current = null; };
  }, [load]);

  const locked = !!bank?.bankDetails.lockedUntil && Date.parse(bank.bankDetails.lockedUntil) > Date.now();
  const enabled = !!bank && !busy && !preview && !sessionExpired && !locked;
  const runSave = async (kind: 'bank' | 'pin') => {
    if (!enabled || !bank || request.current) return;
    if (kind === 'pin' && newPin !== repeatPin) { setMessage('تکرار رمز با رمز تازه یکسان نیست.'); setError(true); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(''); setError(false);
    const expectedVersion = bank.bankDetails.version;
    const result = kind === 'bank'
      ? await saveBankDetails({ bankSheba: normalizeSheba(bankSheba), pin, expectedVersion, ...(bank.otpRequired ? { otp: bankOtp } : {}) }, controller.signal)
      : await saveBankPin({ newPin, expectedVersion, ...(bank.bankDetails.hasPin ? { currentPin } : {}), ...(bank.otpRequired ? { otp: pinOtp } : {}) }, controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    clearSecrets(); request.current = null; setBusy(false);
    if (result.ok) { setBank(result); if (kind === 'bank') setBankSheba(''); setMessage(kind === 'bank' ? 'شماره شبا ذخیره شد.' : 'رمز تغییر شبا ذخیره شد.'); }
    else { setMessage(result.message); setError(true); setSessionExpired(!!result.sessionExpired); }
  };
  const sendOtp = async (purpose: BankOtpPurpose) => {
    if (!enabled || request.current) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setMessage('');
    const result = await requestBankOtp(purpose, controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null; setBusy(false); setMessage(result.message); setError(!result.ok);
  };
  const button = (label: string, onPress: () => void, disabled: boolean) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  const secretInput = (label: string, value: string, update: (value: string) => void, maxLength = 6) => <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.muted} value={value} onChangeText={value => update(bankDigits(value))} editable={enabled} keyboardType="number-pad" secureTextEntry autoCorrect={false} maxLength={maxLength} style={styles.input} />;

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {button('بازگشت به حساب متخصص', onBack, false)}
      <Text style={styles.title}>شبا و رمز تغییر شبا</Text>
      <Text style={styles.description}>شبا برای استفاده احتمالی آینده نگهداری می‌شود. در مدل فعلی مشتری مستقیماً دستمزد را به شما می‌پردازد؛ این بخش برداشت از کیف پول نیست.</Text>
      {preview ? <Text style={styles.description}>مشاهده و ذخیره اطلاعات بانکی واقعی در پیش‌نمایش غیرفعال است.</Text> : <>
        {busy && <ActivityIndicator accessibilityLabel="در حال ارتباط با سرور" color={colors.teal} />}
        {!!message && <Text accessibilityLiveRegion="polite" style={[styles.description, error && styles.error]}>{message}</Text>}
        {button('بازخوانی اطلاعات بانکی', () => void load(), busy)}
        {sessionExpired && <Text style={styles.error}>برای ادامه از حساب خارج شوید و دوباره وارد شوید.</Text>}
        {bank && <>
          <View style={styles.card}>
            <Text style={styles.heading}>شبای ثبت‌شده</Text>
            <Text selectable style={styles.mask}>{bank.bankDetails.bankShebaMasked || 'شبای قابل نمایش ثبت نشده است.'}</Text>
            {locked && <Text style={styles.error}>تغییرات تا ساعت {new Date(bank.bankDetails.lockedUntil!).toLocaleTimeString('fa-IR')} قفل است. پس از این زمان بازخوانی کنید.</Text>}
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>{bank.bankDetails.hasPin ? 'تغییر رمز' : 'تعیین رمز اولیه'}</Text>
            <Text style={styles.description}>رمز شش‌رقمی مخصوص تغییر شباست. پس از پنج تلاش اشتباه، تغییرات برای پانزده دقیقه قفل می‌شود.</Text>
            {bank.bankDetails.hasPin && secretInput('رمز فعلی', currentPin, setCurrentPin)}
            {secretInput('رمز شش‌رقمی جدید', newPin, setNewPin)}
            {secretInput('تکرار رمز جدید', repeatPin, setRepeatPin)}
            {bank.otpRequired && <>{button('ارسال کد تأیید تغییر رمز', () => void sendOtp('bank-pin'), !enabled)}{secretInput('کد پیامکی تغییر رمز', pinOtp, setPinOtp, 4)}</>}
            {button('ذخیره رمز', () => void runSave('pin'), !enabled || !validBankPin(newPin) || newPin !== repeatPin || (bank.bankDetails.hasPin && !validBankPin(currentPin)) || (bank.otpRequired && !/^\d{4}$/.test(pinOtp)))}
            <Text style={styles.description}>رمز را فراموش کرده‌اید؟ با پشتیبانی تماس بگیرید. بازنشانی فقط پس از تطبیق مدارک هویتی توسط مدیر و ثبت دلیل انجام می‌شود؛ پیامک به‌تنهایی رمز را بازنشانی نمی‌کند.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>تغییر شماره شبا</Text>
            {!bank.bankDetails.hasPin && <Text style={styles.description}>ابتدا رمز تغییر شبا را تعیین کنید.</Text>}
            <TextInput accessibilityLabel="شماره شبای جدید" placeholder="IR و ۲۴ رقم" placeholderTextColor={colors.muted} value={bankSheba} onChangeText={value => setBankSheba(normalizeSheba(value))} editable={enabled && bank.bankDetails.hasPin} autoCapitalize="characters" autoCorrect={false} maxLength={26} style={styles.input} />
            {secretInput('رمز تغییر شبا', pin, setPin)}
            {bank.otpRequired && <>{button('ارسال کد تأیید تغییر شبا', () => void sendOtp('bank-details'), !enabled || !bank.bankDetails.hasPin)}{secretInput('کد پیامکی تغییر شبا', bankOtp, setBankOtp, 4)}</>}
            {button('ذخیره شبا', () => void runSave('bank'), !enabled || !bank.bankDetails.hasPin || !validBankSheba(normalizeSheba(bankSheba)) || !validBankPin(pin) || (bank.otpRequired && !/^\d{4}$/.test(bankOtp)))}
          </View>
        </>}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, gap: 16 },
  title: { ...type.bold, color: colors.text, fontSize: 22, textAlign: 'right' },
  heading: { ...type.bold, color: colors.text, fontSize: 18, textAlign: 'right' },
  description: { ...type.regular, color: colors.muted, textAlign: 'right', lineHeight: 24 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 20, gap: 14 },
  input: { ...type.regular, borderWidth: 1, borderColor: colors.muted, borderRadius: 10, padding: 12, color: colors.text, textAlign: 'right' },
  mask: { ...type.regular, color: colors.text, textAlign: 'left' },
  button: { padding: 12, borderRadius: 10, backgroundColor: colors.teal, alignItems: 'center' },
  buttonText: { ...type.bold, color: colors.white }, disabled: { opacity: 0.45 }, error: { color: '#b91c1c' },
});
