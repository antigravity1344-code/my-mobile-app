import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useProfile } from '../context/ProfileContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const NativeAddressManagerModal: React.FC<Props> = ({ visible, onClose }) => {
  const { addSavedAddress, profile } = useProfile();
  const [title, setTitle] = useState('');
  const [district, setDistrict] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [plaque, setPlaque] = useState('');
  const [unit, setUnit] = useState('');
  const [recipientName, setRecipientName] = useState(profile.fullName || '');
  const [contactPhone, setContactPhone] = useState(profile.phoneNumber || '');
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setTitle('');
    setDistrict('');
    setFullAddress('');
    setPlaque('');
    setUnit('');
    setRecipientName(profile.fullName || '');
    setContactPhone(profile.phoneNumber || '');
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    if (!title || !district || !fullAddress || !plaque || !recipientName || !contactPhone) {
      setError('لطفا تمامی فیلدهای ضروری را پر کنید.');
      return;
    }
    addSavedAddress({
      title,
      district,
      fullAddress,
      plaque,
      unit,
      recipientName,
      contactPhone,
      isDefault: profile.savedAddresses.length === 0,
    });
    resetAndClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>افزودن آدرس جدید</Text>
            <Pressable onPress={resetAndClose} style={styles.closeBtn}>
              <X size={20} color="#64748b" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={styles.label}>عنوان آدرس</Text>
              <TextInput value={title} onChangeText={setTitle} placeholder="خانه" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>محله</Text>
              <TextInput value={district} onChangeText={setDistrict} placeholder="سعادت‌آباد" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>نشانی دقیق</Text>
              <TextInput value={fullAddress} onChangeText={setFullAddress} placeholder="خیابان، کوچه" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>پلاک</Text>
              <TextInput value={plaque} onChangeText={setPlaque} placeholder="۱۲" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>واحد</Text>
              <TextInput value={unit} onChangeText={setUnit} placeholder="۴" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>نام گیرنده</Text>
              <TextInput value={recipientName} onChangeText={setRecipientName} placeholder="نام و نام خانوادگی" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>موبایل</Text>
              <TextInput value={contactPhone} onChangeText={setContactPhone} placeholder="0912..." placeholderTextColor="#94a3b8" style={styles.input} keyboardType="phone-pad" />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={handleSubmit} style={styles.submit}>
              <Text style={styles.submitText}>ذخیره آدرس</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  card: { maxHeight: '92%', backgroundColor: '#f8fafc', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  closeBtn: { padding: 6 },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  field: { gap: 6 },
  label: { textAlign: 'right', color: '#334155', fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: '#0f172a', textAlign: 'right' },
  error: { color: '#b91c1c', textAlign: 'right', backgroundColor: '#fee2e2', padding: 10, borderRadius: 10 },
  submit: { marginTop: 8, backgroundColor: '#0284c7', borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800' },
});
