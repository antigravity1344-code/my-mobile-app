import { useEffect, useRef, useState } from 'react';
import {
  QUOTE_EXPIRED_MESSAGE,
  buildQuoteRequest,
  confirmableServerQuote,
  isQuoteUnexpired,
  quoteSelectionKey,
  quoteViewForSelection,
  requestServerQuote,
  type QuoteSelection,
  type StoredQuote,
} from './serverQuote';

export function useCustomerPriceQuote(selection: QuoteSelection | null) {
  const key = selection ? quoteSelectionKey(selection) : '';
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [generation, setGeneration] = useState(0);
  const [stored, setStored] = useState<StoredQuote>({ key: '', generation: 0, view: { status: 'idle' } });
  const [clock, setClock] = useState(() => Date.now());
  const view = quoteViewForSelection(stored, selection, generation, clock);

  useEffect(() => {
    const current = selectionRef.current;
    if (!current) return undefined;
    const built = buildQuoteRequest(current);
    if (!built.ok) return undefined;
    let active = true;
    const requestKey = JSON.stringify(built.body);
    const requestGeneration = generation;
    void requestServerQuote(built.body).then((result) => {
      if (!active) return;
      if (result.status === 'ready' && !isQuoteUnexpired(result.quote)) {
        setStored({
          key: requestKey,
          generation: requestGeneration,
          view: { status: 'unavailable', message: QUOTE_EXPIRED_MESSAGE, code: 'QUOTE_EXPIRED' },
        });
        return;
      }
      setStored({ key: requestKey, generation: requestGeneration, view: result });
    });
    return () => {
      active = false;
    };
  }, [key, generation]);

  useEffect(() => {
    if (stored.generation !== generation || stored.key !== key || stored.view.status !== 'ready') return undefined;
    const expiresAt = Date.parse(stored.view.quote.expiresAt);
    if (!Number.isFinite(expiresAt)) return undefined;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      setClock(Date.now());
      setGeneration((value) => value + 1);
      return undefined;
    }
    const timer = setTimeout(() => {
      setClock(Date.now());
      setGeneration((value) => value + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [stored, key, generation]);

  return {
    view,
    confirmable: confirmableServerQuote(view, selection, clock),
    refreshQuote: () => {
      setClock(Date.now());
      setGeneration((value) => value + 1);
    },
  };
}
