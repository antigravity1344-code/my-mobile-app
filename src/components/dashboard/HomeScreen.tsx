import { SERVICES_CATALOG } from '../../config/servicesData';
import { useBooking } from '../../context/BookingContext';
import { AppText } from '../../design-system/components/AppText';
import { BottomTabBar } from '../../design-system/components/BottomTabBar';
import { Button, IconButton } from '../../design-system/components/Button';
import { Card } from '../../design-system/components/Card';
import { CUSTOMER_TAB_ITEMS } from '../../design-system/customerTabs';
import { formatToman } from '../../design-system/format';
import { colors, radii, shadows, spacing } from '../../design-system/tokens';
import type { CleaningService } from '../../types/service';

import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Bell,
  Building2,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  Clock3,
  Hammer,
  Home,
  Paintbrush,
  ShieldCheck,
  Sofa,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';

interface HomeScreenProps {
  onStartBooking: () => void;
  displayName?: string;
  onOpenNotifications?: () => void;
}

const SERVICE_ICONS: Record<string, LucideIcon> = {
  home_unit_cleaning: Home,
  staircase_common_areas: Building2,
  office_company_cleaning: Briefcase,
  sofa_carpet_washing: Sofa,
  hourly_labor: Hammer,
  building_painting: Paintbrush,
};

const TRUST = [
  { icon: ShieldCheck, title: 'هویت تأییدشده', caption: 'نیروی احرازشده' },
  { icon: Clock3, title: 'زمان دلخواه', caption: 'روز و ساعت شما' },
  { icon: Sparkles, title: 'قیمت روشن', caption: 'قبل از ثبت سفارش' },
];

function greetingName(displayName?: string): string | null {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || trimmed;
}

function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

function priceLabel(service: CleaningService): string {
  if (!service.basePrice) return 'قیمت بعد از برآورد';
  return `از ${formatToman(service.basePrice)}`;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onStartBooking,
  displayName,
  onOpenNotifications,
}) => {
  const { setSelectedService } = useBooking();
  const name = greetingName(displayName);
  const services = SERVICES_CATALOG.filter((service) => service.isVisible !== false);

  const openService = (serviceId: string) => {
    const service = SERVICES_CATALOG.find((item) => item.id === serviceId);
    if (service) setSelectedService(service);
    onStartBooking();
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.topRow}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <Sparkles color={colors.white} size={16} strokeWidth={2.4} />
            </View>
            <AppText variant="label" color={colors.teal[800]}>
              پاکشو
            </AppText>
          </View>
          {onOpenNotifications ? (
            <IconButton icon={Bell} label="اعلان‌ها" onPress={onOpenNotifications} />
          ) : (
            <View style={styles.bellSpacer} />
          )}
        </View>

        <View style={styles.greeting}>
          <AppText variant="display">{name ? `سلام، ${name}` : 'سلام'}</AppText>
          <AppText variant="body" color={colors.ink[600]}>
            خانه‌تان امروز چه کمکی لازم دارد؟
          </AppText>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroOrb} />
          <View style={styles.heroOrbSmall} />
          <View style={styles.heroBadge}>
            <AppText variant="caption" color={colors.teal[50]}>
              بدون پیش‌پرداخت
            </AppText>
          </View>
          <AppText variant="title" color={colors.white}>
            نظافت منزل، با خیال راحت
          </AppText>
          <AppText variant="body" color={colors.teal[100]}>
            متخصص تأییدشده می‌آید. مبلغ را پیش از ثبت می‌بینید و تا پایان کار هزینه‌ای جلوتر
            نمی‌پردازید.
          </AppText>
          <Button
            fullWidth
            icon={ChevronLeft}
            iconPosition="end"
            label="شروع رزرو"
            onPress={onStartBooking}
            variant="inverse"
          />
        </View>

        <Card padded={false}>
          <View style={styles.trustRow}>
            {TRUST.map((item, index) => {
              const Icon = item.icon;
              return (
                <React.Fragment key={item.title}>
                  {index > 0 ? <View style={styles.trustRule} /> : null}
                  <View style={styles.trustItem}>
                    <Icon color={colors.teal[700]} size={18} strokeWidth={2.2} />
                    <AppText variant="caption" align="center">
                      {item.title}
                    </AppText>
                    <AppText variant="caption" align="center" color={colors.ink[500]}>
                      {item.caption}
                    </AppText>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </Card>

        <View style={styles.sectionHead}>
          <AppText variant="heading">چه خدمتی لازم است؟</AppText>
          <Pressable accessibilityRole="button" onPress={onStartBooking}>
            <AppText variant="caption" color={colors.teal[700]}>
              همه خدمات
            </AppText>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {chunkPairs(services).map((row) => (
            <View key={row[0].id} style={styles.serviceRow}>
              {row.map((service) => {
                const Icon = SERVICE_ICONS[service.id] ?? Sparkles;
                return (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    accessibilityLabel={service.title}
                    onPress={() => openService(service.id)}
                    style={({ pressed }) => [
                      styles.serviceCard,
                      row.length === 1 && styles.serviceCardSolo,
                      pressed && styles.servicePressed,
                    ]}
                  >
                    <View style={styles.serviceTop}>
                      <View style={styles.serviceIcon}>
                        <Icon color={colors.teal[700]} size={18} strokeWidth={2.2} />
                      </View>
                      {service.badge ? (
                        <View style={styles.badge}>
                          <AppText variant="caption" color={colors.teal[800]}>
                            {service.badge}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                    <AppText variant="label" numberOfLines={2}>
                      {service.title}
                    </AppText>
                    <AppText variant="caption" color={colors.ink[500]} numberOfLines={2}>
                      {service.subtitle || service.description}
                    </AppText>
                    <AppText variant="caption" color={colors.teal[700]}>
                      {priceLabel(service)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.recurring}>
          <View style={styles.recurringIcon}>
            <CalendarDays color={colors.amber[700]} size={20} strokeWidth={2.2} />
          </View>
          <View style={styles.recurringCopy}>
            <AppText variant="label">نظافت دوره‌ای</AppText>
            <AppText variant="caption" color={colors.ink[600]}>
              اگر تمیزی را منظم می‌خواهید، رزرو را از همین‌جا شروع کنید.
            </AppText>
          </View>
          <Button label="رزرو" onPress={onStartBooking} size="sm" variant="secondary" />
        </View>
      </ScrollView>
    </View>
  );
};

type CustomerHomeFrameProps = HomeScreenProps & {
  onOpenOrders?: () => void;
  onOpenProfile?: () => void;
};

/** Phone-shaped preview used by the web dashboard. Native uses its own shell tab bar. */
export function CustomerHomeFrame({
  onOpenOrders,
  onOpenProfile,
  ...homeProps
}: CustomerHomeFrameProps) {
  return (
    <View style={styles.frame}>
      <HomeScreen {...homeProps} />
      <BottomTabBar
        activeId="home"
        items={CUSTOMER_TAB_ITEMS}
        onChange={(id) => {
          if (id === 'home') return;
          if (id === 'book') homeProps.onStartBooking();
          if (id === 'orders') onOpenOrders?.();
          if (id === 'profile') onOpenProfile?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0, backgroundColor: colors.cream[50] },
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.cream[50] },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLockup: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: colors.teal[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellSpacer: { width: 40, height: 40 },
  greeting: { gap: 4 },
  hero: {
    backgroundColor: colors.teal[800],
    borderRadius: radii.xxl,
    padding: spacing.lg,
    gap: 10,
    overflow: 'hidden',
    ...shadows.lg,
  },
  heroOrb: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.teal[600],
    opacity: 0.45,
    top: -70,
    left: -40,
  },
  heroOrbSmall: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.teal[400],
    opacity: 0.25,
    bottom: -30,
    right: -10,
  },
  heroBadge: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trustRow: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  trustItem: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  trustRule: { width: 1, backgroundColor: colors.line, marginVertical: 6 },
  sectionHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  grid: { gap: 12 },
  serviceRow: { flexDirection: 'row-reverse', gap: 12 },
  serviceCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 6,
    minHeight: 156,
    ...shadows.sm,
  },
  serviceCardSolo: { flexGrow: 0, flexBasis: '48%', maxWidth: '48%' },
  servicePressed: { borderColor: colors.teal[300], backgroundColor: colors.teal[50] },
  serviceTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.teal[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: colors.cream[100],
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  recurring: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.sand,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cream[300],
    padding: 14,
  },
  recurringIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurringCopy: { flex: 1, gap: 2 },
});
