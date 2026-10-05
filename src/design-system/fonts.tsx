import { colors } from './tokens';

import React, { createContext, useContext } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  useFonts,
  Vazirmatn_400Regular,
  Vazirmatn_500Medium,
  Vazirmatn_600SemiBold,
  Vazirmatn_700Bold,
  Vazirmatn_800ExtraBold,
} from '@expo-google-fonts/vazirmatn';

export type PakshoFontFamilies = {
  regular?: string;
  medium?: string;
  semibold?: string;
  bold?: string;
  extrabold?: string;
};

const systemFonts: PakshoFontFamilies = {};

const vazirmatnFonts: PakshoFontFamilies = {
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  semibold: 'Vazirmatn_600SemiBold',
  bold: 'Vazirmatn_700Bold',
  extrabold: 'Vazirmatn_800ExtraBold',
};

const FontContext = createContext<PakshoFontFamilies>(systemFonts);

export function usePakshoFonts(): PakshoFontFamilies {
  return useContext(FontContext);
}

export function PakshoThemeProvider({ children }: { children: React.ReactNode }) {
  const [loaded, error] = useFonts({
    Vazirmatn_400Regular,
    Vazirmatn_500Medium,
    Vazirmatn_600SemiBold,
    Vazirmatn_700Bold,
    Vazirmatn_800ExtraBold,
  });

  if (!loaded && !error) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.teal[700]} />
      </View>
    );
  }

  return (
    <FontContext.Provider value={loaded ? vazirmatnFonts : systemFonts}>
      {children}
    </FontContext.Provider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream[50],
  },
});
