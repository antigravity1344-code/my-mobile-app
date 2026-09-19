import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type {
  OrderItem,
  OrderFilterTab,
  OrderSortOption,
  OrderStats,
  OrderStatus,
} from '../types/order';
import { orderService } from '../services/orderService';

interface OrdersContextValue {
  orders: OrderItem[];
  allOrders: OrderItem[];
  loading: boolean;
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
  refreshOrders: () => Promise<void>;
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
  addNewOrder: (order: OrderItem) => Promise<{ success: boolean; error?: string }>;
  updateOrderStatus: (orderId: string, status: OrderStatus, cleanerName?: string) => boolean;
}

const OrdersContext = createContext<OrdersContextValue | undefined>(undefined);

export const OrdersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allOrders, setAllOrders] = useState<OrderItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<OrderFilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOption, setSortOption] = useState<OrderSortOption>('NEWEST');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [ratingModalOrderId, setRatingModalOrderId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const [filtered, full] = await Promise.all([
        orderService.getOrders(filterTab, searchQuery, sortOption),
        orderService.getOrders('ALL', '', 'NEWEST'),
      ]);
      setOrders(filtered);
      setAllOrders(full);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterTab, searchQuery, sortOption]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const refreshOrders = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
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
      const result = await orderService.cancelOrder(orderId, reason);
      if (result.success) {
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
      const res = await orderService.addOrder(order);
      if (res.success) {
        void fetchOrders();
      }
      return res;
    },
    [fetchOrders],
  );

  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, cleanerName?: string) => {
      const ok = orderService.updateOrderStatus(orderId, status, cleanerName);
      if (ok) {
        void fetchOrders();
      }
      return ok;
    },
    [fetchOrders],
  );

  return (
    <OrdersContext.Provider
      value={{
        orders,
        allOrders,
        loading,
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
        updateOrderStatus,
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
