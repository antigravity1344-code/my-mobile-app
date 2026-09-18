import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RotateCw, Search, UserPlus, X } from 'lucide-react-native';
import { useCleaners } from '../hooks/useCleaners';
import { CleanerFilterTabs } from './CleanerFilterTabs';
import { CleanerCard } from './CleanerCard';
import { EmptyCleanersState } from './EmptyCleanersState';
import { CleanerDetailModal } from './CleanerDetailModal';
import { CleanerSignupModal } from './CleanerSignupModal';

export const CleanersScreen: React.FC = () => {
  const {
    cleaners,
    loading,
    refreshing,
    filterTab,
    searchQuery,
    stats,
    selectedCleaner,
    setFilterTab,
    setSearchQuery,
    refreshCleaners,
    selectCleaner,
    openSignup,
  } = useCleaners();

  const handleResetFilters = () => {
    setFilterTab('ALL');
    setSearchQuery('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleCol}>
          <Text style={styles.title}>بازارگاه نظافتچی‌ها</Text>
          <Text style={styles.subtitle}>انتخاب آزاد متخصص بدون پیش‌پرداخت و بیعانه</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={openSignup} style={styles.signupBtn}>
            <UserPlus size={16} color="#0284c7" />
          </Pressable>
          <Pressable
            onPress={() => void refreshCleaners()}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.refreshBtnPressed]}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#0284c7" />
            ) : (
              <RotateCw size={17} color="#0284c7" />
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
            <Text style={styles.statNumber}>{stats.totalCount.toLocaleString('fa-IR')}</Text>
            <Text style={styles.statTitle}>کل متخصص‌ها</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
            <Text style={[styles.statNumber, { color: '#0369a1' }]}>
              {stats.midCount.toLocaleString('fa-IR')}
            </Text>
            <Text style={styles.statTitle}>متوسط</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
            <Text style={[styles.statNumber, { color: '#b45309' }]}>
              {stats.vipCount.toLocaleString('fa-IR')}
            </Text>
            <Text style={styles.statTitle}>VIP</Text>
          </View>
        </View>

        <View style={styles.searchInputWrap}>
          <Search size={16} color="#94a3b8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="جستجوی نام، محله یا تخصص..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          {Boolean(searchQuery) && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <X size={14} color="#64748b" />
            </Pressable>
          )}
        </View>

        <View style={styles.tabsWrap}>
          <CleanerFilterTabs activeTab={filterTab} onTabChange={setFilterTab} stats={stats} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.loadingText}>در حال بارگذاری بازارگاه...</Text>
          </View>
        ) : cleaners.length === 0 ? (
          <EmptyCleanersState
            isSearching={Boolean(searchQuery.trim())}
            onResetFilters={handleResetFilters}
          />
        ) : (
          <View>
            {cleaners.map((item) => (
              <CleanerCard
                key={item.id}
                cleaner={item}
                onPressDetails={(cleaner) => selectCleaner(cleaner.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <CleanerDetailModal
        cleaner={selectedCleaner}
        visible={Boolean(selectedCleaner)}
        onClose={() => selectCleaner(null)}
      />
      <CleanerSignupModal />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitleCol: {
    alignItems: 'flex-end',
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnPressed: {
    opacity: 0.7,
  },
  signupBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0284c7',
    marginBottom: 2,
  },
  statTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  searchInputWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0f172a',
    textAlign: 'right',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  tabsWrap: {
    marginBottom: 14,
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
});
