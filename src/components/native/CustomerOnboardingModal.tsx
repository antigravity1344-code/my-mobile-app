import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { UserCheck, MapPin } from 'lucide-react-native';
import { BottomSheetModal } from './BottomSheetModal';
import { apiFetch } from '../../api/apiClient';
import type { ApiUser } from '../../api/types';

interface CustomerOnboardingModalProps {
  visible: boolean;
  userId: string;
  onComplete: (updatedUser: ApiUser) => void;
}

type FieldKey = 'name' | 'nationalId' | 'birthDate' | 'address';

export const CustomerOnboardingModal: React.FC<CustomerOnboardingModalProps> = ({
  visible,
  userId,
  onComplete,
}) => {
  const [name, setName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<FieldKey, number>>>({});
  const focusedFieldRef = useRef<FieldKey | null>(null);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      focusedFieldRef.current = null;
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const scrollFieldIntoView = (key: FieldKey) => {
    const delay = Platform.OS === 'android' ? 120 : 60;
    setTimeout(() => {
      if (key === 'birthDate' || key === 'address') {
        scrollRef.current?.scrollToEnd({ animated: true });
        return;
      }
      const y = fieldOffsets.current[key];
      if (y == null) return;
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - 24),
        animated: true,
      });
    }, delay);
  };

  useEffect(() => {
    if (keyboardInset > 0 && focusedFieldRef.current) {
      scrollFieldIntoView(focusedFieldRef.current);
    }
  }, [keyboardInset]);

  const registerField = (key: FieldKey) => (event: LayoutChangeEvent) => {
    fieldOffsets.current[key] = event.nativeEvent.layout.y;
  };

  const handleFieldFocus = (key: FieldKey) => {
    focusedFieldRef.current = key;
    scrollFieldIntoView(key);
  };

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

  const androidKeyboardOpen = Platform.OS === 'android' && keyboardInset > 0;

  return (
    <BottomSheetModal visible={visible} onRequestClose={() => {}}>
      {(bottomInset) => (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.modalOverlay,
            { paddingBottom: Math.max(20, bottomInset) },
            androidKeyboardOpen && {
              justifyContent: 'flex-end',
              paddingBottom: Math.max(bottomInset, keyboardInset),
            },
          ]}
        >
          <View
            style={[styles.viewport, androidKeyboardOpen && styles.viewportKeyboard]}
            onLayout={(event) => {
              const nextHeight = event.nativeEvent.layout.height;
              setViewportHeight((current) => (current === nextHeight ? current : nextHeight));
            }}
          >
          <View style={[styles.modalContent, androidKeyboardOpen && styles.modalContentKeyboard, viewportHeight > 0 && { maxHeight: viewportHeight }]}>
            <ScrollView
              ref={scrollRef}
              style={viewportHeight > 0 ? { maxHeight: viewportHeight } : undefined}
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator
            >
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

              <View onLayout={registerField('name')}>
                <Text style={styles.label}>نام و نام خانوادگی:</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  onFocus={() => handleFieldFocus('name')}
                  placeholder="نام و نام خانوادگی"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="next"
                />
              </View>

              <View onLayout={registerField('nationalId')}>
                <Text style={styles.label}>کد ملی ۱۰ رقمی:</Text>
                <TextInput
                  style={styles.input}
                  value={nationalId}
                  onChangeText={setNationalId}
                  onFocus={() => handleFieldFocus('nationalId')}
                  keyboardType="numeric"
                  maxLength={10}
                  placeholder="۰۰۱۲۳۴۵۶۷۸"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="next"
                />
              </View>

              <View onLayout={registerField('birthDate')}>
                <Text style={styles.label}>تاریخ تولد:</Text>
                <TextInput
                  style={styles.input}
                  value={birthDate}
                  onChangeText={setBirthDate}
                  onFocus={() => handleFieldFocus('birthDate')}
                  placeholder="۱۳۷۰/۰۱/۰۱"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="next"
                />
              </View>

              <View onLayout={registerField('address')}>
                <Text style={styles.label}>آدرس ثبت‌شده برای خدمات:</Text>
                <View style={styles.inputWrapper}>
                  <MapPin size={18} color="#64748b" />
                  <TextInput
                    style={styles.inputInner}
                    value={address}
                    onChangeText={setAddress}
                    onFocus={() => handleFieldFocus('address')}
                    placeholder="مثال: تهران، خیابان آزادی، پلاک ۱۲"
                    placeholderTextColor="#94a3b8"
                    returnKeyType="done"
                  />
                </View>
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
        </View>
      </KeyboardAvoidingView>
      )}
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  viewport: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    justifyContent: 'center',
  },
  viewportKeyboard: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 10,
  },
  modalContentKeyboard: {
    maxHeight: '100%',
  },
  scroll: {
    padding: 20,
    flexGrow: 1,
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
