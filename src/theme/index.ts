/**
 * Shared app theme, extracted from the customer Home design (CustomerHomeScreen + TabBar + Timeline).
 * Home's tokens stay the single source in ./customerHome; this module re-exports them and adds the
 * few semantic colours the inner screens and the worker app need (status, danger, inputs).
 */
export {
  colors,
  space,
  radius,
  fontFamily,
  type,
  shadowMd,
  shadowSm,
  shadowBtn,
  shadowCtaBtn,
  shadowNav,
  useCustomerFonts,
  useCustomerFonts as useAppFonts,
} from './customerHome';

/** Semantic colours on top of Home's palette (same teal/cream family, plus status tones). */
export const ui = {
  surface: '#FFFFFF',
  surfaceMuted: '#FBF9F3',
  inputBg: '#FFFFFF',
  inputBorder: 'rgba(31, 42, 40, 0.14)',
  placeholder: '#94A3B8',
  divider: 'rgba(31, 42, 40, 0.08)',
  tealBorder: 'rgba(17, 118, 111, 0.28)',
  successBg: '#E6F3F2',
  successText: '#0E635D',
  dangerBg: '#FDECEC',
  dangerBorder: 'rgba(185, 28, 28, 0.25)',
  dangerText: '#B91C1C',
  neutralBg: '#F1EFE8',
  neutralText: '#4B5552',
} as const;

/** Minimum touch target (px) for every pressable control. */
export const TOUCH_MIN = 44;
/** Smallest allowed font size (px). */
export const FONT_MIN = 12;
