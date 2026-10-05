import { colors } from '../tokens';
import { AppText } from './AppText';

import { Pressable, StyleSheet, View } from 'react-native';

import type { LucideIcon } from 'lucide-react-native';

export type BottomTabItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type BottomTabBarProps = {
  items: BottomTabItem[];
  activeId?: string;
  onChange: (id: string) => void;
};

export function BottomTabBar({ items, activeId, onChange }: BottomTabBarProps) {
  return (
    <View style={styles.bar}>
      {items.map((item) => {
        const active = item.id === activeId;
        const Icon = item.icon;
        const tint = active ? colors.teal[700] : colors.ink[400];
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.id)}
            style={styles.item}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Icon color={tint} size={20} strokeWidth={active ? 2.4 : 2} />
            </View>
            <AppText variant="caption" color={tint} align="center" numberOfLines={1}>
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    minHeight: 52,
  },
  iconWrap: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: colors.teal[50] },
});
