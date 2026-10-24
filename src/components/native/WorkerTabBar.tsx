import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadowNav, type } from '../../theme/customerHome';
import {
  IconHeadset,
  IconTabHome,
  IconTabOrders,
  IconTabUser,
  IconTabCalendar,
} from './icons/CustomerIcons';

export type WorkerTab = 'home' | 'new_orders' | 'my_jobs' | 'support' | 'profile';

type TabItem = {
  key: WorkerTab;
  label: string;
};

const TABS: TabItem[] = [
  { key: 'home', label: 'خانه' },
  { key: 'new_orders', label: 'سفارش‌ها' },
  { key: 'my_jobs', label: 'کارهای من' },
  { key: 'support', label: 'پشتیبانی' },
  { key: 'profile', label: 'پروفایل' },
];

type Props = {
  active: WorkerTab;
  onChange: (tab: WorkerTab) => void;
  /** نشان تعداد سفارش‌های جدید؛ null یعنی پنهان. */
  newOrdersBadge?: string | null;
};

function TabIcon({ tab, color, active }: { tab: WorkerTab; color: string; active: boolean }) {
  if (tab === 'home') return <IconTabHome color={color} active={active} />;
  if (tab === 'new_orders') return <IconTabCalendar color={color} strokeWidth={active ? 1.85 : 1.7} />;
  if (tab === 'my_jobs') return <IconTabOrders color={color} strokeWidth={active ? 1.85 : 1.7} />;
  if (tab === 'support') return <IconHeadset size={22} color={color} strokeWidth={active ? 1.85 : 1.7} />;
  return <IconTabUser color={color} strokeWidth={active ? 1.85 : 1.7} />;
}

export function WorkerTabBar({ active, onChange, newOrdersBadge }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 0) }]}>
      <View style={styles.row}>
        {TABS.map((tab) => {
          const selected = tab.key === active;
          const color = selected ? colors.teal : colors.muted;
          const badge = tab.key === 'new_orders' ? newOrdersBadge ?? null : null;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={badge ? `${tab.label}، ${badge} سفارش جدید` : tab.label}
              onPress={() => onChange(tab.key)}
              style={styles.item}
            >
              <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
                <TabIcon tab={tab.key} color={color} active={selected} />
                {badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} numberOfLines={1}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[styles.label, selected ? styles.labelActive : styles.labelIdle]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
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
  badge: {
    position: 'absolute',
    top: -4,
    left: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.dot,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...type.bold,
    color: colors.white,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    includeFontPadding: false,
  },
  iconWrapActive: {
    backgroundColor: colors.tealSoft,
    borderRadius: 14,
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
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
