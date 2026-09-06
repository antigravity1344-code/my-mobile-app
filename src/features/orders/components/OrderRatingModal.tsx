import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from 'react-native';
import { Star, X, Check, Award, User } from 'lucide-react-native';
import type { OrderItem } from '../types/order';

interface OrderRatingModalProps {
  order: OrderItem | undefined;
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment?: string, tags?: string[]) => Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_TAGS = [
  'وقت‌شناس',
  'کیفیت عالی',
  'خوش‌برخورد',
  'استفاده از تجهیزات کامل',
  'رعایت نظافت فردی',
  'دقت بالا در شستشو',
];

export const OrderRatingModal: React.FC<OrderRatingModalProps> = ({
  order,
  visible,
  onClose,
  onSubmit,
}) => {
  const [selectedRating, setSelectedRating] = useState<number>(
    order?.ratings?.customerRating || 5,
  );
  const [comment, setComment] = useState<string>(
    order?.ratings?.customerComment || '',
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    order?.ratings?.customerTags || ['کیفیت عالی', 'وقت‌شناس'],
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!order) return null;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = async () => {
    if (selectedRating < 1) {
      setErrorMessage('لطفاً امتیاز خود را از ۱ تا ۵ ستاره مشخص کنید.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await onSubmit(selectedRating, comment.trim() || undefined, selectedTags);
      if (!res.success) {
        setErrorMessage(res.error || 'ثبت نظر انجام نشد.');
      }
    } catch {
      setErrorMessage('خطا در برقراری ارتباط.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748b" />
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>ثبت نظر و امتیاز</Text>
              <Text style={styles.headerSubtitle}>{order.orderNumber}</Text>
            </View>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Cleaner Info Card */}
            {Boolean(order.cleaner) && (
              <View style={styles.cleanerCard}>
                <View style={styles.cleanerAvatar}>
                  <User size={22} color="#0284c7" />
                </View>
                <View style={styles.cleanerInfo}>
                  <Text style={styles.cleanerName}>{order.cleaner?.name}</Text>
                  <Text style={styles.cleanerRole}>متخصص اعزامی • {order.serviceTitle}</Text>
                </View>
                <View style={styles.ratingBadge}>
                  <Star size={13} color="#f59e0b" fill="#f59e0b" />
                  <Text style={styles.ratingBadgeText}>{order.cleaner?.rating}</Text>
                </View>
              </View>
            )}

            {/* Two-way Rating Badge (Cleaner Rating to Customer) */}
            {order.ratings?.cleanerRating ? (
              <View style={styles.reciprocalRatingBox}>
                <Award size={18} color="#059669" />
                <View style={styles.reciprocalTextWrap}>
                  <Text style={styles.reciprocalTitle}>امتیاز متخصص به شما به عنوان مشتری:</Text>
                  <Text style={styles.reciprocalScore}>
                    {order.ratings.cleanerRating} از ۵ ستاره • سطح مشتری: {order.customerTier}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Interactive Stars */}
            <View style={styles.starsSection}>
              <Text style={styles.sectionLabel}>به کیفیت این سفارش چه امتیازی می‌دهید؟</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => setSelectedRating(star)}
                    style={styles.starTouch}
                  >
                    <Star
                      size={32}
                      color={star <= selectedRating ? '#f59e0b' : '#cbd5e1'}
                      fill={star <= selectedRating ? '#f59e0b' : 'transparent'}
                    />
                  </Pressable>
                ))}
              </View>
              <Text style={styles.ratingHint}>
                {selectedRating === 5
                  ? 'عالی و بی‌نقص'
                  : selectedRating === 4
                    ? 'خوب و رضایت‌بخش'
                    : selectedRating === 3
                      ? 'معمولی'
                      : selectedRating === 2
                        ? 'ضعیف'
                        : 'خیلی ضعیف'}
              </Text>
            </View>

            {/* Quick Feedback Tags */}
            <View style={styles.tagsSection}>
              <Text style={styles.sectionLabel}>نقاط قوت کارشناس را انتخاب کنید:</Text>
              <View style={styles.tagsRow}>
                {DEFAULT_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => toggleTag(tag)}
                      style={[styles.tag, isSelected && styles.tagSelected]}
                    >
                      <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>
                        {tag}
                      </Text>
                      {isSelected && <Check size={12} color="#0284c7" />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Comment Area */}
            <View style={styles.commentSection}>
              <Text style={styles.sectionLabel}>توضیحات تکمیلی (اختیاری):</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="نظر خود را درباره نحوه انجام نظافت، برخورد متخصص و..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                style={styles.commentInput}
              />
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <Pressable
              disabled={submitting}
              onPress={handleSubmit}
              style={[styles.submitBtn, submitting && styles.btnDisabled]}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? 'در حال ثبت...' : 'ثبت امتیاز و نظر'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 24,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitleWrap: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  body: {
    padding: 18,
  },
  cleanerCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    gap: 10,
  },
  cleanerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanerInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cleanerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  cleanerRole: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  ratingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d97706',
  },
  reciprocalRatingBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  reciprocalTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  reciprocalTitle: {
    fontSize: 11,
    color: '#065f46',
    fontWeight: '600',
  },
  reciprocalScore: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
    marginTop: 2,
  },
  starsSection: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  starsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  starTouch: {
    padding: 4,
  },
  ratingHint: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d97706',
    marginTop: 4,
  },
  tagsSection: {
    marginBottom: 18,
  },
  tagsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tagSelected: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  tagText: {
    fontSize: 11,
    color: '#475569',
  },
  tagTextSelected: {
    color: '#0369a1',
    fontWeight: '700',
  },
  commentSection: {
    marginBottom: 16,
  },
  commentInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    padding: 12,
    fontSize: 12,
    color: '#0f172a',
    textAlign: 'right',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 11,
    textAlign: 'right',
    marginBottom: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  submitBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
