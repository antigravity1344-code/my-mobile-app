/**
 * Pure math for keeping a focused TextInput visible above the Android soft keyboard.
 * All values are window coordinates (dp), as returned by measureInWindow and Keyboard.metrics().
 * Returns how much to change the ScrollView's y offset (positive = scroll down, 0 = leave as is).
 */
export type RevealInput = {
  fieldTop: number;
  fieldBottom: number;
  viewportTop: number;
  viewportBottom: number;
  /** Keyboard top (screenY); undefined when the keyboard is hidden or metrics are unknown. */
  keyboardTop?: number;
  /** Space kept above the field so its label stays visible. */
  marginTop?: number;
  /** Space kept between the field and the keyboard. */
  marginBottom?: number;
};

export function computeRevealDelta({
  fieldTop,
  fieldBottom,
  viewportTop,
  viewportBottom,
  keyboardTop,
  marginTop = 40,
  marginBottom = 24,
}: RevealInput): number {
  const visibleTop = viewportTop;
  const visibleBottom =
    typeof keyboardTop === 'number' && keyboardTop > viewportTop
      ? Math.min(viewportBottom, keyboardTop)
      : viewportBottom;

  const needDown = fieldBottom + marginBottom - visibleBottom;
  if (needDown > 0) {
    // Never push the field's top (and label) out above the visible area.
    const maxDown = fieldTop - marginTop - visibleTop;
    return Math.round(Math.max(0, Math.min(needDown, maxDown)));
  }
  const needUp = visibleTop - (fieldTop - marginTop);
  if (needUp > 0) return -Math.round(needUp);
  return 0;
}
