import React, { useEffect, useState } from 'react';
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
import { X } from 'lucide-react-native';
import { BottomSheetModal } from '../../../components/native/BottomSheetModal';
import { useSheetKeyboard } from '../../../components/native/useSheetKeyboard';
import { useProfile } from '../context/ProfileContext';
import { extraAddressIsDefault } from '../mainAddress';
import { RTL_SINGLE_LINE_INPUT } from '../../../components/native/rtlInput';
import { type } from '../../../theme';
import type { SavedAddress } from '../types/profile';
import { AddressCityPicker } from '../../../components/booking/AddressCityPicker';
import { addressCityFields, type CityAddress } from '../../../api/serviceAreas';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 'main' saves the main (default) address; 'extra' adds another address. */
  mode?: 'main' | 'extra';
  /** When set (main mode), the modal is prefilled and saving replaces this address. */
  editAddress?: SavedAddress | null;
}

export const NativeAddressManagerModal: React.FC<Props> = ({ visible, onClose, mode = 'extra', editAddress = null }) => {
  const { addSavedAddress, saveMainAddress, profile } = useProfile();
  const [title, setTitle] = useState('');
  const [district, setDistrict] = useState('');
  const [cityFields, setCityFields] = useState<CityAddress>({});
  const [fullAddress, setFullAddress] = useState('');
  const [plaque, setPlaque] = useState('');
  const [unit, setUnit] = useState('');
  const [recipientName, setRecipientName] = useState(profile.fullName || '');
  const [contactPhone, setContactPhone] = useState(profile.phoneNumber || '');
  const [error, setError] = useState<string | null>(null);
  const sheetKb = useSheetKeyboard(visible);

  useEffect(() => {
    if (!visible) return;
    if (editAddress) {
      setTitle(editAddress.title || '');
      setDistrict(editAddress.district || '');
      setCityFields({ cityId: editAddress.cityId, city: editAddress.city });
      setFullAddress(editAddress.fullAddress || '');
      setPlaque(editAddress.plaque || '');
      setUnit(editAddress.unit || '');
      setRecipientName(editAddress.recipientName || '');
      setContactPhone(editAddress.contactPhone || '');
      setError(null);
    }
  }, [visible, editAddress]);

  const resetAndClose = () => {
    setTitle('');
    setDistrict('');
    setCityFields({});
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
    const fields = { title, district, fullAddress, plaque, unit, recipientName, contactPhone, ...addressCityFields(cityFields) };
    if (mode === 'main') {
      saveMainAddress(fields, editAddress?.id);
    } else {
      addSavedAddress({ ...fields, isDefault: extraAddressIsDefault(profile.savedAddresses) });
    }
    resetAndClose();
  };

  return (
    <BottomSheetModal visible={visible} onRequestClose={resetAndClose}>
      {(bottomInset) => {
      const sheetLayout = sheetKb.layout(bottomInset);
      const cardMaxHeight = sheetLayout.maxHeight(0.88);
      return (
      <KeyboardAvoidingView
        style={[styles.overlay, { paddingBottom: sheetLayout.liftBottom }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        onLayout={sheetKb.onOverlayLayout}
      >
        <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{mode === 'main' ? (editAddress ? 'ویرایش آدرس اصلی' : 'ثبت آدرس اصلی') : 'افزودن آدرس دیگر'}</Text>
            <Pressable onPress={resetAndClose} style={styles.closeBtn}>
              <X size={20} color="#64748b" />
            </Pressable>
          </View>
          <ScrollView
            ref={sheetKb.scrollRef}
            onScroll={sheetKb.onScroll}
            scrollEventThrottle={16}
            style={{ maxHeight: cardMaxHeight - 64 }}
            contentContainerStyle={[styles.body, { paddingBottom: 16 + sheetLayout.contentBottomInset }]}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <View style={styles.field}>
              <Text style={styles.label}>عنوان آدرس</Text>
              <TextInput {...RTL_SINGLE_LINE_INPUT} value={title} onChangeText={setTitle} placeholder="مثلاً خانه" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            {visible && <AddressCityPicker value={{ ...cityFields, district, fullAddress }} onSelectCity={city => {
              setCityFields({ cityId: city.id, city: city.name }); if (cityFields.cityId !== city.id) setDistrict('');
            }} onSelectDistrict={setDistrict} />}
            <View style={styles.field}>
              <Text style={styles.label}>محله</Text>
              <TextInput {...RTL_SINGLE_LINE_INPUT} value={district} onChangeText={setDistrict} placeholder="مثلاً سعادت‌آباد" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>نشانی دقیق</Text>
              <TextInput multiline value={fullAddress} onChangeText={setFullAddress} placeholder="مثلاً خیابان آزادی، کوچه ۵" placeholderTextColor="#94a3b8" style={[styles.input, styles.textArea]} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>پلاک</Text>
              <TextInput {...RTL_SINGLE_LINE_INPUT} value={plaque} onChangeText={setPlaque} placeholder="مثلاً ۱۲" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>واحد</Text>
              <TextInput {...RTL_SINGLE_LINE_INPUT} value={unit} onChangeText={setUnit} placeholder="مثلاً ۳" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>نام مشتری</Text>
              <TextInput {...RTL_SINGLE_LINE_INPUT} value={recipientName} onChangeText={setRecipientName} placeholder="مثلاً علی رضایی" placeholderTextColor="#94a3b8" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>موبایل مشتری</Text>
              <TextInput {...RTL_SINGLE_LINE_INPUT} value={contactPhone} onChangeText={setContactPhone} placeholder="مثلاً ۰۹۱۲۳۴۵۶۷۸۹" placeholderTextColor="#94a3b8" style={styles.input} keyboardType="phone-pad" />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={handleSubmit} style={styles.submit}>
              <Text style={styles.submitText}>ذخیره آدرس</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      );
      }}
    </BottomSheetModal>
  );
};

const fa = { writingDirection: 'rtl' as const, includeFontPadding: false };

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  card: { maxHeight: '92%', backgroundColor: '#f8fafc', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { ...type.bold, ...fa, fontWeight: '400', color: '#0f172a', fontSize: 16, textAlign: 'right', flex: 1 },
  closeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12 },
  field: { gap: 6 },
  label: { ...type.bold, ...fa, fontWeight: '400', textAlign: 'right', color: '#334155', fontSize: 12 },
  input: { ...type.regular, ...fa, fontWeight: '400', backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, minHeight: 44, color: '#0f172a', textAlign: 'right' },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  error: { ...type.regular, ...fa, fontWeight: '400', color: '#b91c1c', textAlign: 'right', backgroundColor: '#fee2e2', padding: 10, borderRadius: 10 },
  submit: { marginTop: 8, minHeight: 48, backgroundColor: '#0284c7', borderRadius: 13, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitText: { ...type.bold, ...fa, fontWeight: '400', color: '#fff' },
});
