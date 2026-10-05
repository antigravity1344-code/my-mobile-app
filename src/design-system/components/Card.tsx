import { colors, radii, shadows } from '../tokens';

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'muted' | 'sand';
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
};

export function Card({ children, onPress, tone = 'default', style, padded = true }: CardProps) {
  const backgroundColor =
    tone === 'sand' ? colors.sand : tone === 'muted' ? colors.cream[100] : colors.white;
  const body = <View style={padded ? styles.padded : undefined}>{children}</View>;

  if (!onPress) {
    return <View style={[styles.card, shadows.sm, { backgroundColor }, style]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        shadows.sm,
        { backgroundColor, opacity: pressed ? 0.94 : 1 },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  padded: { padding: 16 },
});
