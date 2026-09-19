import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { UserCheck, MapPin } from 'lucide-react-native';
import { apiFetch } from '../../api/apiClient';

interface CustomerOnboardingModalProps {
  visible: boolean;
  userId: string;
  onComplete: (updatedUser: any) => void;
}

export const CustomerOnboardingModal: React.FC<CustomerOnboardingModalProps> = ({
  visible,
  userId,
  onComplete,
}) => {
  const [name, setName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [birthDate, setBirthDate] = useState('۱۳۷۰/۰۱/۰۱');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMsg('لطفاً نام و نام خانوادگی خود را وارد کنید.');
      return;
    }
    if (!nationalId.trim() || nationalId.length < 10) {
      setErrorMsg('لطفاً کد ملی ۱۰ رقمی معتبر وارد کنید.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const res = await apiFetch('/users/customer-profile', {
      method: 'PUT',
      body: JSON.stringify({
        userId,
        name,
        nationalId,
        birthDate,
        address
      })
    });

    setLoading(false);

    if (res.success && res.user) {
      onComplete(res.user);
    } else {
      setErrorMsg(res.message || 'خطا در ثبت اطلاعات.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.header}>
              <UserCheck size={28} color="#0284c7" />
              <Text style={styles.title}>تکمیل اطلاعات هویتی مشتری</Text>
            </View>

            <Text style={styles.subtitle}>
              جهت امنیت سفارش‌ها و ارائه خدمات بهتر، لطفاً اطلاعات اولیه خود را وارد کنید.
            </Text>

            {errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* نام و نام خانوادگی */}
            <Text style={styles.label}>نام و نام خانوادگی:</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="مثال: علی رضایی"
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
              placeholder="۱۳۷۰/۰۱/۰۱"
              placeholderTextColor="#94a3b8"
            />

            {/* آدرس اصلی */}
            <Text style={styles.label}>آدرس ثبت‌شده برای خدمات:</Text>
            <View style={styles.inputWrapper}>
              <MapPin size={18} color="#64748b" />
              <TextInput
                style={styles.inputInner}
                value={address}
                onChangeText={setAddress}
                placeholder="مثال: تهران، خیابان آزادی، پلاک ۱۲"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <Pressable onPress={handleSubmit} disabled={loading} style={styles.submitBtn}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>ثبت و تایید اطلاعات</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    elevation: 10,
  },
  scroll: {
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
    marginBottom: 20,
    lineHeight: 18,
  },
  errorBox: {
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
    textAlign: 'right',
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
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
    height: 48,
    color: '#0f172a',
    textAlign: 'right',
    fontSize: 14,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
    marginBottom: 20,
  },
  inputInner: {
    flex: 1,
    height: '100%',
    color: '#0f172a',
    textAlign: 'right',
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
