import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadowNav, type } from '../../theme/customerHome';
import {
  IconHeadset,
  IconTabCalendar,
  IconTabHome,
  IconTabOrders,
  IconTabUser,
} from './icons/CustomerIcons';

export type CustomerTab = 'home' | 'wizard' | 'orders' | 'support' | 'profile';

type TabItem = {
  key: CustomerTab;
  label: string;
};

const TABS: TabItem[] = [
  { key: 'home', label: 'خانه' },
  { key: 'wizard', label: 'رزرو' },
  { key: 'orders', label: 'سفارش‌ها' },
  { key: 'support', label: 'پشتیبانی' },
  { key: 'profile', label: 'پروفایل' },
];

type Props = {
  active: CustomerTab;
  onChange: (tab: CustomerTab) => void;
};

function TabIcon({ tab, color, active }: { tab: CustomerTab; color: string; active: boolean }) {
  if (tab === 'home') return <IconTabHome color={color} active={active} />;
  if (tab === 'wizard') return <IconTabCalendar color={color} strokeWidth={active ? 1.85 : 1.7} />;
  if (tab === 'orders') return <IconTabOrders color={color} strokeWidth={active ? 1.85 : 1.7} />;
  if (tab === 'support') return <IconHeadset size={22} color={color} strokeWidth={active ? 1.85 : 1.7} />;
  return <IconTabUser color={color} strokeWidth={active ? 1.85 : 1.7} />;
}

export function CustomerTabBar({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 0) }]}>
      <View style={styles.row}>
        {TABS.map((tab) => {
          const selected = tab.key === active;
          const color = selected ? colors.teal : colors.muted;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              onPress={() => onChange(tab.key)}
              style={styles.item}
            >
              <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
                <TabIcon tab={tab.key} color={color} active={selected} />
              </View>
              <Text style={[styles.label, selected ? styles.labelActive : styles.labelIdle]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.navBorder,
    paddingTop: 6,
    ...shadowNav,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingTop: 4,
    paddingBottom: 2,
    minWidth: 0,
  },
  iconWrap: {
    width: 44,
    height: 28,
    borderRadius: radius.iconTile + 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.tealSoft,
    borderRadius: 14,
  },
  label: {
    fontSize: 11.5,
    lineHeight: 14,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  labelIdle: {
    ...type.medium,
    color: colors.muted,
  },
  labelActive: {
    ...type.semibold,
    color: colors.teal,
  },
});
