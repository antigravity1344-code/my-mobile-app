import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sheetKeyboardLayout, sheetMaxHeight } from './sheetKeyboard';

// dp values. keyboardHeight = Keyboard event endCoordinates.height on Android
// (= IME inset bottom − nav-bar inset, see ReactRootView.checkForKeyboardEvents).
describe('sheetKeyboardLayout', () => {
  it('keyboard closed: sheet keeps its normal bottom inset, no lift', () => {
    expect(sheetKeyboardLayout({ platform: 'android', keyboardHeight: 0, bottomInset: 24 })).toEqual({
      keyboardOpen: false,
      liftBottom: 0,
      contentBottomInset: 24,
    });
  });
  it('android edge-to-edge modal (window not resized): lifts the sheet by keyboard + nav bar', () => {
    expect(sheetKeyboardLayout({ platform: 'android', keyboardHeight: 300, bottomInset: 24 })).toEqual({
      keyboardOpen: true,
      liftBottom: 324,
      contentBottomInset: 0,
    });
  });
  it('does not lift twice if the window was already resized by the system (adjustResize)', () => {
    expect(sheetKeyboardLayout({ platform: 'android', keyboardHeight: 300, bottomInset: 24, windowShrink: 324 }).liftBottom).toBe(0);
    expect(sheetKeyboardLayout({ platform: 'android', keyboardHeight: 300, bottomInset: 24, windowShrink: 100 }).liftBottom).toBe(224);
  });
  it('iOS is left to KeyboardAvoidingView (padding), unchanged', () => {
    expect(sheetKeyboardLayout({ platform: 'ios', keyboardHeight: 300, bottomInset: 34 })).toEqual({
      keyboardOpen: false,
      liftBottom: 0,
      contentBottomInset: 34,
    });
  });
});

describe('sheetMaxHeight', () => {
  // Phone of the report: Galaxy A06, 711dp tall, keyboard ≈ 290dp + 48dp nav bar.
  it('keyboard closed: the usual fraction of the full sheet area', () => {
    expect(sheetMaxHeight({ fullHeight: 800, overlayHeight: 800, liftBottom: 0, fraction: 0.88 })).toBe(704);
  });
  it('edge-to-edge (window not resized): only the space above the lift minus the status-bar gap', () => {
    expect(sheetMaxHeight({ fullHeight: 800, overlayHeight: 800, liftBottom: 324, fraction: 0.88 })).toBe(800 - 324 - 56);
  });
  it('BUG B: system resized the window (lift 0) → cap follows the shrunk overlay, not the full window height', () => {
    // Before: the cap was 0.88 × window height = 626dp inside a 373dp overlay, so the card overflowed
    // upwards by ~250dp and its header and first field («عنوان آدرس») went off the top of the screen.
    expect(sheetMaxHeight({ fullHeight: 711, overlayHeight: 373, liftBottom: 0, fraction: 0.88 })).toBe(373 - 56);
  });
  it('never below a usable minimum', () => {
    expect(sheetMaxHeight({ fullHeight: 400, overlayHeight: 400, liftBottom: 330, fraction: 0.88 })).toBe(160);
  });
});

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

describe('bottom-sheet inputs use the Android keyboard lift (source wiring)', () => {
  const sheets = [
    'features/support/components/NativeSupportScreen.tsx',
    'features/profile/components/NativeAddressManagerModal.tsx',
    'features/orders/components/OrderDetailModal.tsx',
  ];
  for (const file of sheets) {
    it(`${file} applies useSheetKeyboard lift to its overlay`, () => {
      const src = read(file);
      expect(src).toContain('useSheetKeyboard(');
      expect(src).toMatch(/paddingBottom: sheetLayout\.liftBottom/);
      // The cap must come from the measured overlay, never from the (unchanged) window height.
      expect(src).not.toContain("Dimensions.get('window')");
    });
  }
  it('order detail scrolls the cancel box (reason input) into view when it opens', () => {
    const src = read('features/orders/components/OrderDetailModal.tsx');
    expect(src).toMatch(/if \(!showCancelPrompt\) return undefined;[\s\S]{0,220}scrollToEnd/);
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });
  it('address and order sheets size themselves with sheetLayout.maxHeight', () => {
    expect(read('features/profile/components/NativeAddressManagerModal.tsx')).toContain('sheetLayout.maxHeight(0.88)');
    expect(read('features/orders/components/OrderDetailModal.tsx')).toContain('sheetLayout.maxHeight(0.92)');
  });
  it('the hook detects a system resize that happened before keyboardDidShow', () => {
    const hook = read('components/native/useSheetKeyboard.ts');
    expect(hook).toContain('lastHeightRef.current');
    expect(hook).toMatch(/closedHeightRef\.current - lastHeightRef\.current/);
  });
  it('scrollable sheets reveal the focused input after the lift', () => {
    for (const file of sheets.slice(1)) {
      const src = read(file);
      expect(src).toMatch(/ref=\{(sheetKb|kb)\.scrollRef\}/);
      expect(src).toMatch(/onScroll=\{(sheetKb|kb)\.onScroll\}/);
    }
  });
});
