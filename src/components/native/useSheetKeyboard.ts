import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  TextInput,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import { computeRevealDelta } from '../booking/keyboardReveal';
import { sheetKeyboardLayout, sheetMaxHeight, type SheetKeyboardLayout } from './sheetKeyboard';

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };

/**
 * Keeps inputs of a Modal bottom sheet above the Android keyboard (see sheetKeyboard.ts for why).
 * - `layout(bottomInset)` → liftBottom (overlay paddingBottom) and the content bottom inset.
 * - `onOverlayLayout` lets it detect a system resize so the sheet is never lifted twice.
 * - Optional `scrollRef`/`onScroll` on the sheet's ScrollView: after the lift the focused input is
 *   scrolled into the (now smaller) visible area with the K1 measureInWindow math.
 * iOS keeps using KeyboardAvoidingView (padding) and is unaffected.
 */
export function useSheetKeyboard(active: boolean) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [windowShrink, setWindowShrink] = useState(0);
  const [overlayHeight, setOverlayHeight] = useState(0);
  const keyboardHeightRef = useRef(0);
  const closedHeightRef = useRef(0);
  const lastHeightRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const revealFocusedInput = useCallback(() => {
    const scroll = scrollRef.current;
    const input = TextInput.State.currentlyFocusedInput?.() as unknown as Measurable | null;
    if (!scroll || !input?.measureInWindow) return;
    const host = (scroll as unknown as { getNativeScrollRef?: () => unknown }).getNativeScrollRef?.() as
      | Measurable
      | null
      | undefined;
    if (!host?.measureInWindow) return;
    host.measureInWindow((_sx, sy, _sw, sh) => {
      input.measureInWindow?.((_ix, iy, _iw, ih) => {
        const delta = computeRevealDelta({ fieldTop: iy, fieldBottom: iy + ih, viewportTop: sy, viewportBottom: sy + sh });
        if (delta !== 0) scrollRef.current?.scrollTo({ y: Math.max(0, scrollYRef.current + delta), animated: true });
      });
    });
  }, []);

  useEffect(() => {
    if (!active || Platform.OS !== 'android') {
      keyboardHeightRef.current = 0;
      closedHeightRef.current = 0;
      lastHeightRef.current = 0;
      setKeyboardHeight(0);
      setWindowShrink(0);
      return;
    }
    const apply = (height: number) => {
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
      // The system may already have resized the window before this event (no later onLayout then).
      if (height > 0 && closedHeightRef.current > 0 && lastHeightRef.current > 0) {
        setWindowShrink(Math.max(0, closedHeightRef.current - lastHeightRef.current));
      }
    };
    const metrics = Keyboard.metrics();
    if (Keyboard.isVisible() && metrics && metrics.height > 0) apply(metrics.height);
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      apply(event.endCoordinates.height);
      // Wait for the lift to be laid out, then bring the focused input into view.
      clearTimers();
      timersRef.current = [80, 350].map((ms) => setTimeout(revealFocusedInput, ms));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      clearTimers();
      apply(0);
      setWindowShrink(0);
    });
    return () => {
      show.remove();
      hide.remove();
      clearTimers();
    };
  }, [active, revealFocusedInput]);

  const onOverlayLayout = useCallback((event: LayoutChangeEvent) => {
    const h = event.nativeEvent.layout.height;
    lastHeightRef.current = h;
    setOverlayHeight(h);
    if (keyboardHeightRef.current === 0) {
      closedHeightRef.current = Math.max(closedHeightRef.current, h);
      return;
    }
    if (closedHeightRef.current > 0) setWindowShrink(Math.max(0, closedHeightRef.current - lastHeightRef.current));
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const layout = useCallback(
    (bottomInset: number): SheetKeyboardLayout & { maxHeight: (fraction: number) => number } => {
      const base = sheetKeyboardLayout({ platform: Platform.OS, keyboardHeight, bottomInset, windowShrink });
      // Before the first onLayout fall back to the window height (keyboard is closed then).
      const fallback = Dimensions.get('window').height;
      const fullHeight = closedHeightRef.current || overlayHeight || fallback;
      const current = overlayHeight || fallback;
      return {
        ...base,
        maxHeight: (fraction: number) =>
          sheetMaxHeight({ fullHeight, overlayHeight: current, liftBottom: base.liftBottom, fraction }),
      };
    },
    [keyboardHeight, windowShrink, overlayHeight],
  );

  return { layout, onOverlayLayout, scrollRef, onScroll };
}
