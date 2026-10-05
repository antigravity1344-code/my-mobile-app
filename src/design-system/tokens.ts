import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Paksho visual tokens.
 *
 * The app previously inlined a cool slate + sky palette (`#0f172a`, `#0284c7`)
 * in every StyleSheet. Those values stay available as `colors.legacy` so existing
 * screens keep rendering until they migrate. New UI uses the warm cream paper
 * and deep teal ink that define Paksho.
 */
export const colors = {
  cream: {
    50: '#FFFBF6',
    100: '#FBF3E8',
    200: '#F3E4D0',
    300: '#E4CFAA',
  },
  teal: {
    50: '#F2FBFA',
    100: '#D7F3EF',
    200: '#A9E3DB',
    300: '#6DCEC2',
    400: '#2BB5A6',
    500: '#0E9486',
    600: '#0C786E',
    700: '#0A5E56',
    800: '#084842',
    900: '#06332F',
  },
  ink: {
    900: '#1C1917',
    800: '#292524',
    700: '#44403C',
    600: '#57534E',
    500: '#78716C',
    400: '#A8A29E',
    300: '#D6D3D1',
    200: '#E7E5E4',
  },
  white: '#FFFFFF',
  sand: '#F8E7CF',
  amber: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    600: '#C2410C',
    700: '#9A3412',
  },
  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    600: '#047857',
    700: '#065F46',
  },
  danger: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    600: '#B91C1C',
    700: '#991B1B',
  },
  line: '#E8DCCE',
  legacy: {
    sky: '#0284c7',
    skyDark: '#0369a1',
    slate950: '#0f172a',
    slate800: '#1e293b',
    slate700: '#334155',
    page: '#f8fafc',
    emerald: '#059669',
  },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

const shadowColor = colors.ink[900];

export const shadows: Record<'sm' | 'md' | 'lg', ViewStyle> = {
  sm:
    Platform.select<ViewStyle>({
      web: { boxShadow: '0 1px 2px rgba(28, 25, 23, 0.05), 0 4px 12px rgba(28, 25, 23, 0.04)' },
      android: { elevation: 1 },
      default: {
        shadowColor,
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
    }) ?? {},
  md:
    Platform.select<ViewStyle>({
      web: { boxShadow: '0 8px 24px rgba(28, 25, 23, 0.08)' },
      android: { elevation: 3 },
      default: {
        shadowColor,
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
    }) ?? {},
  lg:
    Platform.select<ViewStyle>({
      web: { boxShadow: '0 16px 40px rgba(8, 72, 66, 0.18)' },
      android: { elevation: 6 },
      default: {
        shadowColor: colors.teal[900],
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
      },
    }) ?? {},
};

export const typography = {
  display: { fontSize: 28, lineHeight: 42 },
  title: { fontSize: 22, lineHeight: 34 },
  heading: { fontSize: 17, lineHeight: 28 },
  body: { fontSize: 14, lineHeight: 24 },
  label: { fontSize: 13, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 20 },
} as const satisfies Record<string, TextStyle>;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
