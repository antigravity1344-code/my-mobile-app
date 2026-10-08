import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type {
  OrderItem,
  OrderFilterTab,
  OrderSortOption,
  OrderStats,
} from '../types/order';
import { orderService } from '../services/orderService';
import { applyOrdersFetch, shouldStartOrdersRefresh } from '../services/ordersFetch';
import { createLatestRequestGuard } from '../services/orderStatusWatch';
import { selectCustomerOrders } from '../services/orderPayload';
import { appStorage } from '../../../utils/storage';

const CUSTOMER_USER_STORAGE_KEY = 'PAKSHO_USER_CUSTOMER';

async function resolveCustomerUserId(): Promise<string> {
  const savedUserStr = await appStorage.getItem<string>(CUSTOMER_USER_STORAGE_KEY, '');
  if (!savedUserStr) {
    return '';
  }
  try {
    const parsed = JSON.parse(savedUserStr) as { id?: unknown };
    return typeof parsed?.id === 'string' ? parsed.id.trim() : '';
  } catch {
    return '';
  }
}


interface OrdersContextValue {
  orders: OrderItem[];
  allOrders: OrderItem[];
  loading: boolean;
  loadError: string | null;
  refreshing: boolean;
  filterTab: OrderFilterTab;
  searchQuery: string;
  sortOption: OrderSortOption;
  stats: OrderStats;
  selectedOrderId: string | null;
  selectedOrder: OrderItem | undefined;
  ratingModalOrderId: string | null;
  setFilterTab: (tab: OrderFilterTab) => void;
  setSearchQuery: (query: string) => void;
  setSortOption: (sort: OrderSortOption) => void;
  refreshOrders: (options?: { silent?: boolean }) => Promise<void>;
  selectOrder: (orderId: string | null) => void;
  openRatingModal: (orderId: string) => void;
  closeRatingModal: () => void;
  cancelOrder: (orderId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  rateOrder: (
    orderId: string,
    rating: number,
    comment?: string,
    tags?: string[],
  ) => Promise<{ success: boolean; error?: string }>;
  addNewOrder: (order: OrderItem) => Promise<{ success: boolean; error?: string; order?: OrderItem }>;
}

const OrdersContext = createContext<OrdersContextValue | undefined>(undefined);

export const OrdersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allOrders, setAllOrders] = useState<OrderItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<OrderFilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOption, setSortOption] = useState<OrderSortOption>('NEWEST');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [ratingModalOrderId, setRatingModalOrderId] = useState<string | null>(null);

  const requestGuard = useRef(createLatestRequestGuard());
  const inFlightCount = useRef(0);
  const loadErrorRef = useRef<string | null>(null);
  const allOrdersRef = useRef<OrderItem[]>([]);

  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    const isCurrent = requestGuard.current();
    inFlightCount.current += 1;
    try {
      const userId = await resolveCustomerUserId();
      const loaded = await orderService.getOrders('ALL', '', 'NEWEST', userId);
      const next = applyOrdersFetch(
        { loadError: loadErrorRef.current, orders: allOrdersRef.current },
        {
          isCurrent: isCurrent(),
          silent: Boolean(options?.silent),
          error: loaded.error,
          orders: loaded.orders,
        },
      );
      if (!isCurrent()) return;
      const ordersChanged = next.orders !== allOrdersRef.current;
      const errorChanged = next.loadError !== loadErrorRef.current;
      loadErrorRef.current = next.loadError;
      allOrdersRef.current = next.orders;
      if (errorChanged) setLoadError(next.loadError);
      if (ordersChanged) {
        setAllOrders(next.orders);
        setOrders(selectCustomerOrders(next.orders, filterTab, searchQuery, sortOption));
      }
    } finally {
      inFlightCount.current = Math.max(0, inFlightCount.current - 1);
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filterTab, searchQuery, sortOption]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const refreshOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (!shouldStartOrdersRefresh(Boolean(options?.silent), inFlightCount.current > 0)) return;
    if (!options?.silent) setRefreshing(true);
    await fetchOrders(options);
  }, [fetchOrders]);

  const stats = useMemo(() => orderService.calculateStats(allOrders), [allOrders]);

  const selectedOrder = useMemo(
    () => (selectedOrderId ? allOrders.find((item) => item.id === selectedOrderId) : undefined),
    [selectedOrderId, allOrders],
  );

  const selectOrder = useCallback((orderId: string | null) => {
    setSelectedOrderId(orderId);
  }, []);

  const openRatingModal = useCallback((orderId: string) => {
    setRatingModalOrderId(orderId);
  }, []);

  const closeRatingModal = useCallback(() => {
    setRatingModalOrderId(null);
  }, []);

  const cancelOrder = useCallback(
    async (orderId: string, reason?: string) => {
      const userId = await resolveCustomerUserId();
      const result = await orderService.cancelOrder(orderId, reason, userId);
      if (result.success && result.order) {
        // Patch local state immediately so UI shows CANCELLED even if refetch fails/stale-guards.
        setAllOrders((prev) => {
          const next = prev.map((item) =>
            item.id === orderId ? { ...item, ...result.order!, status: 'CANCELLED' as const } : item,
          );
          allOrdersRef.current = next;
          return next;
        });
        setOrders((prev) =>
          prev.map((item) =>
            item.id === orderId ? { ...item, ...result.order!, status: 'CANCELLED' as const } : item,
          ),
        );
        // Sync remaining list from server (optional; local CANCELLED already applied).
        await fetchOrders();
      }
      return result;
    },
    [fetchOrders],
  );

  const rateOrder = useCallback(
    async (orderId: string, rating: number, comment?: string, tags?: string[]) => {
      const result = await orderService.rateOrder(orderId, rating, comment, tags);
      if (result.success) {
        await fetchOrders();
        closeRatingModal();
      }
      return result;
    },
    [fetchOrders, closeRatingModal],
  );

  const addNewOrder = useCallback(
    async (order: OrderItem) => {
      const userId = await resolveCustomerUserId();
      if (!userId) {
        return {
          success: false,
          error: 'برای ثبت سفارش، لطفاً دوباره وارد حساب خود شوید.',
        };
      }

      const res = await orderService.addOrder(order, userId);
      if (res.success) {
        void fetchOrders();
      }
      return res;
    },
    [fetchOrders],
  );

  return (
    <OrdersContext.Provider
      value={{
        orders,
        allOrders,
        loading,
        loadError,
        refreshing,
        filterTab,
        searchQuery,
        sortOption,
        stats,
        selectedOrderId,
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
        addNewOrder,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
};

export const useOrders = (): OrdersContextValue => {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
};
