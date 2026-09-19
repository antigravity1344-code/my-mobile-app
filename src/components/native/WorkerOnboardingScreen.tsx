import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { ShieldCheck, Clock, CheckCircle2, FileText, CreditCard, MapPin, AlertTriangle } from 'lucide-react-native';
import { apiFetch } from '../../api/apiClient';
import { UserData } from '../../types/user';

interface WorkerOnboardingScreenProps {
  user: UserData;
  onUpdateUser: (updatedUser: UserData) => void;
}

export const WorkerOnboardingScreen: React.FC<WorkerOnboardingScreenProps> = ({
  user,
  onUpdateUser,
}) => {
  const [name, setName] = useState(user.name || '');
  const [nationalId, setNationalId] = useState('');
  const [birthDate, setBirthDate] = useState('۱۳۶۸/۰۵/۱۲');
  const [address, setAddress] = useState('تهران، خیابان شریعتی، خیابان ملک');
  const [city, setCity] = useState('تهران');
  const [bankSheba, setBankSheba] = useState('IR120000000000000000000000');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // اگر مدارک ارسال شده و در انتظار بررسی است:
  if (user.status === 'PENDING_VERIFICATION') {
    const handleQuickApproveForTest = async () => {
      setLoading(true);
      const res = await apiFetch(`/admin/approve-worker/${user.id}`, { method: 'PUT' });
      setLoading(false);
      if (res.success && res.user) {
        onUpdateUser(res.user);
      }
    };

    return (
      <ScrollView contentContainerStyle={styles.statusContainer}>
        <View style={styles.statusCard}>
          <View style={styles.statusIconWrapper}>
            <Clock size={40} color="#eab308" />
          </View>
          <Text style={styles.statusTitle}>مدارک شما در انتظار بررسی قرار دارد</Text>
          <Text style={styles.statusDesc}>
            اطلاعات هویتی و مدارک شما توسط تیم پشتیبانی پاکشو در حال بررسی است. پس از تایید نهایی، پنل دریافت سفارش‌ها برای شما فعال خواهد شد.
          </Text>

          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <CheckCircle2 size={18} color="#16a34a" />
              <Text style={styles.timelineTextDone}>ثبت‌نام اولیه و ثبت شماره همراه</Text>
            </View>
            <View style={styles.timelineItem}>
              <CheckCircle2 size={18} color="#16a34a" />
              <Text style={styles.timelineTextDone}>تکمیل اطلاعات هویتی و مدارک</Text>
            </View>
            <View style={styles.timelineItem}>
              <Clock size={18} color="#eab308" />
              <Text style={styles.timelineTextActive}>بررسی مدارک توسط مدیریت (در حال انجام...)</Text>
            </View>
            <View style={styles.timelineItem}>
              <ShieldCheck size={18} color="#94a3b8" />
              <Text style={styles.timelineTextNext}>تایید نهایی و شروع کار در اپلیکیشن</Text>
            </View>
          </View>

          {/* دکمه تست تایید سریع برای توسعه‌دهنده/تست‌کننده */}
          <Pressable onPress={handleQuickApproveForTest} disabled={loading} style={styles.testApproveBtn}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.testApproveBtnText}>تایید فوری حساب متخصص (تست سریع)</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // فرم ثبت اطلاعات و ارسال مدارک هویتی
  const handleSubmitDocs = async () => {
    if (!name.trim()) {
      setErrorMsg('لطفاً نام و نام خانوادگی را وارد کنید.');
      return;
    }
    if (!nationalId.trim() || nationalId.length < 10) {
      setErrorMsg('کد ملی ۱۰ رقمی معتبر وارد کنید.');
      return;
    }
    if (!bankSheba.trim() || bankSheba.length < 15) {
      setErrorMsg('شماره شبا جهت تسویه حساب الزامی است.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const res = await apiFetch('/users/worker-onboarding', {
      method: 'PUT',
      body: JSON.stringify({
        userId: user.id,
        name,
        nationalId,
        birthDate,
        address,
        city,
        skills: ['نظافت منزل', 'نظافت راه پله'],
        bankSheba
      })
    });

    setLoading(false);

    if (res.success && res.user) {
      onUpdateUser(res.user);
    } else {
      setErrorMsg(res.message || 'خطا در ثبت مدارک.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.formCard}>
        <View style={styles.header}>
          <ShieldCheck size={26} color="#16a34a" />
          <Text style={styles.title}>ثبت‌نام و احراز هویت متخصصین</Text>
        </View>
        <Text style={styles.subtitle}>
          جهت تایید هویت و فعال‌سازی حساب کاربری متخصص، لطفاً مدارک و اطلاعات زیر را کامل فرمایید.
        </Text>

        {errorMsg && (
          <View style={styles.errorBox}>
            <AlertTriangle size={16} color="#b91c1c" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* نام و نام خانوادگی */}
        <Text style={styles.label}>نام و نام خانوادگی کامل:</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="مثال: رضا محمدی"
          placeholderTextColor="#94a3b8"
        />

        {/* کد ملی */}
        <Text style={styles.label}>کد ملی ۱۰ رقمی:</Text>
        <TextInput
          style={styles.input}
          value={nationalId}
          onChangeText={setNationalId}
          keyboardType="numeric"
          maxLength={10}
          placeholder="۰۰۱۲۳۴۵۶۷۸"
          placeholderTextColor="#94a3b8"
        />

        {/* تاریخ تولد */}
        <Text style={styles.label}>تاریخ تولد:</Text>
        <TextInput
          style={styles.input}
          value={birthDate}
          onChangeText={setBirthDate}
          placeholder="۱۳۶۸/۰۵/۱۲"
          placeholderTextColor="#94a3b8"
        />

        {/* تصویر کارت ملی/مدرک */}
        <Text style={styles.label}>تصویر کارت ملی / مدرک هویتی:</Text>
        <View style={styles.docUploadBox}>
          <FileText size={24} color="#16a34a" />
          <Text style={styles.docUploadText}>مدرک هویتی آپلود شد (تایید هویت)</Text>
        </View>

        {/* شهر و محدوده فعالیت */}
        <Text style={styles.label}>شهر و محدوده فعالیت:</Text>
        <View style={styles.inputWrapper}>
          <MapPin size={18} color="#64748b" />
          <TextInput
            style={styles.inputInner}
            value={city}
            onChangeText={setCity}
            placeholder="مثال: تهران"
            placeholderTextColor="#94a3b8"
          />
        </View>

        {/* آدرس محل سکونت */}
        <Text style={styles.label}>آدرس کامل سکونت:</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="تهران، خیابان شریعتی..."
          placeholderTextColor="#94a3b8"
        />

        {/* اطلاعات بانکی / شبا */}
        <Text style={styles.label}>شماره شبا (جهت واریز و تسویه درآمد):</Text>
        <View style={styles.inputWrapper}>
          <CreditCard size={18} color="#64748b" />
          <TextInput
            style={styles.inputInner}
            value={bankSheba}
            onChangeText={setBankSheba}
            placeholder="IR..."
            placeholderTextColor="#94a3b8"
          />
        </View>

        <Pressable onPress={handleSubmitDocs} disabled={loading} style={styles.submitBtn}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>ارسال مدارک برای بررسی و تایید ادمین ←</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  formCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    elevation: 6,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'right',
    marginBottom: 16,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    color: '#0f172a',
    textAlign: 'right',
    fontSize: 13,
    marginBottom: 14,
  },
  inputWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
    marginBottom: 14,
  },
  inputInner: {
    flex: 1,
    height: '100%',
    color: '#0f172a',
    textAlign: 'right',
    fontSize: 13,
  },
  docUploadBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  docUploadText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  statusContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    backgroundColor: '#0f172a',
  },
  statusCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    elevation: 6,
  },
  statusIconWrapper: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fef9c3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  timeline: {
    alignSelf: 'stretch',
    gap: 14,
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  timelineItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  timelineTextDone: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  timelineTextActive: {
    color: '#854d0e',
    fontSize: 12,
    fontWeight: '800',
  },
  timelineTextNext: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  testApproveBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  testApproveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
});
