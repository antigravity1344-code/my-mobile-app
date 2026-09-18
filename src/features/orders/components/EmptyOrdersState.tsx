import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sparkles, Calendar, RotateCcw } from 'lucide-react-native';
import type { OrderFilterTab } from '../types/order';

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
        <Calendar size={36} color="#0284c7" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{desc}</Text>

      <View style={styles.actions}>
        {isSearching || filterTab !== 'ALL' ? (
          <Pressable onPress={onResetFilters} style={styles.resetButton}>
            <RotateCcw size={16} color="#0369a1" />
            <Text style={styles.resetButtonText}>نمایش همه سفارش‌ها</Text>
          </Pressable>
        ) : null}

        {Boolean(onBookService) && (
          <Pressable onPress={onBookService} style={styles.primaryButton}>
            <Sparkles size={16} color="#fff" />
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
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  description: {
    fontSize: 12,
    color: '#64748b',
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  primaryButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#0284c7',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
});
