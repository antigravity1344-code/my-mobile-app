import React from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors, radius, shadowCtaBtn, shadowSm, type, ui, TOUCH_MIN } from './index';

type Children = { children?: React.ReactNode };

/** Page title block used at the top of inner screens: right-aligned title + optional muted subtitle. */
export function ScreenHeader({
  title,
  subtitle,
  style,
}: { title: string; subtitle?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 4, paddingBottom: 8 }, style]}>
      <Text style={[type.bold, { fontSize: 22, color: colors.text, textAlign: 'right' }]}>{title}</Text>
      {subtitle ? (
        <Text style={[type.regular, { fontSize: 13, color: colors.muted, textAlign: 'right', lineHeight: 22 }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** White rounded card with Home's soft border and shadow. */
export function Card({ children, style }: Children & { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        { backgroundColor: ui.surface, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: colors.border },
        shadowSm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, style }: Children & { style?: StyleProp<TextStyle> }) {
  return <Text style={[type.semibold, { fontSize: 16, color: colors.text, textAlign: 'right' }, style]}>{children}</Text>;
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function PrimaryButton({ label, onPress, disabled, icon, style, accessibilityLabel }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        {
          minHeight: TOUCH_MIN + 4,
          flexDirection: 'row-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 20,
          borderRadius: radius.button,
          backgroundColor: pressed ? colors.tealDark : colors.teal,
          opacity: disabled ? 0.5 : 1,
        },
        shadowCtaBtn,
        style,
      ]}
    >
      {icon}
      <Text style={[type.bold, { fontSize: 15, color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled, icon, style, accessibilityLabel }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        {
          minHeight: TOUCH_MIN + 4,
          flexDirection: 'row-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 20,
          borderRadius: radius.button,
          borderWidth: 1,
          borderColor: ui.tealBorder,
          backgroundColor: pressed ? colors.servicePress : colors.tealSoft,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text style={[type.semibold, { fontSize: 15, color: colors.tealDark }]}>{label}</Text>
    </Pressable>
  );
}

export type BadgeTone = 'teal' | 'amber' | 'danger' | 'neutral';

const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  teal: { bg: colors.tealSoft, fg: colors.tealDark },
  amber: { bg: colors.amberBg, fg: colors.amberText },
  danger: { bg: ui.dangerBg, fg: ui.dangerText },
  neutral: { bg: ui.neutralBg, fg: ui.neutralText },
};

export function Badge({ label, tone = 'teal', style }: { label: string; tone?: BadgeTone; style?: StyleProp<ViewStyle> }) {
  const t = BADGE_TONES[tone];
  return (
    <View style={[{ backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }, style]}>
      <Text style={[type.semibold, { fontSize: 12, color: t.fg }]}>{label}</Text>
    </View>
  );
}
