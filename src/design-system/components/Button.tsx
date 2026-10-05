import { colors, hitSlop, radii } from '../tokens';
import { AppText } from './AppText';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { LucideIcon } from 'lucide-react-native';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
type ButtonSize = 'md' | 'sm';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'start' | 'end';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.teal[700], fg: colors.white, border: colors.teal[700] },
  secondary: { bg: colors.white, fg: colors.teal[800], border: colors.teal[200] },
  ghost: { bg: 'transparent', fg: colors.teal[800], border: 'transparent' },
  danger: { bg: colors.danger[50], fg: colors.danger[700], border: colors.danger[100] },
  inverse: { bg: colors.white, fg: colors.teal[800], border: colors.white },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'start',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const tone = palette[variant];
  const inactive = disabled || loading;
  const iconSize = size === 'sm' ? 16 : 18;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          opacity: inactive ? 0.55 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={tone.fg} size="small" /> : null}
      {!loading && Icon && iconPosition === 'start' ? (
        <Icon color={tone.fg} size={iconSize} strokeWidth={2.25} />
      ) : null}
      <AppText variant={size === 'sm' ? 'caption' : 'label'} color={tone.fg} align="center">
        {label}
      </AppText>
      {!loading && Icon && iconPosition === 'end' ? (
        <Icon color={tone.fg} size={iconSize} strokeWidth={2.25} />
      ) : null}
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  tone?: 'default' | 'inverse';
}) {
  const fg = tone === 'inverse' ? colors.white : colors.teal[800];
  const bg = tone === 'inverse' ? 'rgba(255,255,255,0.16)' : colors.white;
  const borderColor = tone === 'inverse' ? 'transparent' : colors.line;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: bg, borderColor, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Icon color={fg} size={18} strokeWidth={2.25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.pill,
  },
  md: { minHeight: 48, paddingHorizontal: 18 },
  sm: { minHeight: 36, paddingHorizontal: 14 },
  fullWidth: { alignSelf: 'stretch' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
});
