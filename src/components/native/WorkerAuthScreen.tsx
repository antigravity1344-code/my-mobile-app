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
import { Phone, Briefcase, ShieldCheck } from 'lucide-react-native';
import { apiFetch } from '../../api/apiClient';
import { UserData } from '../../types/user';
import { type } from '../../theme';

interface WorkerAuthScreenProps {
  onLogin: (user: UserData, token: string) => void;
}

export const WorkerAuthScreen: React.FC<WorkerAuthScreenProps> = ({ onLogin }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

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
      setInfoMessage(res.message || 'کد تایید صادر شد.');
      setOtpCode('');
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
        role: 'WORKER'
      })
    });

    setLoading(false);

    if (res.success && res.user && typeof res.token === 'string') {
      onLogin(res.user, res.token);
    } else {
      setErrorMessage(res.message || 'کد تایید اشتباه است.');
    }
  };

  const fa = { writingDirection: 'rtl' as const, includeFontPadding: false };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* هدر برند متخصصین */}
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Briefcase size={26} color="#fff" />
          </View>
          <View>
            <Text style={[styles.brandTitle, fa]}>پاکشو متخصصین</Text>
            <Text style={[styles.brandSubtitle, fa]}>سامانه همکاران و متخصصین نظافت</Text>
          </View>
        </View>

        {/* کارت ورود */}
        <View style={styles.card}>
          <View style={styles.header}>
            <ShieldCheck size={24} color="#0284c7" />
            <Text style={[styles.title, fa]}>
              {step === 1 ? 'ورود به پنل متخصصین' : 'تایید شماره همراه'}
            </Text>
          </View>
          <Text style={[styles.subtitle, fa]}>
            {step === 1
              ? 'شماره تماس خود را جهت ورود به پنل متخصص وارد کنید.'
              : `کد تایید پیامک‌شده به شماره ${phoneNumber} را وارد کنید:`}
          </Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={[styles.errorText, fa]}>{errorMessage}</Text>
            </View>
          )}
          {infoMessage && !errorMessage ? (
            <View style={styles.hintBox}>
              <Text style={[styles.hintText, fa]}>{infoMessage}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <>
              <Text style={[styles.inputLabel, fa]}>شماره همراه متخصص:</Text>
              <View style={styles.inputWrapper}>
                <Phone size={18} color="#64748b" />
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholder="مثال: ۰۹۱۲۲۲۲۲۲۲۲"
                  placeholderTextColor="#94a3b8"
                  textAlign="right"
                />
              </View>

              <Pressable onPress={handleNext} disabled={loading} style={styles.submitButton}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.submitButtonText, fa]}>ارسال کد تایید پیامکی ←</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.inputLabel, fa]}>کد تایید ۴ رقمی:</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="numeric"
                maxLength={4}
                placeholder="کد ۴ رقمی"
                placeholderTextColor="#94a3b8"
              />

              <Pressable onPress={handleVerify} disabled={loading} style={styles.submitButton}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.submitButtonText, fa]}>تایید نهایی و ورود به پنل متخصص</Text>
                )}
              </Pressable>

              <Pressable onPress={() => setStep(1)} style={styles.backButton}>
                <Text style={[styles.backButtonText, fa]}>← تغییر شماره همراه</Text>
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
    ...type.bold,
    fontWeight: '400',
    textAlign: 'right',
    color: '#ffffff',
    fontSize: 24,
  },
  brandSubtitle: {
    ...type.regular,
    fontWeight: '400',
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
    ...type.bold,
    fontWeight: '400',
    fontSize: 17,
    color: '#0f172a',
    textAlign: 'right',
  },
  subtitle: {
    ...type.regular,
    fontWeight: '400',
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
    ...type.bold,
    fontWeight: '400',
    color: '#b91c1c',
    fontSize: 12,
    textAlign: 'right',
  },
  inputLabel: {
    ...type.bold,
    fontWeight: '400',
    fontSize: 13,
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
    minHeight: 48,
    gap: 8,
  },
  input: {
    ...type.regular,
    fontWeight: '400',
    flex: 1,
    minHeight: 44,
    color: '#0f172a',
    textAlign: 'right',
    fontSize: 14,
  },
  otpInput: {
    ...type.bold,
    fontWeight: '400',
    writingDirection: 'ltr',
    includeFontPadding: false,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#0284c7',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 52,
    textAlign: 'center',
    fontSize: 22,
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
    ...type.regular,
    fontWeight: '400',
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
  submitButton: {
    borderRadius: 16,
    minHeight: 48,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
  },
  submitButtonText: {
    ...type.bold,
    fontWeight: '400',
    color: '#ffffff',
    fontSize: 14,
  },
  backButton: {
    marginTop: 14,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    ...type.bold,
    fontWeight: '400',
    color: '#64748b',
    fontSize: 12,
  },
});
