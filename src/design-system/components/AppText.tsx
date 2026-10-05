import { usePakshoFonts, type PakshoFontFamilies } from '../fonts';
import { colors, typography } from '../tokens';

import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

type Variant = keyof typeof typography;

type AppTextProps = TextProps & {
  variant?: Variant;
  color?: string;
  align?: TextStyle['textAlign'];
  children: React.ReactNode;
};

const weightFor: Record<
  Variant,
  { family: keyof PakshoFontFamilies; fallback: TextStyle['fontWeight'] }
> = {
  display: { family: 'extrabold', fallback: '800' },
  title: { family: 'bold', fallback: '700' },
  heading: { family: 'bold', fallback: '700' },
  body: { family: 'regular', fallback: '400' },
  label: { family: 'semibold', fallback: '600' },
  caption: { family: 'medium', fallback: '500' },
};

export function AppText({
  variant = 'body',
  color = colors.ink[900],
  align = 'right',
  style,
  children,
  ...rest
}: AppTextProps) {
  const fonts = usePakshoFonts();
  const weight = weightFor[variant];
  const family = fonts[weight.family];
  const fontStyle: StyleProp<TextStyle> = family
    ? { fontFamily: family }
    : { fontWeight: weight.fallback };

  return (
    <Text
      {...rest}
      style={[typography[variant], styles.base, { color, textAlign: align }, fontStyle, style]}
    >
      {children}
    </Text>
  );
}

const styles = {
  base: {
    writingDirection: 'rtl',
  } as TextStyle,
};
