import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ShieldCheck, Clock, CheckCircle2, CreditCard, MapPin, AlertTriangle } from 'lucide-react-native';
import { apiFetch } from '../../api/apiClient';
import { UserData } from '../../types/user';

interface WorkerOnboardingScreenProps {
  user: UserData;
  onUpdateUser: (updatedUser: UserData) => void;
}

const MAX_ID_DOC_BYTES = 600 * 1024;

type SelectedIdDoc = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
  label: string;
};

function resolveIdDocMime(asset: {
  mimeType?: string | null;
  uri?: string;
  fileName?: string | null;
}): SelectedIdDoc['mimeType'] | null {
  const raw = String(asset.mimeType || '').toLowerCase();
  if (raw === 'image/jpg' || raw === 'image/jpeg') return 'image/jpeg';
  if (raw === 'image/png') return 'image/png';
  if (raw === 'image/webp') return 'image/webp';
  const name = `${asset.fileName || ''} ${asset.uri || ''}`.toLowerCase();
  if (name.includes('.png')) return 'image/png';
  if (name.includes('.webp')) return 'image/webp';
  if (name.includes('.jpg') || name.includes('.jpeg')) return 'image/jpeg';
  return null;
}

function base64Size(value: string) {
  const cleaned = value.replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

export const WorkerOnboardingScreen: React.FC<WorkerOnboardingScreenProps> = ({
  user,
  onUpdateUser,
}) => {
  const [name, setName] = useState(user.name || '');
  const [nationalId, setNationalId] = useState('');
  const [birthDate, setBirthDate] = useState(user.birthDate || '');
  const [address, setAddress] = useState(user.address || '');
  const [city, setCity] = useState(user.city || 'تهران');
  const [bankSheba, setBankSheba] = useState('');
  const [idDocFile, setIdDocFile] = useState<SelectedIdDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fieldY = useRef<Record<string, number>>({});

  const scrollFieldIntoView = (key: string) => {
    const y = fieldY.current[key];
    if (typeof y !== 'number' || !scrollRef.current) return;
    // کمی بالاتر از فیلد نگه دار تا زیر کیبورد نماند
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    });
  };

  // اگر مدارک ارسال شده و در انتظار بررسی است:
  if (user.status === 'PENDING_VERIFICATION') {
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
    const nationalIdDigits = nationalId
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\D/g, '');
    if (!/^\d{10}$/.test(nationalIdDigits)) {
      setErrorMsg('کد ملی باید دقیقاً ۱۰ رقم باشد.');
      return;
    }
    const shebaNormalized = bankSheba
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\s+/g, '')
      .toUpperCase();
    if (!/^IR\d{24}$/.test(shebaNormalized)) {
      setErrorMsg('شماره شبا باید با IR و ۲۴ رقم باشد (مثال: IR062960000000100324200001).');
      return;
    }
    if (!idDocFile) {
      setErrorMsg('تصویر مدرک هویتی الزامی است.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const res = await apiFetch('/users/worker-onboarding', {
      method: 'PUT',
      body: JSON.stringify({
        userId: user.id,
        name: name.trim(),
        nationalId: nationalIdDigits,
        birthDate,
        address,
        city,
        bankSheba: shebaNormalized,
        idDocFile: {
          mimeType: idDocFile.mimeType,
          data: idDocFile.data,
        },
      })
    });

    setLoading(false);

    if (res.success && res.user) {
      onUpdateUser(res.user);
    } else {
      setErrorMsg(res.message || 'خطا در ثبت مدارک.');
    }
  };

  const handlePickIdDoc = async () => {
    setErrorMsg(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMsg(
        permission.canAskAgain === false
          ? 'دسترسی گالری غیرفعال است. از تنظیمات گوشی اجازهٔ تصاویر را برای اپ متخصص فعال کنید.'
          : 'برای انتخاب مدرک، اجازهٔ دسترسی به تصاویر لازم است.'
      );
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        base64: true,
      });
    } catch {
      setErrorMsg('باز کردن گالری ممکن نشد. اگر مشکل ادامه داشت، اپ متخصص را دوباره نصب کنید.');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.toLowerCase().startsWith('image/')) {
      setIdDocFile(null);
      setErrorMsg('فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود.');
      return;
    }
    const mimeType = resolveIdDocMime(asset);
    if (!mimeType) {
      setIdDocFile(null);
      setErrorMsg('فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود.');
      return;
    }
    if (!asset.base64) {
      setIdDocFile(null);
      setErrorMsg('خواندن تصویر مدرک ممکن نشد.');
      return;
    }
    if (base64Size(asset.base64) > MAX_ID_DOC_BYTES) {
      setIdDocFile(null);
      setErrorMsg('حجم تصویر باید حداکثر ۶۰۰ کیلوبایت باشد.');
      return;
    }
    setIdDocFile({
      mimeType,
      data: asset.base64,
      label: asset.fileName || 'تصویر مدرک',
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
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
          <View
            onLayout={(e) => {
              fieldY.current.name = e.nativeEvent.layout.y;
            }}
          >
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              onFocus={() => scrollFieldIntoView('name')}
              placeholder="مثال: رضا محمدی"
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
            />
          </View>

          {/* کد ملی */}
          <Text style={styles.label}>کد ملی ۱۰ رقمی:</Text>
          <View
            onLayout={(e) => {
              fieldY.current.nationalId = e.nativeEvent.layout.y;
            }}
          >
            <TextInput
              style={styles.input}
              value={nationalId}
              onChangeText={setNationalId}
              onFocus={() => scrollFieldIntoView('nationalId')}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="۰۰۱۲۳۴۵۶۷۸"
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
            />
          </View>

          {/* تاریخ تولد */}
          <Text style={styles.label}>تاریخ تولد:</Text>
          <View
            onLayout={(e) => {
              fieldY.current.birthDate = e.nativeEvent.layout.y;
            }}
          >
            <TextInput
              style={styles.input}
              value={birthDate}
              onChangeText={setBirthDate}
              onFocus={() => scrollFieldIntoView('birthDate')}
              keyboardType="default"
              placeholder="۱۳۶۸/۰۵/۱۲"
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
            />
          </View>

          <Text style={styles.label}>تصویر مدرک هویتی:</Text>
          <Pressable onPress={handlePickIdDoc} style={styles.input}>
            <Text style={idDocFile ? styles.docPickedText : styles.docPlaceholder}>
              {idDocFile ? `انتخاب شد: ${idDocFile.label}` : 'انتخاب تصویر از گالری'}
            </Text>
          </Pressable>

          {/* شهر و محدوده فعالیت */}
          <Text style={styles.label}>شهر و محدوده فعالیت:</Text>
          <View
            style={styles.inputWrapper}
            onLayout={(e) => {
              fieldY.current.city = e.nativeEvent.layout.y;
            }}
          >
            <MapPin size={18} color="#64748b" />
            <TextInput
              style={styles.inputInner}
              value={city}
              onChangeText={setCity}
              onFocus={() => scrollFieldIntoView('city')}
              placeholder="مثال: تهران"
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
            />
          </View>

          {/* آدرس محل سکونت */}
          <Text style={styles.label}>آدرس کامل سکونت:</Text>
          <View
            onLayout={(e) => {
              fieldY.current.address = e.nativeEvent.layout.y;
            }}
          >
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              onFocus={() => scrollFieldIntoView('address')}
              placeholder="تهران، خیابان شریعتی..."
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
            />
          </View>

          {/* اطلاعات بانکی / شبا */}
          <Text style={styles.label}>شماره شبا (جهت واریز و تسویه درآمد):</Text>
          <View
            style={styles.inputWrapper}
            onLayout={(e) => {
              fieldY.current.bankSheba = e.nativeEvent.layout.y;
            }}
          >
            <CreditCard size={18} color="#64748b" />
            <TextInput
              style={styles.inputInner}
              value={bankSheba}
              onChangeText={setBankSheba}
              onFocus={() => scrollFieldIntoView('bankSheba')}
              autoCapitalize="characters"
              placeholder="IR..."
              placeholderTextColor="#94a3b8"
              returnKeyType="done"
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
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 220,
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
    justifyContent: 'center',
  },
  docPlaceholder: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'right',
  },
  docPickedText: {
    color: '#0f172a',
    fontSize: 13,
    textAlign: 'right',
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
});
