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
  ActivityIndicator,
} from 'react-native';
import { Phone, Sparkles, ShieldCheck } from 'lucide-react-native';
import { apiFetch } from '../../api/apiClient';

interface UserData {
  id: string;
  phone: string;
  name: string;
  avatar: string;
  role: string;
}

interface CustomerAuthScreenProps {
  onLogin: (user: UserData) => void;
}

export const CustomerAuthScreen: React.FC<CustomerAuthScreenProps> = ({ onLogin }) => {
  const [phoneNumber, setPhoneNumber] = useState('09121111111');
  const [otpCode, setOtpCode] = useState('1234');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNext = async () => {
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      setErrorMessage('لطفاً یک شماره همراه معتبر وارد فرمایید.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const res = await apiFetch('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: phoneNumber })
    });

    setLoading(false);

    if (res.success) {
      setStep(2);
    } else {
      setErrorMessage(res.message || 'خطا در ارسال کد تایید');
    }
  };

  const handleVerify = async () => {
    if (!otpCode || otpCode.trim().length !== 4) {
      setErrorMessage('لطفاً کد تایید ۴ رقمی را وارد کنید.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const res = await apiFetch('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        phone: phoneNumber,
        code: otpCode,
        role: 'CUSTOMER'
      })
    });

    setLoading(false);

    if (res.success && res.user) {
      onLogin(res.user);
    } else {
      setErrorMessage(res.message || 'کد تایید اشتباه است.');
    }
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
            <Text style={styles.brandSubtitle}>سامانه هوشمند رزرو آنلاین خدمات نظافت</Text>
          </View>
        </View>

        {/* کارت ورود */}
        <View style={styles.card}>
          <View style={styles.header}>
            <ShieldCheck size={24} color="#0284c7" />
            <Text style={styles.title}>
              {step === 1 ? 'ورود به حساب مشتری' : 'تایید شماره همراه'}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'شماره تماس خود را جهت احراز هویت وارد کنید.'
              : `کد تایید پیامک‌شده به شماره ${phoneNumber} را وارد کنید:`}
          </Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {step === 1 ? (
            <>
              {/* شماره همراه */}
              <Text style={styles.inputLabel}>شماره تلفن همراه:</Text>
              <View style={styles.inputWrapper}>
                <Phone size={18} color="#64748b" />
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholder="مثال: ۰۹۱۲۱۱۱۱۱۱۱"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <Pressable onPress={handleNext} disabled={loading} style={styles.submitButton}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>ارسال کد تایید پیامکی ←</Text>
                )}
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
                <Text style={styles.hintText}>کد تستی سرور: ۱۲۳۴</Text>
              </View>

              <Pressable onPress={handleVerify} disabled={loading} style={styles.submitButton}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>تایید نهایی و ورود به پنل مشتری</Text>
                )}
              </Pressable>

              <Pressable onPress={() => setStep(1)} style={styles.backButton}>
                <Text style={styles.backButtonText}>← تغییر شماره همراه</Text>
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
    backgroundColor: '#0284c7',
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
