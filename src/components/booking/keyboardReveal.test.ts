import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeRevealDelta } from './keyboardReveal';

// Numbers below are dp in window coordinates (Samsung-sized screen, ~850dp tall, keyboard ~300dp).
describe('computeRevealDelta', () => {
  it('scrolls down so a field hidden behind the keyboard ends above it (plak/unit case)', () => {
    const delta = computeRevealDelta({ fieldTop: 640, fieldBottom: 686, viewportTop: 0, viewportBottom: 850, keyboardTop: 550 });
    expect(delta).toBe(686 + 24 - 550);
  });
  it('uses the smaller of viewport bottom and keyboard top (KeyboardAvoidingView already shrank the view)', () => {
    const delta = computeRevealDelta({ fieldTop: 500, fieldBottom: 546, viewportTop: 0, viewportBottom: 520, keyboardTop: 550 });
    expect(delta).toBe(546 + 24 - 520);
  });
  it('does nothing when the field is already visible', () => {
    expect(computeRevealDelta({ fieldTop: 300, fieldBottom: 346, viewportTop: 0, viewportBottom: 850, keyboardTop: 550 })).toBe(0);
  });
  it('never scrolls the field (and its label) above the top of the viewport', () => {
    // very tall field: bottom cannot fit, keep its top + label visible instead.
    const delta = computeRevealDelta({ fieldTop: 200, fieldBottom: 900, viewportTop: 0, viewportBottom: 850, keyboardTop: 550 });
    expect(delta).toBe(200 - 40);
  });
  it('scrolls up when the field is above the visible area', () => {
    expect(computeRevealDelta({ fieldTop: 10, fieldBottom: 56, viewportTop: 30, viewportBottom: 850 })).toBe(-(30 - (10 - 40)));
  });
  it('ignores missing/zero keyboard metrics', () => {
    expect(computeRevealDelta({ fieldTop: 700, fieldBottom: 746, viewportTop: 0, viewportBottom: 850, keyboardTop: undefined })).toBe(0);
  });
});

describe('NativeBookingWizard keyboard wiring (source-level)', () => {
  const src = readFileSync(join(__dirname, 'NativeBookingWizard.tsx'), 'utf8');
  it('no longer relies on scrollResponderScrollNativeHandleToKeyboard (assumes full-screen scroll view; wrong before keyboardDidShow on Android)', () => {
    expect(src).not.toContain('scrollResponderScrollNativeHandleToKeyboard');
  });
  it('re-runs the reveal after the keyboard is actually shown and tracks scroll offset', () => {
    expect(src).toContain("Keyboard.addListener('keyboardDidShow'");
    expect(src).toContain('computeRevealDelta(');
    expect(src).toMatch(/onScroll=\{/);
    expect(src).toMatch(/scrollEventThrottle=\{16\}/);
  });
  it('plak and unit inputs call the reveal handler on focus', () => {
    for (const field of ['plaque', 'unit']) {
      const re = new RegExp(`updateAddressField\\('${field}'[^\\n]*onFocus=\\{scrollFocusedFieldIntoView\\}`);
      expect(src).toMatch(re);
    }
  });
});
