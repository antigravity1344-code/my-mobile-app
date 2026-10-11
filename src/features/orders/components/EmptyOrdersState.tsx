import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sparkles, Calendar, RotateCcw } from 'lucide-react-native';
import type { OrderFilterTab } from '../types/order';
import { colors, fontFamily, ui, TOUCH_MIN } from '../../../theme';

interface EmptyOrdersStateProps {
  filterTab: OrderFilterTab;
  isSearching: boolean;
  onResetFilters: () => void;
  onBookService?: () => void;
}

export const EmptyOrdersState: React.FC<EmptyOrdersStateProps> = ({
  filterTab,
  isSearching,
  onResetFilters,
  onBookService,
}) => {
  const getMessage = () => {
    if (isSearching) {
      return {
        title: 'سفارشی با این مشخصات یافت نشد',
        desc: 'لطفاً عبارت جستجو را تغییر دهید یا فیلترها را بازنشانی کنید.',
      };
    }
    switch (filterTab) {
      case 'ACTIVE':
        return {
          title: 'سفارش جاری ندارید',
          desc: 'شما در حال حاضر هیچ سفارش فعال یا در دست اجرایی ندارید.',
        };
      case 'COMPLETED':
        return {
          title: 'سفارش تکمیل‌شده‌ای ثبت نشده است',
          desc: 'سفارش‌هایی که با موفقیت پایان یافته باشند اینجا نمایش داده می‌شوند.',
        };
      case 'CANCELLED':
        return {
          title: 'سفارش لغوشده‌ای ندارید',
          desc: 'سفارش‌های لغو شده در این بخش قرار می‌گیرند.',
        };
      default:
        return {
          title: 'هنوز هیچ سفارشی ثبت نکرده‌اید',
          desc: 'با رزرو اولین سرویس نظافت پاکشو، از خدمات حرفه‌ای ما بهره‌مند شوید.',
        };
    }
  };

  const { title, desc } = getMessage();

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Calendar size={36} color={colors.teal} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{desc}</Text>

      <View style={styles.actions}>
        {isSearching || filterTab !== 'ALL' ? (
          <Pressable onPress={onResetFilters} style={styles.resetButton}>
            <RotateCcw size={16} color={colors.tealDark} />
            <Text style={styles.resetButtonText}>نمایش همه سفارش‌ها</Text>
          </Pressable>
        ) : null}

        {Boolean(onBookService) && (
          <Pressable onPress={onBookService} style={styles.primaryButton}>
            <Sparkles size={16} color={colors.white} />
            <Text style={styles.primaryButtonText}>رزرو سرویس جدید</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginVertical: 24,
    backgroundColor: colors.bg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.divider,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: 20,
  },
  actions: {
    gap: 10,
    width: '100%',
    maxWidth: 240,
  },
  resetButton: {
    minHeight: TOUCH_MIN,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: ui.tealBorder,
  },
  resetButtonText: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: colors.tealDark,
  },
  primaryButton: {
    minHeight: TOUCH_MIN,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.teal,
  },
  primaryButtonText: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
