export type OrdersFetchState<T> = {
  loadError: string | null;
  orders: T[];
};

export type OrdersFetchResult<T> = {
  isCurrent: boolean;
  silent: boolean;
  error: string | null;
  orders: T[];
};

/** Apply one fetch's own result. A stale call leaves the current list and error untouched. */
export function applyOrdersFetch<T>(
  state: OrdersFetchState<T>,
  result: OrdersFetchResult<T>,
): OrdersFetchState<T> {
  if (!result.isCurrent) return state;
  if (result.error) {
    if (result.silent) return state;
    return { loadError: result.error, orders: state.orders };
  }
  return { loadError: null, orders: result.orders };
}

/** A silent refresh must not start while another fetch is in flight, or it can drop that result. */
export function shouldStartOrdersRefresh(silent: boolean, inFlight: boolean): boolean {
  return !(silent && inFlight);
}
