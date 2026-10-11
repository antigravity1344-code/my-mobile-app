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
import { colors, fontFamily, radius, ui, TOUCH_MIN } from '../../theme';

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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* هدر برند متخصصین */}
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Briefcase size={26} color={colors.white} />
          </View>
          <View>
            <Text style={styles.brandTitle}>پاکشو متخصصین</Text>
            <Text style={styles.brandSubtitle}>سامانه همکاران و متخصصین نظافت</Text>
          </View>
        </View>

        {/* کارت ورود */}
        <View style={styles.card}>
          <View style={styles.header}>
            <ShieldCheck size={24} color={colors.teal} />
            <Text style={styles.title}>
              {step === 1 ? 'ورود به پنل متخصصین' : 'تایید شماره همراه'}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'شماره تماس خود را جهت ورود به پنل متخصص وارد کنید.'
              : `کد تایید پیامک‌شده به شماره ${phoneNumber} را وارد کنید:`}
          </Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}
          {infoMessage && !errorMessage ? (
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>{infoMessage}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <>
              {/* شماره همراه */}
              <Text style={styles.inputLabel}>شماره همراه متخصص:</Text>
              <View style={styles.inputWrapper}>
                <Phone size={18} color={colors.muted} />
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholder="مثال: ۰۹۱۲۲۲۲۲۲۲۲"
                  placeholderTextColor={ui.placeholder}
                />
              </View>

              <Pressable onPress={handleNext} disabled={loading} style={styles.submitButton}>
                {loading ? (
                  <ActivityIndicator color={colors.white} />
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
                placeholder="کد ۴ رقمی"
                placeholderTextColor={ui.placeholder}
              />


              <Pressable onPress={handleVerify} disabled={loading} style={styles.submitButton}>
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>تایید نهایی و ورود به پنل متخصص</Text>
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
    backgroundColor: colors.bg,
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
    backgroundColor: colors.teal,
  },
  brandTitle: {
    textAlign: 'right',
    color: colors.text,
    fontSize: 24,
    fontFamily: fontFamily.bold,
  },
  brandSubtitle: {
    fontFamily: fontFamily.regular,
    textAlign: 'right',
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    borderColor: colors.border,
    borderWidth: 1,
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: radius.card,
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
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'right',
    marginBottom: 18,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: ui.dangerBg,
    borderWidth: 1,
    borderColor: ui.dangerBorder,
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    color: ui.dangerText,
    fontSize: 12,
    textAlign: 'right',
    fontFamily: fontFamily.bold,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'right',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: ui.surfaceMuted,
    borderWidth: 1,
    borderColor: ui.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 20,
    height: 48,
    gap: 8,
  },
  input: {
    flex: 1,
    height: '100%',
    color: colors.text,
    textAlign: 'right',
    fontSize: 14,
    fontFamily: fontFamily.semibold,
  },
  otpInput: {
    backgroundColor: ui.surfaceMuted,
    borderWidth: 2,
    borderColor: colors.teal,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 52,
    textAlign: 'center',
    fontSize: 22,
    fontFamily: fontFamily.bold,
    letterSpacing: 8,
    marginBottom: 12,
  },
  hintBox: {
    backgroundColor: ui.neutralBg,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    marginBottom: 18,
  },
  hintText: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fontFamily.semibold,
  },
  submitButton: {
    minHeight: TOUCH_MIN + 4,
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 14,
    fontFamily: fontFamily.bold,
  },
  backButton: {
    justifyContent: 'center',
    minHeight: TOUCH_MIN,
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fontFamily.bold,
  },
});
