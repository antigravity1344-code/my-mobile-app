import { useEffect, useRef, useState } from 'react';
import {
  buildQuoteRequest,
  quoteSelectionKey,
  requestServerQuote,
  type QuoteSelection,
  type QuoteView,
} from './serverQuote';

export function useCustomerPriceQuote(selection: QuoteSelection | null) {
  const key = selection ? quoteSelectionKey(selection) : '';
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [refreshToken, setRefreshToken] = useState(0);
  const [view, setView] = useState<QuoteView>({ status: 'idle' });

  useEffect(() => {
    const current = selectionRef.current;
    if (!current) {
      setView({ status: 'idle' });
      return undefined;
    }
    const built = buildQuoteRequest(current);
    if (!built.ok) {
      setView({ status: 'unavailable', message: built.message });
      return undefined;
    }
    let active = true;
    setView({ status: 'loading' });
    void requestServerQuote(built.body).then((result) => {
      if (active) setView(result);
    });
    return () => {
      active = false;
    };
  }, [key, refreshToken]);

  return {
    view,
    refreshQuote: () => setRefreshToken((value) => value + 1),
  };
}
