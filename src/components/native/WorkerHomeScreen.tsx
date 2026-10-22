import { ScrollView, StyleSheet, Text, View, Pressable, Image } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, shadowMd, shadowSm, space, type } from '../../theme/customerHome';
import {
  IconBell,
  IconHeadset,
  IconHeadsetCompact,
  IconPriceTag,
  IconShield,
  IconTabUser,
} from './icons/CustomerIcons';

type Props = {
  userName?: string;
  userAvatar?: string;
  onOpenProfile?: () => void;
  onOpenOrders?: () => void;
  onOpenNotifications?: () => void;
  onOpenSupport?: () => void;
};

const fa = {
  writingDirection: 'rtl' as const,
  includeFontPadding: false,
};

function profileInitial(name?: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0);
}

export function WorkerHomeScreen({
  userName,
  userAvatar,
  onOpenProfile,
  onOpenOrders,
  onOpenNotifications,
  onOpenSupport,
}: Props) {
  const avatarUri = (userAvatar || '').trim();
  const initial = profileInitial(userName);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* هدر */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="پروفایل"
          onPress={onOpenProfile}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : initial ? (
            <Text style={styles.avatarLetter}>{initial}</Text>
          ) : (
            <IconTabUser size={20} color={colors.teal} strokeWidth={1.7} />
          )}
        </Pressable>
        <Text style={styles.wordmark}>پاکشو متخصصین</Text>
        <View style={styles.headerSpacer} />
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="اعلان‌ها"
            onPress={onOpenNotifications}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <IconBell />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="پشتیبانی"
            onPress={onOpenSupport}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <IconHeadset />
          </Pressable>
        </View>
      </View>

      {/* کارت خوش‌آمدگویی */}
      <View style={styles.cta}>
        <View style={styles.ctaTone}>
          <Svg width="100%" height="100%" style={styles.fill}>
            <Defs>
              <LinearGradient id="workerHomeWelcome" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.06} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0.04} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#workerHomeWelcome)" />
            <Circle cx="8%" cy="12%" r="56" fill="#FFFFFF" fillOpacity={0.06} />
            <Circle cx="20%" cy="100%" r="40" fill="#FFFFFF" fillOpacity={0.04} />
          </Svg>
        </View>
        <Text style={styles.welcomeTitle}>
          سلام متخصص عزیز!
        </Text>
        <Text style={styles.welcomeDesc}>
          سفارش‌های جدید در انتظار شما هستند.
        </Text>
        <View style={styles.welcomeDivider} />
        <Text style={styles.welcomeHint}>برای مشاهده کارها روی «سفارش‌های جدید» بزنید ↓</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="مشاهده سفارش‌ها"
          onPress={onOpenOrders}
          style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}
        >
          <Text style={styles.ctaBtnText}>مشاهده سفارش‌ها</Text>
        </Pressable>
      </View>

      {/* بنر اعتماد */}
      <View style={styles.trustRow}>
        <View style={styles.trustItem}>
          <IconShield />
          <Text style={styles.trustText}>پشتیبانی پاکشو</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <IconPriceTag />
          <Text style={styles.trustText}>درآمد شفاف</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <IconHeadsetCompact />
          <Text style={styles.trustText}>پشتیبانی سریع</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: space.padX,
    paddingBottom: space.sm,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
  },
  avatarLetter: {
    ...type.bold,
    ...fa,
    fontSize: 16,
    lineHeight: 20,
    color: colors.teal,
    textAlign: 'center',
  },
  wordmark: {
    ...type.bold,
    ...fa,
    fontSize: 16,
    lineHeight: 24,
    color: colors.teal,
    textAlign: 'right',
  },
  headerSpacer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: space.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowSm,
  },
  cta: {
    backgroundColor: colors.teal,
    borderRadius: radius.card,
    minHeight: 152,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginBottom: 20,
    ...shadowMd,
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  ctaTone: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.card,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  welcomeTitle: {
    ...type.bold,
    ...fa,
    fontSize: 18,
    lineHeight: 26,
    color: colors.white,
    textAlign: 'right',
    marginBottom: 8,
  },
  welcomeDesc: {
    ...type.regular,
    ...fa,
    fontSize: 13.5,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'right',
  },
  welcomeDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginTop: 16,
    marginBottom: 12,
  },
  welcomeHint: {
    ...type.medium,
    ...fa,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
    marginBottom: 16,
  },
  ctaBtn: {
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.button,
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnText: {
    ...type.bold,
    ...fa,
    fontSize: 14,
    lineHeight: 20,
    color: colors.teal,
    textAlign: 'center',
  },
  trustRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.trust,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 12,
    gap: 6,
    ...shadowMd,
  },
  trustItem: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
  },
  trustText: {
    ...type.medium,
    ...fa,
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'right',
    textAlignVertical: 'center',
  },
  trustDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 2,
    backgroundColor: colors.border,
  },
  pressed: {
    opacity: 0.86,
  },
});
