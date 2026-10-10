/**
 * Android keyboard handling for bottom sheets hosted in a React Native Modal.
 *
 * Why: with edge-to-edge (Expo SDK 57 / RN 0.86, `edgeToEdgeEnabled=true`), ReactModalHostView calls
 * `dialogWindow.enableEdgeToEdge()` → `setDecorFitsSystemWindows(false)`. The dialog's
 * SOFT_INPUT_ADJUST_RESIZE then no longer shrinks the content, and `KeyboardAvoidingView` with
 * `behavior={undefined}` does nothing — so the keyboard simply covers the lower part of the sheet.
 * The sheet therefore lifts itself by the keyboard height reported by the Keyboard events
 * (the same signal CustomerOnboardingModal already uses).
 */
export type SheetKeyboardInput = {
  platform: string;
  /** Keyboard event endCoordinates.height (Android: IME inset − nav-bar inset). 0 = hidden. */
  keyboardHeight: number;
  /** Bottom safe-area inset of the modal (nav/gesture bar). */
  bottomInset: number;
  /** How much the system already shrank the sheet's overlay (0 in edge-to-edge). Avoids a double lift. */
  windowShrink?: number;
};

export type SheetKeyboardLayout = {
  keyboardOpen: boolean;
  /** paddingBottom for the full-screen overlay so the sheet sits on top of the keyboard. */
  liftBottom: number;
  /** Bottom inset the sheet content should keep (the nav bar is under the keyboard while it is open). */
  contentBottomInset: number;
};

export function sheetKeyboardLayout({
  platform,
  keyboardHeight,
  bottomInset,
  windowShrink = 0,
}: SheetKeyboardInput): SheetKeyboardLayout {
  const open = platform === 'android' && keyboardHeight > 0;
  if (!open) return { keyboardOpen: false, liftBottom: 0, contentBottomInset: bottomInset };
  const imeFromBottom = keyboardHeight + Math.max(0, bottomInset);
  return {
    keyboardOpen: true,
    liftBottom: Math.max(0, Math.round(imeFromBottom - Math.max(0, windowShrink))),
    contentBottomInset: 0,
  };
}

/**
 * Height cap for a sheet: the usual fraction of the full sheet area, but never taller than the space the
 * overlay really has above the keyboard (minus a gap for the status bar), so its header and first field
 * stay on screen. `overlayHeight` is the measured overlay: if the system resized the window for the
 * keyboard (lift 0), the shrink shows up here — the window height from Dimensions does not change.
 */
export function sheetMaxHeight({
  fullHeight,
  overlayHeight,
  liftBottom,
  fraction,
  topGap = 56,
}: {
  fullHeight: number;
  overlayHeight: number;
  liftBottom: number;
  fraction: number;
  topGap?: number;
}): number {
  const usual = Math.round(fullHeight * fraction);
  const available = Math.round(overlayHeight - Math.max(0, liftBottom) - topGap);
  return Math.max(160, Math.min(usual, available));
}
