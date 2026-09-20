import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Wallet, Crown, MapPin, Plus, Trash2, LogOut } from 'lucide-react-native';
import { useProfile } from '../context/ProfileContext';
import { NativeAddressManagerModal } from './NativeAddressManagerModal';

interface Props {
  onLogout: () => void;
}

export const NativeProfileScreen: React.FC<Props> = ({ onLogout }) => {
  const { profile, removeSavedAddress, setDefaultAddress } = useProfile();
  const [addressModalOpen, setAddressModalOpen] = useState(false);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fa-IR').format(amount) + ' تومان';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.fullName ? profile.fullName.charAt(0) : 'ک'}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.name}>{profile.fullName || 'کاربر پاکشو'}</Text>
            <Text style={styles.phone}>{profile.phoneNumber}</Text>
            <Text style={styles.userId}>شناسه: {profile.id || '—'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Crown size={16} color="#0284c7" />
            <Text style={styles.sectionTitle}>باشگاه مشتریان</Text>
          </View>
          <Text style={styles.sectionBody}>
            {profile.loyalty?.title || 'عضو جدید'} · تخفیف {profile.loyalty?.discountPercentage ?? 0}٪
          </Text>
          <Text style={styles.muted}>
            سفارش‌های تکمیل‌شده: {profile.loyalty?.completedOrdersCount ?? 0}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Wallet size={16} color="#0284c7" />
            <Text style={styles.sectionTitle}>کیف پول</Text>
          </View>
          <Text style={styles.wallet}>{formatCurrency(profile.walletBalance || 0)}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeader}>
              <MapPin size={16} color="#0284c7" />
              <Text style={styles.sectionTitle}>آدرس‌های ذخیره‌شده</Text>
            </View>
            <Pressable onPress={() => setAddressModalOpen(true)} style={styles.addBtn}>
              <Plus size={14} color="#fff" />
              <Text style={styles.addBtnText}>افزودن</Text>
            </Pressable>
          </View>

          {profile.savedAddresses.length === 0 ? (
            <Text style={styles.muted}>هنوز آدرسی ذخیره نشده است.</Text>
          ) : (
            profile.savedAddresses.map((addr) => (
              <View key={addr.id} style={[styles.addressCard, addr.isDefault && styles.addressDefault]}>
                <View style={styles.addressTop}>
                  <Text style={styles.addressTitle}>{addr.title}</Text>
                  {addr.isDefault ? <Text style={styles.defaultBadge}>پیش‌فرض</Text> : null}
                </View>
                <Text style={styles.addressLine}>{addr.district} · {addr.fullAddress}</Text>
                <Text style={styles.addressLine}>پلاک {addr.plaque}{addr.unit ? ` · واحد ${addr.unit}` : ''}</Text>
                <Text style={styles.addressLine}>{addr.recipientName} · {addr.contactPhone}</Text>
                <View style={styles.addressActions}>
                  {!addr.isDefault ? (
                    <Pressable onPress={() => setDefaultAddress(addr.id)} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>پیش‌فرض</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => removeSavedAddress(addr.id)} style={styles.dangerBtn}>
                    <Trash2 size={14} color="#b91c1c" />
                    <Text style={styles.dangerBtnText}>حذف</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <Pressable onPress={onLogout} style={styles.logoutBtn}>
          <LogOut size={16} color="#b91c1c" />
          <Text style={styles.logoutText}>خروج از حساب</Text>
        </Pressable>
      </ScrollView>

      <NativeAddressManagerModal visible={addressModalOpen} onClose={() => setAddressModalOpen(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  profileCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#0284c7', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  userMeta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  name: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  phone: { color: '#475569', fontSize: 13 },
  userId: { color: '#94a3b8', fontSize: 11 },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  sectionHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  sectionTitle: { color: '#0f172a', fontWeight: '800', fontSize: 14 },
  sectionBody: { textAlign: 'right', color: '#334155', fontSize: 13 },
  muted: { textAlign: 'right', color: '#64748b', fontSize: 12 },
  wallet: { textAlign: 'right', color: '#059669', fontWeight: '900', fontSize: 20 },
  addBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: '#0284c7', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  addressCard: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  addressDefault: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' },
  addressTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  addressTitle: { color: '#0f172a', fontWeight: '800' },
  defaultBadge: { color: '#0369a1', backgroundColor: '#e0f2fe', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontSize: 10, fontWeight: '700' },
  addressLine: { textAlign: 'right', color: '#475569', fontSize: 12 },
  addressActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 8 },
  secondaryBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#e0f2fe' },
  secondaryBtnText: { color: '#0369a1', fontWeight: '700', fontSize: 12 },
  dangerBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#fee2e2' },
  dangerBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', marginTop: 4 },
  logoutText: { color: '#b91c1c', fontWeight: '800' },
});
