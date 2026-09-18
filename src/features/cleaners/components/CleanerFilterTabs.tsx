import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CleanerMarketplaceStats } from '../utils';
import { CLEANER_FILTER_TABS, type CleanerFilterTab } from '../utils';

interface CleanerFilterTabsProps {
  activeTab: CleanerFilterTab;
  onTabChange: (tab: CleanerFilterTab) => void;
  stats: CleanerMarketplaceStats;
}

const countForTab = (tab: CleanerFilterTab, stats: CleanerMarketplaceStats): number => {
  if (tab === 'ALL') return stats.totalCount;
  if (tab === 'STANDARD') return stats.standardCount;
  if (tab === 'MID') return stats.midCount;
  return stats.vipCount;
};

export const CleanerFilterTabs: React.FC<CleanerFilterTabsProps> = ({
  activeTab,
  onTabChange,
  stats,
}) => (
  <View style={styles.container}>
    {CLEANER_FILTER_TABS.map((tab) => {
      const isActive = activeTab === tab.key;
      return (
        <Pressable
          key={tab.key}
          onPress={() => onTabChange(tab.key)}
          style={[styles.tab, isActive && styles.tabActive]}
        >
          <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
          <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
            <Text style={[styles.countText, isActive && styles.countTextActive]}>
              {countForTab(tab.key, stats).toLocaleString('fa-IR')}
            </Text>
          </View>
        </Pressable>
      );
    })}
  </View>
);

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
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 4,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#0f172a',
  },
  countBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  countBadgeActive: {
    backgroundColor: '#e0f2fe',
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  countTextActive: {
    color: '#0284c7',
  },
});
