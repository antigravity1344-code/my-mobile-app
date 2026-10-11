import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from 'react-native';
import { Star, X, Check, Award, User } from 'lucide-react-native';
import { BottomSheetModal } from '../../../components/native/BottomSheetModal';
import type { OrderItem } from '../types/order';
import { customerTierLabel } from '../../../utils/pricing';
import { toPersianDigits } from '../../../utils/jalaliDateOptions';
import { initialRatingDraft } from './ratingDraft';
import { colors, fontFamily, ui, TOUCH_MIN } from '../../../theme';

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
  // فرم برای هر سفارش جدا ساخته می‌شود (OrdersScreen با key={order.id} آن را از نو می‌سازد).
  const [initialDraft] = useState(() => initialRatingDraft(order));
  const [selectedRating, setSelectedRating] = useState<number>(initialDraft.rating);
  const [comment, setComment] = useState<string>(initialDraft.comment);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialDraft.tags);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!order) return null;

  const alreadyRated = Boolean(order.ratings?.customerRating);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = async () => {
    if (order.ratings?.customerRating) {
      setErrorMessage('برای این سفارش قبلاً امتیاز ثبت شده است.');
      return;
    }
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
    <BottomSheetModal visible={visible} animationType="fade" onRequestClose={onClose}>
      {(bottomInset) => (
      <View style={[styles.overlay, { paddingBottom: Math.max(20, bottomInset) }]}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.muted} />
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>ثبت نظر و امتیاز</Text>
              <Text style={styles.headerSubtitle}>{order.serviceTitle}</Text>
            </View>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Cleaner Info Card */}
            {Boolean(order.cleaner) && (
              <View style={styles.cleanerCard}>
                <View style={styles.cleanerAvatar}>
                  <User size={22} color={colors.teal} />
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
                <Award size={18} color={colors.teal} />
                <View style={styles.reciprocalTextWrap}>
                  <Text style={styles.reciprocalTitle}>امتیاز متخصص به شما به عنوان مشتری:</Text>
                  <Text style={styles.reciprocalScore}>
                    {toPersianDigits(order.ratings.cleanerRating)} از ۵ ستاره • سطح مشتری: {customerTierLabel(order.customerTier) || '—'}
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
                        : selectedRating === 1
                          ? 'خیلی ضعیف'
                          : 'امتیاز خود را انتخاب کنید'}
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
                      {isSelected && <Check size={12} color={colors.teal} />}
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
              disabled={submitting || alreadyRated}
              onPress={handleSubmit}
              style={[styles.submitBtn, (submitting || alreadyRated) && styles.btnDisabled]}
            >
              <Text style={styles.submitBtnText}>
                {alreadyRated ? 'امتیاز قبلاً ثبت شده' : submitting ? 'در حال ثبت...' : 'ثبت امتیاز و نظر'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      )}
    </BottomSheetModal>
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
    borderBottomColor: ui.divider,
  },
  headerTitleWrap: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    color: colors.text,
  },
  headerSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  closeBtn: {
    minHeight: TOUCH_MIN,
    padding: 6,
    borderRadius: 8,
    backgroundColor: ui.surfaceMuted,
  },
  body: {
    padding: 18,
  },
  cleanerCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 12,
    backgroundColor: ui.surfaceMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.divider,
    marginBottom: 16,
    gap: 10,
  },
  cleanerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanerInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cleanerName: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    color: colors.text,
  },
  cleanerRole: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
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
    fontFamily: fontFamily.bold,
    color: colors.amberIcon,
  },
  reciprocalRatingBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: ui.tealBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  reciprocalTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  reciprocalTitle: {
    fontSize: 12,
    color: colors.tealDark,
    fontFamily: fontFamily.semibold,
  },
  reciprocalScore: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: colors.tealDark,
    marginTop: 2,
  },
  starsSection: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'right',
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  starsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  starTouch: {
    minHeight: TOUCH_MIN,
    padding: 4,
  },
  ratingHint: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    color: colors.amberIcon,
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
    minHeight: TOUCH_MIN,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: ui.surfaceMuted,
    borderWidth: 1,
    borderColor: ui.divider,
  },
  tagSelected: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
  },
  tagText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
  },
  tagTextSelected: {
    color: colors.tealDark,
    fontFamily: fontFamily.bold,
  },
  commentSection: {
    marginBottom: 16,
  },
  commentInput: {
    fontFamily: fontFamily.regular,
    backgroundColor: ui.surfaceMuted,
    borderWidth: 1,
    borderColor: ui.inputBorder,
    borderRadius: 14,
    padding: 12,
    fontSize: 12,
    color: colors.text,
    textAlign: 'right',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  errorText: {
    fontFamily: fontFamily.regular,
    color: ui.dangerText,
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: ui.divider,
  },
  submitBtn: {
    minHeight: TOUCH_MIN,
    backgroundColor: colors.teal,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: colors.white,
    fontSize: 13,
    fontFamily: fontFamily.bold,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
