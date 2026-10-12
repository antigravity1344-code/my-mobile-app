import React, { useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, TextInput } from 'react-native';

export type PreviewRole = 'customer' | 'worker';
type PreviewPage = 'home' | 'orders' | 'booking' | 'profile' | 'notifications' | 'support';
type PreviewStatus = 'OPEN' | 'ACCEPTED' | 'START_REQUESTED' | 'IN_PROGRESS' | 'CANCEL_REQUESTED' | 'COMPLETED' | 'CANCELLED';
const statusNames: Record<PreviewStatus, string> = {
  OPEN: 'در انتظار پذیرش متخصص',
  ACCEPTED: 'پذیرفته‌شده',
  START_REQUESTED: 'درخواست شروع کار (نمایشی)',
  IN_PROGRESS: 'در حال انجام',
  CANCEL_REQUESTED: 'درخواست لغو در حال بررسی',
  COMPLETED: 'تکمیل‌شده',
  CANCELLED: 'لغوشده',
};
const statuses: PreviewStatus[] = ['OPEN', 'ACCEPTED', 'START_REQUESTED', 'IN_PROGRESS', 'CANCEL_REQUESTED', 'COMPLETED', 'CANCELLED'];
const mock = { customer: 'مشتری آزمایشی', worker: 'متخصص آزمایشی', service: 'نظافت منزل', location: 'تهران، محله نمونه', date: '۱۴۰۵/۰۷/۲۵', time: '۹ تا ۱۲' };

/** Separate, in-memory UX sandbox: never mounts production screens/providers or invokes API methods. */
export const isUiPreviewEnabled = (): boolean =>
  __DEV__ && process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW === '1';

export function IsolatedUiPreview({ role, onExit }: { role: PreviewRole; onExit: () => void }) {
  const [page, setPage] = useState<PreviewPage>('home');
  const [status, setStatus] = useState<PreviewStatus>('OPEN');
  const [service, setService] = useState(mock.service);
  const [address, setAddress] = useState(mock.location);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState('');
  const isWorker = role === 'worker';
  const action = (value: string) => setFeedback(value + ' — فقط پیش‌نمایش؛ هیچ داده‌ای ارسال یا ذخیره نشد.');

  const navigation: Array<[PreviewPage, string]> = isWorker
    ? [['home', 'داشبورد'], ['orders', 'سفارش‌ها'], ['profile', 'پروفایل'], ['notifications', 'اعلان‌ها']]
    : [['home', 'خانه'], ['booking', 'ثبت سفارش'], ['orders', 'سفارش‌ها'], ['profile', 'پروفایل'], ['notifications', 'اعلان‌ها']];
  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <Text style={styles.headline}>پاکشو | {isWorker ? 'متخصص' : 'مشتری'}</Text>
        <Text style={styles.previewLabel}>حالت پیش‌نمایش — داده‌ها ساختگی هستند</Text>
        <Pressable accessibilityRole="button" onPress={onExit} style={styles.exit}>
          <Text style={styles.exitText}>خروج از پیش‌نمایش و بازگشت به ورود واقعی</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <View style={styles.nav}>
          {navigation.map(([key, title]) => (
            <Pressable key={key} accessibilityRole="button" onPress={() => { setPage(key); setFeedback(''); }}
              style={[styles.navButton, page === key && styles.navActive]}>
              <Text style={[styles.navText, page === key && styles.navActiveText]}>{title}</Text>
            </Pressable>
          ))}
        </View>
        {page === 'home' && <>
          <Text style={styles.title}>سلام، {isWorker ? mock.worker : mock.customer}</Text>
          <Text style={styles.caption}>{isWorker ? 'نمونه کارتابل متخصص برای بررسی طراحی' : 'نمونه صفحه اصلی مشتری برای بررسی طراحی'}</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{isWorker ? 'سفارش پیشنهادی' : 'خدمات محبوب'}</Text>
            <Text style={styles.line}>{mock.service} | {mock.location}</Text>
            <Text style={styles.line}>{mock.date} | {mock.time}</Text>
            <Pressable style={styles.primary} onPress={() => setPage(isWorker ? 'orders' : 'booking')}>
              <Text style={styles.primaryText}>{isWorker ? 'مشاهده سفارش‌ها' : 'شروع ثبت سفارش نمایشی'}</Text>
            </Pressable>
          </View>
        </>}
        {page === 'orders' && <>
          <Text style={styles.title}>{isWorker ? 'کارتابل سفارش‌ها' : 'سفارش‌های من'}</Text>
          <Text style={styles.caption}>برای دیدن هر وضعیت، یک گزینه انتخاب کنید. این وضعیت‌ها صرفاً نمونه بصری هستند.</Text>
          <View style={styles.statuses}>
            {statuses.map((value) => (
              <Pressable key={value} onPress={() => { setStatus(value); setFeedback(''); }}
                style={[styles.status, status === value && styles.statusSelected]}>
                <Text style={[styles.statusText, status === value && styles.statusSelectedText]}>{statusNames[value]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{mock.service}</Text>
            <Text style={styles.line}>{mock.date}، {mock.time}</Text>
            <Text style={styles.line}>{mock.location}</Text>
            <Text style={styles.line}>وضعیت: {statusNames[status]}</Text>
            {isWorker ? <>
              <Pressable style={styles.primary} onPress={() => action('پذیرش سفارش')}><Text style={styles.primaryText}>پذیرش نمایشی</Text></Pressable>
              <Pressable style={styles.secondary} onPress={() => action('درخواست شروع کار')}><Text style={styles.secondaryText}>اعلام شروع کار نمایشی</Text></Pressable>
              <Pressable style={styles.secondary} onPress={() => action('اتمام کار')}><Text style={styles.secondaryText}>اتمام کار نمایشی</Text></Pressable>
            </> : <>
              <Pressable style={styles.primary} onPress={() => action('تأیید شروع کار')}><Text style={styles.primaryText}>تأیید شروع کار نمایشی</Text></Pressable>
              <Pressable style={styles.secondary} onPress={() => action('رد شروع کار')}><Text style={styles.secondaryText}>رد شروع کار نمایشی</Text></Pressable>
              <Pressable style={styles.secondary} onPress={() => action('درخواست لغو')}><Text style={styles.secondaryText}>لغو نمایشی</Text></Pressable>
            </>}
          </View>
        </>}
        {page === 'booking' && !isWorker && <>
          <Text style={styles.title}>فرم سفارش آزمایشی</Text>
          <Text style={styles.caption}>مقادیر فقط در حافظه این صفحه نگه داشته می‌شوند.</Text>
          <Text style={styles.label}>نوع خدمت</Text>
          <TextInput style={styles.input} value={service} onChangeText={setService} placeholder="نوع خدمت" />
          <Text style={styles.label}>نشانی نمونه</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="نشانی" />
          <Text style={styles.label}>توضیحات</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="توضیحات سفارش" multiline />
          <View style={styles.card}><Text style={styles.cardTitle}>پیش‌نمایش خلاصه سفارش</Text>
            <Text style={styles.line}>{service || 'خدمت انتخاب نشده'}</Text>
            <Text style={styles.line}>{address || 'نشانی وارد نشده'}</Text>
            <Text style={styles.line}>زمان نمونه: {mock.date}، {mock.time}</Text>
            <Text style={styles.caption}>قیمت واقعی و پرداخت در این حالت غیرفعال است.</Text>
          </View>
          <Pressable style={styles.primary} onPress={() => action('ثبت سفارش')}><Text style={styles.primaryText}>ثبت نمایشی (بدون ارسال)</Text></Pressable>
        </>}
        {page === 'profile' && <>
          <Text style={styles.title}>پروفایل آزمایشی</Text>
          <View style={styles.card}>
            <Text style={styles.line}>نام: {isWorker ? mock.worker : mock.customer}</Text>
            <Text style={styles.line}>شماره تلفن: اطلاعات واقعی نمایش داده نمی‌شود</Text>
            <Pressable style={styles.secondary} onPress={() => action('ویرایش پروفایل')}><Text style={styles.secondaryText}>ویرایش نمایشی</Text></Pressable>
          </View>
        </>}
        {page === 'notifications' && <>
          <Text style={styles.title}>اعلان‌های آزمایشی</Text>
          <View style={styles.card}><Text style={styles.line}>یک سفارش نمونه برای بررسی تجربه کاربری آماده است.</Text></View>
        </>}
        {page === 'support' && <>
          <Text style={styles.title}>پشتیبانی آزمایشی</Text>
          <View style={styles.card}><Text style={styles.line}>این بخش نمایشی است و پیامی به پشتیبانی ارسال نمی‌کند.</Text></View>
        </>}
        {!!feedback && <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text>}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f3f7fb' },
  header: { backgroundColor: '#102b43', padding: 16, paddingTop: 22 },
  headline: { fontSize: 19, fontWeight: '800', color: '#fff', textAlign: 'right' },
  previewLabel: { fontSize: 12, color: '#f8d78b', textAlign: 'right', marginTop: 6 },
  exit: { alignSelf: 'flex-end', paddingVertical: 10, marginTop: 6 },
  exitText: { color: '#fff', textDecorationLine: 'underline', fontSize: 12 },
  body: { padding: 16, paddingBottom: 56, gap: 14 },
  nav: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  navButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 10, backgroundColor: '#fff' },
  navActive: { backgroundColor: '#0673ae', borderColor: '#0673ae' },
  navText: { color: '#243f52', fontWeight: '600', fontSize: 12 },
  navActiveText: { color: '#fff' },
  title: { fontSize: 20, fontWeight: '800', color: '#173248', textAlign: 'right' },
  caption: { color: '#5c7283', textAlign: 'right', lineHeight: 21, fontSize: 12 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 18, gap: 12, borderColor: '#e0e9ef', borderWidth: 1 },
  cardTitle: { fontWeight: '800', fontSize: 16, color: '#173248', textAlign: 'right' },
  line: { fontSize: 14, color: '#344f62', textAlign: 'right' },
  primary: { backgroundColor: '#087caf', borderRadius: 12, minHeight: 48, padding: 13, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondary: { backgroundColor: '#ecf7fc', borderRadius: 12, padding: 13, minHeight: 46, alignItems: 'center' },
  secondaryText: { color: '#126189', fontWeight: '700' },
  statuses: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7 },
  status: { backgroundColor: '#fff', borderRadius: 9, borderWidth: 1, borderColor: '#cfdde5', padding: 9 },
  statusSelected: { backgroundColor: '#d3edf9', borderColor: '#1581b3' },
  statusText: { color: '#415b6b', fontSize: 11 },
  statusSelectedText: { color: '#0a587f', fontWeight: '800' },
  label: { textAlign: 'right', color: '#344f62', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#cad7e0', backgroundColor: '#fff', borderRadius: 10, padding: 12, textAlign: 'right', color: '#233c50', minHeight: 48 },
  feedback: { padding: 14, borderRadius: 12, backgroundColor: '#e5f6e9', textAlign: 'right', color: '#196333' },
});
