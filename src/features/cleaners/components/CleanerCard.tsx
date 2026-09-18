import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MapPin, Star } from 'lucide-react-native';
import type { CleanerProfile } from '../types/cleaner';
import { CLEANER_TIER_LABELS } from '../types/cleaner';
import { calculateTieredPrice } from '../services/cleanerPricing';
import { CLEANER_SPECIALTY_LABELS, MARKETPLACE_BASE_PRICE } from '../utils';

interface CleanerCardProps {
  cleaner: CleanerProfile;
  onPressDetails: (cleaner: CleanerProfile) => void;
}

const TIER_COLORS: Record<CleanerProfile['tier'], { bg: string; border: string; text: string }> = {
  STANDARD: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' },
  MID: { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
  VIP: { bg: '#fef3c7', border: '#fde68a', text: '#b45309' },
};

export const CleanerCard: React.FC<CleanerCardProps> = ({ cleaner, onPressDetails }) => {
  const tierColor = TIER_COLORS[cleaner.tier];
  const price = calculateTieredPrice(MARKETPLACE_BASE_PRICE, cleaner.tier);

  return (
    <Pressable
      onPress={() => onPressDetails(cleaner)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.topRow}>
        <View style={[styles.avatar, { backgroundColor: cleaner.avatarColor }]}>
          <Text style={styles.avatarText}>{cleaner.fullName.slice(0, 1)}</Text>
        </View>
        <View style={styles.titleCol}>
          <Text style={styles.name}>{cleaner.fullName}</Text>
          <View style={styles.metaRow}>
            <MapPin size={12} color="#64748b" />
            <Text style={styles.district}>{cleaner.district}</Text>
          </View>
        </View>
        <View style={[styles.tierBadge, { backgroundColor: tierColor.bg, borderColor: tierColor.border }]}>
          <Text style={[styles.tierText, { color: tierColor.text }]}>
            {CLEANER_TIER_LABELS[cleaner.tier]}
          </Text>
        </View>
      </View>

      <Text style={styles.bio} numberOfLines={2}>
        {cleaner.bio}
      </Text>

      <View style={styles.specialties}>
        {cleaner.specialties.map((specialty) => (
          <View key={specialty} style={styles.chip}>
            <Text style={styles.chipText}>{CLEANER_SPECIALTY_LABELS[specialty]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <View style={styles.ratingWrap}>
          <Star size={13} color="#f59e0b" />
          <Text style={styles.rating}>{cleaner.rating.toLocaleString('fa-IR')}</Text>
          <Text style={styles.jobs}>
            ({cleaner.completedJobsCount.toLocaleString('fa-IR')} سفارش)
          </Text>
        </View>
        <Text style={styles.price}>
          از {price.finalPrice.toLocaleString('fa-IR')} تومان
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  cardPressed: {
    opacity: 0.88,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  titleCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  district: {
    fontSize: 11,
    color: '#64748b',
  },
  tierBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tierText: {
    fontSize: 11,
    fontWeight: '800',
  },
  bio: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
    lineHeight: 18,
    marginBottom: 10,
  },
  specialties: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  footer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  rating: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  jobs: {
    fontSize: 11,
    color: '#64748b',
  },
  price: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284c7',
  },
});
