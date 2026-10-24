import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import type { ApiOrder } from '../../api/types';
import { appStorage } from '../../utils/storage';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';
import { preAcceptOrderView } from './workerOrderStatus';
import {
  applyWorkerOrdersLoad,
  classifyWorkerOrdersResponse,
  shouldStartWorkerOrdersFetch,
  showsWorkerOrdersSpinner,
  type WorkerOrdersFetchMode,
  type WorkerOrdersResponse,
  type WorkerOrdersState,
} from './workerOrdersFetch';

export const WORKER_ORDERS_POLL_MS = 10000;

/**
 * بارگذاری و پولینگ سفارش‌های متخصص؛ مشترک بین خانهٔ متخصص و پنل سفارش‌ها.
 * فقط یکی از این دو صفحه در هر لحظه نصب است، پس فقط یک پولینگ فعال است.
 */
export function useWorkerOrders<T>(userId: string | undefined, mapOrder: (o: ApiOrder) => T) {
  const [ordersState, setOrdersState] = useState<WorkerOrdersState<T>>({
    available: [],
    mine: [],
    error: null,
    sessionExpired: false,
  });
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  // تعداد درخواست‌های در جریان و شماره آخرین درخواست؛ پاسخ کهنه‌تر از آخرین درخواست اعمال نمی‌شود.
  const fetchesInFlight = useRef(0);
  const latestFetchId = useRef(0);
  const sessionExpiredRef = useRef(false);
  const mapRef = useRef(mapOrder);
  mapRef.current = mapOrder;

  const fetchOrders = useCallback(async (mode: WorkerOrdersFetchMode) => {
    if (mode === 'poll' && sessionExpiredRef.current) return;
    if (!shouldStartWorkerOrdersFetch(mode, fetchesInFlight.current > 0)) return;
    const fetchId = ++latestFetchId.current;
    fetchesInFlight.current += 1;
    if (showsWorkerOrdersSpinner(mode)) setLoading(true);
    try {
      await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
      const available = classifyWorkerOrdersResponse(await apiFetch('/orders/available'));
      let mine: WorkerOrdersResponse | null = null;
      if (userId && available.kind !== 'expired' && available.kind !== 'blocked') {
        // توکن سراسری است؛ پیش از درخواست دوم دوباره توکن متخصص گذاشته می‌شود.
        await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
        mine = classifyWorkerOrdersResponse(await apiFetch('/orders'));
      }
      if (fetchId !== latestFetchId.current) return;
      const map = mapRef.current;
      // سفارش باز: نام مشتری می‌ماند؛ تلفن، یادداشت و نشانی دقیق قبل از پذیرش نمی‌ماند.
      const availableMapped: WorkerOrdersResponse =
        available.kind === 'ok'
          ? { kind: 'ok', orders: (available.orders as ApiOrder[]).map((o) => map(preAcceptOrderView(o))) }
          : available;
      const mineMapped: WorkerOrdersResponse | null =
        mine && mine.kind === 'ok' ? { kind: 'ok', orders: (mine.orders as ApiOrder[]).map((o) => map(o)) } : mine;
      setOrdersState((prev) => {
        const next = applyWorkerOrdersLoad(prev, { available: availableMapped, mine: mineMapped }, mode);
        sessionExpiredRef.current = next.sessionExpired;
        return next;
      });
      setHasLoaded(true);
    } catch (e) {
      console.warn('Error fetching worker orders', e);
    } finally {
      fetchesInFlight.current -= 1;
      if (fetchId === latestFetchId.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchOrders('initial');
    const interval = setInterval(() => void fetchOrders('poll'), WORKER_ORDERS_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  return { ordersState, loading, hasLoaded, fetchOrders };
}

export type WorkerOrdersHandle<T> = {
  ordersState: WorkerOrdersState<T>;
  loading: boolean;
  hasLoaded: boolean;
  fetchOrders: (mode: WorkerOrdersFetchMode) => Promise<void>;
};
