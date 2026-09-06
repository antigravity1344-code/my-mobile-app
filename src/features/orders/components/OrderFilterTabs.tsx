import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OrderFilterTab, OrderStats } from '../types/order';

interface OrderFilterTabsProps {
  activeTab: OrderFilterTab;
  onTabChange: (tab: OrderFilterTab) => void;
  stats: OrderStats;
}

interface TabOption {
  key: OrderFilterTab;
  label: string;
  getCount: (stats: OrderStats) => number;
}

const TABS: TabOption[] = [
  { key: 'ALL', label: 'همه', getCount: (s) => s.totalCount },
  { key: 'ACTIVE', label: 'جاری', getCount: (s) => s.activeCount },
  { key: 'COMPLETED', label: 'تکمیل‌شده', getCount: (s) => s.completedCount },
  { key: 'CANCELLED', label: 'لغو شده', getCount: (s) => s.cancelledCount },
];

export const OrderFilterTabs: React.FC<OrderFilterTabsProps> = ({
  activeTab,
  onTabChange,
  stats,
}) => {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const count = tab.getCount(stats);

        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
              {tab.label}
            </Text>
            <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
              <Text style={[styles.countText, isActive && styles.countTextActive]}>
                {count.toLocaleString('fa-IR')}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#0284c7',
    fontWeight: '800',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  countBadgeActive: {
    backgroundColor: '#e0f2fe',
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  countTextActive: {
    color: '#0369a1',
  },
});
