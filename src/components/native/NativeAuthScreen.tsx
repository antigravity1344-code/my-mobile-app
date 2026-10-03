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
import { User, Briefcase, Phone, Sparkles, ShieldCheck } from 'lucide-react-native';
import { apiFetch } from '../../api/apiClient';

export type UserRole = 'CUSTOMER' | 'WORKER';

export interface NativeAuthUser {
  id: string;
  phone: string;
  name: string;
  avatar: string;
  role: string;
  status?: string;
  isProfileComplete?: boolean;
}

interface NativeAuthScreenProps {
  onLogin: (user: NativeAuthUser, token: string, role: UserRole) => void;
}

export const NativeAuthScreen: React.FC<NativeAuthScreenProps> = ({ onLogin }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('CUSTOMER');
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
      body: JSON.stringify({ phone: phoneNumber }),
    });
    setLoading(false);
    if (res.success) {
      setStep(2);
      setInfoMessage(res.message || 'کد تایید صادر شد.');
      setOtpCode('');
    } else {
      setErrorMessage(res.message || 'ارسال کد ناموفق بود.');
    }
  };

  const handleVerify = async () => {
    if (otpCode.trim().length !== 4) {
      setErrorMessage('کد تایید ۴ رقمی را وارد کنید.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    const res = await apiFetch('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: phoneNumber, code: otpCode, role: selectedRole }),
    });
    setLoading(false);
    if (res.success && res.user && typeof res.token === 'string') {
      onLogin(res.user, res.token, selectedRole);
    } else {
      setErrorMessage(res.message || 'کد تایید نادرست است.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Sparkles size={26} color="#fff" />
          </View>
          <View>
            <Text style={styles.brandTitle}>پاکشو</Text>
            <Text style={styles.brandSubtitle}>ورود واقعی به سرور (شبیه‌ساز وب)</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.header}>
            <ShieldCheck size={24} color="#0284c7" />
            <Text style={styles.title}>{step === 1 ? 'ورود / ثبت‌نام' : 'تایید کد'}</Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
          {infoMessage && !errorMessage ? (
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>{infoMessage}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <>
              <Text style={styles.inputLabel}>نقش</Text>
              <View style={styles.roleRow}>
                <Pressable
                  onPress={() => setSelectedRole('CUSTOMER')}
                  style={[styles.roleChip, selectedRole === 'CUSTOMER' && styles.roleChipActive]}
                >
                  <User size={14} color={selectedRole === 'CUSTOMER' ? '#fff' : '#64748b'} />
                  <Text style={[styles.roleChipText, selectedRole === 'CUSTOMER' && styles.roleChipTextActive]}>
                    مشتری
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSelectedRole('WORKER')}
                  style={[styles.roleChip, selectedRole === 'WORKER' && styles.roleChipActive]}
                >
                  <Briefcase size={14} color={selectedRole === 'WORKER' ? '#fff' : '#64748b'} />
                  <Text style={[styles.roleChipText, selectedRole === 'WORKER' && styles.roleChipTextActive]}>
                    متخصص
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.inputLabel}>شماره همراه</Text>
              <View style={styles.inputWrapper}>
                <Phone size={18} color="#64748b" />
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholder="۰۹۱۲xxxxxxx"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <Pressable onPress={() => void handleNext()} disabled={loading} style={styles.submitButton}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>ارسال کد</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.inputLabel}>کد ۴ رقمی</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="numeric"
                maxLength={4}
                placeholder="کد ۴ رقمی"
                placeholderTextColor="#94a3b8"
              />
              <Pressable onPress={() => void handleVerify()} disabled={loading} style={styles.submitButton}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>تایید و ورود</Text>}
              </Pressable>
              <Pressable onPress={() => setStep(1)} style={styles.backButton}>
                <Text style={styles.backButtonText}>تغییر شماره</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { padding: 20, gap: 16 },
  brandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 8 },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { color: '#fff', fontWeight: '900', fontSize: 20, textAlign: 'right' },
  brandSubtitle: { color: '#94a3b8', fontSize: 12, textAlign: 'right' },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  errorBox: { backgroundColor: '#450a0a', borderRadius: 10, padding: 10 },
  errorText: { color: '#fecaca', textAlign: 'right', fontSize: 12 },
  hintBox: { backgroundColor: '#082f49', borderRadius: 10, padding: 10 },
  hintText: { color: '#7dd3fc', textAlign: 'right', fontSize: 12 },
  inputLabel: { color: '#cbd5e1', textAlign: 'right', fontSize: 12, fontWeight: '700' },
  roleRow: { flexDirection: 'row-reverse', gap: 8 },
  roleChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  roleChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  roleChipText: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  roleChipTextActive: { color: '#fff' },
  inputWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  input: { flex: 1, color: '#fff', paddingVertical: 12, textAlign: 'right' },
  otpInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
  },
  submitButton: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: { color: '#fff', fontWeight: '800' },
  backButton: { alignItems: 'center', paddingVertical: 8 },
  backButtonText: { color: '#94a3b8', fontSize: 12 },
});
