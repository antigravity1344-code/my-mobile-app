/**
 * Android: an empty right-aligned single-line TextInput scrolls horizontally when focused,
 * pushing caret and placeholder outside the box (the field looks dead although it types).
 * A one-line multiline input has no horizontal scroll, so caret and placeholder stay visible.
 * Spread onto Persian/right-aligned single-line inputs: <TextInput {...RTL_SINGLE_LINE_INPUT} … />
 */
export const RTL_SINGLE_LINE_INPUT = {
  multiline: true,
  numberOfLines: 1,
  submitBehavior: 'blurAndSubmit',
} as const;
