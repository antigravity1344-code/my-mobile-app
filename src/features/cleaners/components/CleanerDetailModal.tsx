import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ban, Phone, ShieldCheck, Wallet, X } from 'lucide-react-native';
import type { CleanerProfile } from '../types/cleaner';
import { CLEANER_TIER_LABELS } from '../types/cleaner';
import { calculateTieredPrice } from '../services/cleanerPricing';
import { isCleanerCancellationAllowed } from '../services/cancellationRules';
import { CLEANER_SPECIALTY_LABELS, MARKETPLACE_BASE_PRICE } from '../utils';

interface CleanerDetailModalProps {
  cleaner: CleanerProfile | undefined;
  visible: boolean;
  onClose: () => void;
}

export const CleanerDetailModal: React.FC<CleanerDetailModalProps> = ({
  cleaner,
  visible,
  onClose,
}) => {
  if (!cleaner) return null;

  const price = calculateTieredPrice(MARKETPLACE_BASE_PRICE, cleaner.tier);
  const cleanerCanCancel = isCleanerCancellationAllowed();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#334155" />
            </Pressable>
            <Text style={styles.headerTitle}>پروفایل نظافتچی</Text>
            <View style={styles.closeBtn} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.avatar, { backgroundColor: cleaner.avatarColor }]}>
              <Text style={styles.avatarText}>{cleaner.fullName.slice(0, 1)}</Text>
            </View>
            <Text style={styles.name}>{cleaner.fullName}</Text>
            <Text style={styles.tier}>{CLEANER_TIER_LABELS[cleaner.tier]} • {cleaner.district}</Text>
            <Text style={styles.bio}>{cleaner.bio}</Text>

            <View style={styles.specialties}>
              {cleaner.specialties.map((specialty) => (
                <View key={specialty} style={styles.chip}>
                  <Text style={styles.chipText}>{CLEANER_SPECIALTY_LABELS[specialty]}</Text>
                </View>
              ))}
            </View>

            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>تعرفه سطح نسبت به معمولی</Text>
              <Text style={styles.priceValue}>
                {price.finalPrice.toLocaleString('fa-IR')} تومان
              </Text>
              <Text style={styles.priceHint}>
                افزایش {Math.round(price.upliftRate * 100).toLocaleString('fa-IR')}٪ • سهم متخصص{' '}
                {price.cleanerNetAmount.toLocaleString('fa-IR')} تومان
              </Text>
            </View>

            <View style={styles.ruleCard}>
              <ShieldCheck size={16} color="#059669" />
              <Text style={styles.ruleText}>
                بازارگاه آزاد است و انتخاب این متخصص بدون پیش‌پرداخت یا بیعانه انجام می‌شود.
              </Text>
            </View>

            <View style={styles.ruleCard}>
              <Ban size={16} color="#dc2626" />
              <Text style={styles.ruleText}>
                {cleanerCanCancel
                  ? 'لغو توسط نظافتچی فعال است.'
                  : 'دکمه لغو برای نظافتچی وجود ندارد. در ضرورت، مشتری یا مدیر اقدام می‌کند.'}
              </Text>
            </View>

            <View style={styles.ruleCard}>
              <Wallet size={16} color="#0284c7" />
              <Text style={styles.ruleText}>
                جبران خسارت زمان از دست‌رفته از صندوق مدیریت پرداخت می‌شود، نه از مشتری مستقیم.
              </Text>
            </View>

            <Pressable
              onPress={() => void Linking.openURL(`tel:${cleaner.phone}`)}
              style={styles.callBtn}
            >
              <Phone size={16} color="#fff" />
              <Text style={styles.callBtnText}>تماس با متخصص</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  name: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
  tier: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 10,
  },
  bio: {
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  specialties: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 16,
  },
  chip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  priceCard: {
    width: '100%',
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  priceLabel: {
    fontSize: 11,
    color: '#0369a1',
    textAlign: 'right',
    fontWeight: '700',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0c4a6e',
    textAlign: 'right',
    marginTop: 4,
  },
  priceHint: {
    fontSize: 11,
    color: '#0369a1',
    textAlign: 'right',
    marginTop: 4,
  },
  ruleCard: {
    width: '100%',
    flexDirection: 'row-reverse',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  ruleText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    textAlign: 'right',
    lineHeight: 18,
  },
  callBtn: {
    marginTop: 8,
    width: '100%',
    backgroundColor: '#0284c7',
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  callBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
