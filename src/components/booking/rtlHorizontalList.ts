/**
 * Pure helpers for RTL-feeling horizontal strips in the native booking wizard.
 *
 * Android's horizontal ScrollView with `flexDirection: 'row-reverse'` opens at the far end
 * (the last item) and cannot scroll past it. Instead we render the items reversed in a normal
 * 'row' container and scroll to the end once, so the first item sits at the right edge and the
 * rest continue to the left.
 */

/** Items reversed so the first item ends up rightmost in a left-to-right 'row'. Does not mutate. */
export const rtlOrder = <T,>(items: readonly T[]): T[] => [...items].reverse();

export interface ScrollToEndTarget {
  scrollToEnd: (options?: { animated?: boolean }) => void;
}

/**
 * Returns an `onContentSizeChange` handler that scrolls to the end only on the first non-empty
 * layout (so it never jumps after the user scrolls). Call `reset()` to allow one more jump
 * (e.g. when the list content is replaced by a new search).
 */
export const createScrollToEndOnce = (getTarget: () => ScrollToEndTarget | null | undefined) => {
  let done = false;
  return {
    onContentSizeChange: (width: number) => {
      if (done || !(width > 0)) return;
      const target = getTarget();
      if (!target) return;
      done = true;
      target.scrollToEnd({ animated: false });
    },
    reset: () => {
      done = false;
    },
  };
};
