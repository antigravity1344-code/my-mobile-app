import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Search,
  X,
  RotateCw,
  SlidersHorizontal,
  Wallet,
  Clock,
  CheckCircle,
  PackageCheck,
} from 'lucide-react-native';
import { useOrders } from '../hooks/useOrders';
import type { OrderItem, OrderSortOption } from '../types/order';
import { OrderFilterTabs } from './OrderFilterTabs';
import { OrderCard } from './OrderCard';
import { EmptyOrdersState } from './EmptyOrdersState';
import { formatOrderAmount } from '../services/orderService';
import { startOrderStatusWatch } from '../services/orderStatusWatch';
import { OrderDetailModal } from './OrderDetailModal';
import { OrderRatingModal } from './OrderRatingModal';
import { formatStoredAmount } from '../services/money';
import { RTL_SINGLE_LINE_INPUT } from '../../../components/native/rtlInput';
import { type } from '../../../theme';

interface OrdersScreenProps {
  onNavigateToBooking?: () => void;
  initialOrderId?: string | null;
}

const SORT_OPTIONS: { key: OrderSortOption; label: string }[] = [
  { key: 'NEWEST', label: 'جدیدترین' },
  { key: 'OLDEST', label: 'قدیمی‌ترین' },
  { key: 'PRICE_HIGH', label: 'بیشترین مبلغ' },
  { key: 'PRICE_LOW', label: 'کمترین مبلغ' },
];

export const OrdersScreen: React.FC<OrdersScreenProps> = ({ onNavigateToBooking, initialOrderId }) => {
  const {
    orders,
    loading,
    loadError,
    refreshing,
    filterTab,
    searchQuery,
    sortOption,
    stats,
    selectedOrder,
    ratingModalOrderId,
    setFilterTab,
    setSearchQuery,
    setSortOption,
    refreshOrders,
    selectOrder,
    openRatingModal,
    closeRatingModal,
    cancelOrder,
    rateOrder,
    respondToStart,
    respondToCompletion,
    allOrders,
  } = useOrders();

  const [showSortMenu, setShowSortMenu] = useState(false);

  useEffect(() => {
    if (initialOrderId) {
      selectOrder(initialOrderId);
    }
  }, [initialOrderId, selectOrder]);

  useEffect(() => {
    void refreshOrders({ silent: true });
    return startOrderStatusWatch({
      refresh: () => refreshOrders({ silent: true }),
    });
  }, [refreshOrders]);

  const activeRatingOrder = ratingModalOrderId
    ? allOrders.find((item) => item.id === ratingModalOrderId)
    : undefined;

  // true only when the detail was opened from the card's «لغو» button (opens with the cancel prompt).
  const [openWithCancel, setOpenWithCancel] = useState(false);

  const handleOpenDetail = (order: OrderItem) => {
    setOpenWithCancel(false);
    selectOrder(order.id);
  };

  const handleCloseDetail = () => {
    setOpenWithCancel(false);
    selectOrder(null);
  };

  const handleResetFilters = () => {
    setFilterTab('ALL');
    setSearchQuery('');
    setSortOption('NEWEST');
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleCol}>
          <Text style={styles.title}>سفارش‌های من</Text>
          <Text style={styles.subtitle}>
            پیگیری وضعیت زنده، مشاهده فاکتورها و بازخورد
          </Text>
        </View>
        <Pressable
          onPress={() => void refreshOrders()}
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

      <ScrollView
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Quick Stats Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
            <View style={styles.statIconWrap}>
              <PackageCheck size={16} color="#0284c7" />
            </View>
            <Text style={styles.statNumber}>{formatOrderAmount(stats.totalCount)}</Text>
            <Text style={styles.statTitle}>کل سفارش‌ها</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
            <View style={styles.statIconWrap}>
              <Clock size={16} color="#d97706" />
            </View>
            <Text style={[styles.statNumber, { color: '#b45309' }]}>
              {formatOrderAmount(stats.activeCount)}
            </Text>
            <Text style={styles.statTitle}>جاری و فعال</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
            <View style={styles.statIconWrap}>
              <CheckCircle size={16} color="#059669" />
            </View>
            <Text style={[styles.statNumber, { color: '#047857' }]}>
              {formatOrderAmount(stats.completedCount)}
            </Text>
            <Text style={styles.statTitle}>تکمیل‌شده</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
            <View style={styles.statIconWrap}>
              <Wallet size={16} color="#64748b" />
            </View>
            <Text
              style={[styles.statNumber, { fontSize: 13, color: '#334155' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {stats.spentMixed ? 'واحدها متفاوت‌اند' : formatStoredAmount(stats.totalSpent, stats.spentCurrencyUnit)}
            </Text>
            <Text style={styles.statTitle}>مجموع خرید</Text>
          </View>
        </View>

        {/* Search & Sort Row */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Search size={16} color="#94a3b8" />
            <TextInput
              {...RTL_SINGLE_LINE_INPUT}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="جستجوی خدمت، محله یا متخصص..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {Boolean(searchQuery) && (
              <Pressable onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                <X size={14} color="#64748b" />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => setShowSortMenu(!showSortMenu)}
            style={[styles.sortBtn, showSortMenu && styles.sortBtnActive]}
          >
            <SlidersHorizontal size={16} color={showSortMenu ? '#0284c7' : '#475569'} />
          </Pressable>
        </View>

        {/* Sort Chips Bar */}
        {showSortMenu && (
          <View style={styles.sortChipsWrap}>
            <Text style={styles.sortTitle}>مرتب‌سازی:</Text>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setSortOption(opt.key);
                  setShowSortMenu(false);
                }}
                style={[styles.sortChip, sortOption === opt.key && styles.sortChipActive]}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    sortOption === opt.key && styles.sortChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Filter Tabs */}
        <View style={styles.tabsWrap}>
          <OrderFilterTabs
            activeTab={filterTab}
            onTabChange={setFilterTab}
            stats={stats}
          />
        </View>

        {/* Orders List or Empty State */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.loadingText}>در حال بارگذاری سفارش‌ها...</Text>
          </View>
        ) : loadError && orders.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>{loadError}</Text>
            <Pressable onPress={() => void refreshOrders()} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryText}>تلاش دوباره</Text>
            </Pressable>
          </View>
        ) : orders.length === 0 ? (
          <EmptyOrdersState
            filterTab={filterTab}
            isSearching={Boolean(searchQuery.trim())}
            onResetFilters={handleResetFilters}
            onBookService={onNavigateToBooking}
          />
        ) : (
          <View style={styles.ordersList}>
            {orders.map((item) => (
              <OrderCard
                key={item.id}
                order={item}
                onPressDetails={handleOpenDetail}
                onPressRate={() => openRatingModal(item.id)}
                onPressCancel={(ord) => {
                  setOpenWithCancel(true);
                  selectOrder(ord.id);
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Order Detail Modal */}
      <OrderDetailModal
        key={selectedOrder?.id ?? 'no-order-detail'}
        order={selectedOrder}
        visible={Boolean(selectedOrder)}
        onClose={handleCloseDetail}
        onOpenRating={(orderId) => {
          handleCloseDetail();
          openRatingModal(orderId);
        }}
        onCancelOrder={cancelOrder}
        onRespondToStart={respondToStart}
        onRespondToCompletion={respondToCompletion}
        openCancelPrompt={openWithCancel}
      />

      {/* Order Rating Modal */}
      <OrderRatingModal
        key={activeRatingOrder?.id ?? 'no-order-rating'}
        order={activeRatingOrder}
        visible={Boolean(activeRatingOrder)}
        onClose={closeRatingModal}
        onSubmit={async (rating, comment, tags) => {
          if (!activeRatingOrder) return { success: false, error: 'سفارش انتخاب نشده' };
          if (activeRatingOrder.ratings?.customerRating) {
            return { success: false, error: 'برای این سفارش قبلاً امتیاز ثبت شده است.' };
          }
          return await rateOrder(activeRatingOrder.id, rating, comment, tags);
        }}
      />
    </View>
  );
};

const fa = { writingDirection: 'rtl' as const, includeFontPadding: false };

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
  },
  title: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    fontSize: 20,
    color: '#0f172a',
    textAlign: 'right',
  },
  subtitle: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 2,
  },
  refreshBtn: {
    width: 44,
    height: 44,
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
    justifyContent: 'center',
  },
  statIconWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  statNumber: {
    ...type.bold,
    fontWeight: '400',
    fontSize: 15,
    color: '#0284c7',
    marginBottom: 2,
    textAlign: 'center',
  },
  statTitle: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 44,
    gap: 8,
  },
  searchInput: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    flex: 1,
    fontSize: 12,
    color: '#0f172a',
    textAlign: 'right',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  sortBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortBtnActive: {
    borderColor: '#0284c7',
    backgroundColor: '#e0f2fe',
  },
  sortChipsWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  sortTitle: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    fontSize: 11,
    color: '#475569',
  },
  sortChip: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  sortChipActive: {
    backgroundColor: '#0284c7',
  },
  sortChipText: {
    ...type.regular,
    ...fa,
    fontWeight: '400',
    fontSize: 11,
    color: '#64748b',
  },
  sortChipTextActive: {
    ...type.bold,
    fontWeight: '400',
    color: '#fff',
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
    ...type.regular,
    ...fa,
    fontWeight: '400',
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  retryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryText: {
    ...type.bold,
    ...fa,
    fontWeight: '400',
    color: '#0f766e',
    textAlign: 'center',
  },
  ordersList: {
    gap: 4,
  },
});
