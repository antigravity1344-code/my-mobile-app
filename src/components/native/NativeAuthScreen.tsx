import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { User, Briefcase, Phone, Sparkles, CheckCircle, ShieldCheck } from 'lucide-react-native';

export type UserRole = 'CUSTOMER' | 'WORKER';

interface NativeAuthScreenProps {
  onLogin: (phoneNumber: string, role: UserRole) => void;
}

export const NativeAuthScreen: React.FC<NativeAuthScreenProps> = ({ onLogin }) => {
  const [phoneNumber, setPhoneNumber] = useState('09123456789');
  const [otpCode, setOtpCode] = useState('1234');
  const [selectedRole, setSelectedRole] = useState<UserRole>('CUSTOMER');
  const [step, setStep] = useState<1 | 2>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNext = () => {
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      setErrorMessage('لطفاً یک شماره همراه معتبر وارد فرمایید.');
      return;
    }
    setErrorMessage(null);
    setStep(2);
  };

  const handleVerify = () => {
    if (otpCode.trim() !== '1234' && otpCode.trim().length !== 4) {
      setErrorMessage('کد تایید واردشده نادرست است. (کد تست: ۱۲۳۴)');
      return;
    }
    setErrorMessage(null);
    onLogin(phoneNumber, selectedRole);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* هدر برند */}
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Sparkles size={26} color="#fff" />
          </View>
          <View>
            <Text style={styles.brandTitle}>پاکشو</Text>
            <Text style={styles.brandSubtitle}>سامانه هوشمند خدمات نظافت و نیروهای تخصصی</Text>
          </View>
        </View>

        {/* کارت ورود */}
        <View style={styles.card}>
          <View style={styles.header}>
            <ShieldCheck size={24} color="#0284c7" />
            <Text style={styles.title}>
              {step === 1 ? 'ورود و انتخاب نوع کاربری' : 'تایید شماره همراه'}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'نقش خود را مشخص کنید و شماره تماس خود را وارد نمایید.'
              : `کد تایید پیامک‌شده به شماره ${phoneNumber} را وارد کنید:`}
          </Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {step === 1 ? (
            <>
              {/* انتخاب نقش */}
              <Text style={styles.inputLabel}>انتخاب نقش در سامانه:</Text>
              <View style={styles.roleContainer}>
                <Pressable
                  onPress={() => setSelectedRole('CUSTOMER')}
                  style={[
                    styles.roleCard,
                    selectedRole === 'CUSTOMER' && styles.roleCardActiveCustomer,
                  ]}
                >
                  <View
                    style={[
                      styles.roleIconBox,
                      selectedRole === 'CUSTOMER' && styles.roleIconBoxCustomer,
                    ]}
                  >
                    <User size={22} color={selectedRole === 'CUSTOMER' ? '#fff' : '#0284c7'} />
                  </View>
                  <Text
                    style={[
                      styles.roleTitle,
                      selectedRole === 'CUSTOMER' && styles.roleTitleActiveCustomer,
                    ]}
                  >
                    مشتری هستم
                  </Text>
                  <Text style={styles.roleDesc}>رزرو آنلاین و نظافت منزل، راه‌پله و ساختمان</Text>
                  {selectedRole === 'CUSTOMER' && (
                    <View style={styles.checkBadgeCustomer}>
                      <CheckCircle size={16} color="#0284c7" />
                    </View>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setSelectedRole('WORKER')}
                  style={[
                    styles.roleCard,
                    selectedRole === 'WORKER' && styles.roleCardActiveWorker,
                  ]}
                >
                  <View
                    style={[
                      styles.roleIconBox,
                      selectedRole === 'WORKER' && styles.roleIconBoxWorker,
                    ]}
                  >
                    <Briefcase size={22} color={selectedRole === 'WORKER' ? '#fff' : '#059669'} />
                  </View>
                  <Text
                    style={[
                      styles.roleTitle,
                      selectedRole === 'WORKER' && styles.roleTitleActiveWorker,
                    ]}
                  >
                    کارگر / متخصص هستم
                  </Text>
                  <Text style={styles.roleDesc}>مشاهده سفارش‌های باز، پذیرش کار و کسب درآمد</Text>
                  {selectedRole === 'WORKER' && (
                    <View style={styles.checkBadgeWorker}>
                      <CheckCircle size={16} color="#059669" />
                    </View>
                  )}
                </Pressable>
              </View>

              {/* شماره همراه */}
              <Text style={styles.inputLabel}>شماره تلفن همراه:</Text>
              <View style={styles.inputWrapper}>
                <Phone size={18} color="#64748b" />
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholder="مثال: ۰۹۱۲۳۴۵۶۷۸۹"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <Pressable
                onPress={handleNext}
                style={[
                  styles.submitButton,
                  selectedRole === 'WORKER' ? styles.submitButtonWorker : styles.submitButtonCustomer,
                ]}
              >
                <Text style={styles.submitButtonText}>
                  {selectedRole === 'WORKER'
                    ? 'ادامه و ورود به پنل کارگران ←'
                    : 'ادامه و ورود به پنل مشتریان ←'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.inputLabel}>کد تایید ۴ رقمی:</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="numeric"
                maxLength={4}
                placeholder="۱۲۳۴"
                placeholderTextColor="#94a3b8"
              />

              <View style={styles.hintBox}>
                <Text style={styles.hintText}>کد تستی سامانه: ۱۲۳۴</Text>
              </View>

              <Pressable
                onPress={handleVerify}
                style={[
                  styles.submitButton,
                  selectedRole === 'WORKER' ? styles.submitButtonWorker : styles.submitButtonCustomer,
                ]}
              >
                <Text style={styles.submitButtonText}>تایید نهایی و ورود به برنامه</Text>
              </Pressable>

              <Pressable onPress={() => setStep(1)} style={styles.backButton}>
                <Text style={styles.backButtonText}>← تغییر شماره همراه یا نقش</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  brandIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  brandTitle: {
    textAlign: 'right',
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  brandSubtitle: {
    textAlign: 'right',
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
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
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
    marginBottom: 18,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    textAlign: 'right',
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
    marginBottom: 8,
  },
  roleContainer: {
    gap: 10,
    marginBottom: 18,
  },
  roleCard: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#f8fafc',
    alignItems: 'flex-end',
    position: 'relative',
  },
  roleCardActiveCustomer: {
    borderColor: '#0284c7',
    backgroundColor: '#f0f9ff',
  },
  roleCardActiveWorker: {
    borderColor: '#059669',
    backgroundColor: '#f0fdf4',
  },
  roleIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  roleIconBoxCustomer: {
    backgroundColor: '#0284c7',
  },
  roleIconBoxWorker: {
    backgroundColor: '#059669',
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
    textAlign: 'right',
  },
  roleTitleActiveCustomer: {
    color: '#0284c7',
  },
  roleTitleActiveWorker: {
    color: '#059669',
  },
  roleDesc: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'right',
    lineHeight: 16,
  },
  checkBadgeCustomer: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  checkBadgeWorker: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  inputWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 20,
    height: 48,
    gap: 8,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#0f172a',
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
  },
  otpInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#0284c7',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 52,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 8,
    marginBottom: 12,
  },
  hintBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    marginBottom: 18,
  },
  hintText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  submitButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonCustomer: {
    backgroundColor: '#0284c7',
    shadowColor: '#0284c7',
  },
  submitButtonWorker: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  backButton: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
});
