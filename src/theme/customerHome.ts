import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { useFonts } from 'expo-font';
import vazirmatnBold from '../../assets/fonts/Vazirmatn-UI-FD-Bold.ttf';
import vazirmatnMedium from '../../assets/fonts/Vazirmatn-UI-FD-Medium.ttf';
import vazirmatnRegular from '../../assets/fonts/Vazirmatn-UI-FD-Regular.ttf';
import vazirmatnSemiBold from '../../assets/fonts/Vazirmatn-UI-FD-SemiBold.ttf';

export const colors = {
  bg: '#F6F2E6',
  teal: '#11766F',
  tealDark: '#0E635D',
  tealSoft: '#E6F3F2',
  text: '#1F2A28',
  muted: '#6B7370',
  mutedLight: '#8A9290',
  white: '#FFFFFF',
  amberBg: '#FEF3E2',
  amberText: '#B45309',
  amberIcon: '#D97706',
  border: 'rgba(31, 42, 40, 0.06)',
  navBorder: 'rgba(31, 42, 40, 0.08)',
  dot: '#D92D4A',
  servicePress: '#FBE6D4',
  servicePressBorder: '#F3D4BE',
} as const;

export const space = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  padX: 20,
} as const;

export const radius = {
  card: 16,
  button: 12,
  pill: 999,
  iconTile: 11,
  trust: 12,
} as const;

export const fontFamily = {
  regular: 'Vazirmatn-Regular',
  medium: 'Vazirmatn-Medium',
  semibold: 'Vazirmatn-SemiBold',
  bold: 'Vazirmatn-Bold',
} as const;

/**
 * Each cut is registered under its own family name. expo-font's web @font-face
 * is weight 400, so a numeric fontWeight would miss the face and fall back.
 */
export const type = {
  regular: { fontFamily: fontFamily.regular } satisfies TextStyle,
  medium: { fontFamily: fontFamily.medium } satisfies TextStyle,
  semibold: { fontFamily: fontFamily.semibold } satisfies TextStyle,
  bold: { fontFamily: fontFamily.bold } satisfies TextStyle,
};

const shadowMdNative: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 3,
  boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 4px 12px rgba(0, 0, 0, 0.04)',
};

const shadowSmNative: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 2,
  elevation: 2,
  boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04)',
};

const shadowNavNative: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: -2 },
  shadowOpacity: 0.04,
  shadowRadius: 12,
  elevation: 8,
  boxShadow: '0px -2px 12px rgba(0, 0, 0, 0.03)',
};

export const shadowMd: ViewStyle =
  Platform.OS === 'web'
    ? { boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)' }
    : shadowMdNative;

export const shadowSm: ViewStyle =
  Platform.OS === 'web' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.04)' } : shadowSmNative;

export const shadowCtaBtn: ViewStyle =
  Platform.OS === 'web'
    ? { boxShadow: '0 4px 10px rgba(14, 99, 93, 0.22)' }
    : {
        shadowColor: '#0E635D',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
        elevation: 4,
        boxShadow: '0px 4px 10px rgba(14, 99, 93, 0.22)',
      };

export const shadowBtn: ViewStyle =
  Platform.OS === 'web'
    ? { boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
    : {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 1,
        boxShadow: '0px 1px 2px rgba(0,0,0,0.06)',
      };

export const shadowNav: ViewStyle =
  Platform.OS === 'web' ? { boxShadow: '0 -2px 12px rgba(0,0,0,0.03)' } : shadowNavNative;

export function useCustomerFonts(): [boolean, Error | null] {
  return useFonts({
    [fontFamily.regular]: vazirmatnRegular,
    [fontFamily.medium]: vazirmatnMedium,
    [fontFamily.semibold]: vazirmatnSemiBold,
    [fontFamily.bold]: vazirmatnBold,
  });
}
