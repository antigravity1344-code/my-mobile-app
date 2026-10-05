import { colors, radii } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';

import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Inbox, TriangleAlert, type LucideIcon } from 'lucide-react-native';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={styles.iconCircle}>
        <Icon color={colors.teal[700]} size={compact ? 22 : 28} strokeWidth={2.1} />
      </View>
      <AppText variant={compact ? 'label' : 'heading'} align="center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="caption" color={colors.ink[500]} align="center">
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="sm" variant="secondary" />
      ) : null}
    </View>
  );
}

export function LoadingState({
  label = 'در حال بارگذاری',
  fill = false,
}: {
  label?: string;
  fill?: boolean;
}) {
  return (
    <View style={[styles.wrap, fill && styles.fill]}>
      <ActivityIndicator color={colors.teal[700]} size="large" />
      <AppText variant="label" color={colors.ink[600]} align="center">
        {label}
      </AppText>
    </View>
  );
}

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
};

export function ErrorState({
  title = 'چیزی درست پیش نرفت',
  message,
  onRetry,
  compact = false,
}: ErrorStateProps) {
  return (
    <View style={[styles.wrap, styles.errorWrap, compact && styles.compact]}>
      <View style={[styles.iconCircle, styles.errorIcon]}>
        <TriangleAlert color={colors.danger[700]} size={compact ? 22 : 28} strokeWidth={2.1} />
      </View>
      <AppText variant={compact ? 'label' : 'heading'} align="center">
        {title}
      </AppText>
      <AppText variant="caption" color={colors.ink[600]} align="center">
        {message}
      </AppText>
      {onRetry ? (
        <Button label="تلاش دوباره" onPress={onRetry} size="sm" variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  compact: { padding: 16 },
  fill: { flex: 1, backgroundColor: colors.cream[50] },
  errorWrap: {
    backgroundColor: colors.danger[50],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.danger[100],
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal[50],
    marginBottom: 4,
  },
  errorIcon: { backgroundColor: colors.white },
});
