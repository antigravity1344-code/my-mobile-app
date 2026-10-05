import { colors, hitSlop } from '../tokens';
import { AppText } from './AppText';

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRight } from 'lucide-react-native';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
};

export function ScreenHeader({ title, subtitle, onBack, trailing }: ScreenHeaderProps) {
  return (
    <View style={styles.bar}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="بازگشت"
          hitSlop={hitSlop}
          onPress={onBack}
          style={styles.back}
        >
          <ChevronRight color={colors.teal[800]} size={22} strokeWidth={2.25} />
        </Pressable>
      ) : (
        <View style={styles.backPlaceholder} />
      )}
      <View style={styles.titles}>
        <AppText variant="heading" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.ink[500]} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.trailing}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.cream[50],
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  backPlaceholder: { width: 8 },
  titles: { flex: 1, gap: 2 },
  trailing: { minWidth: 40, alignItems: 'center', justifyContent: 'center' },
});
