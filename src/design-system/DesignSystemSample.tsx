import { AppText } from './components/AppText';
import { BottomTabBar } from './components/BottomTabBar';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { ScreenHeader } from './components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from './components/StateViews';
import { TextField } from './components/TextField';
import { CUSTOMER_TAB_ITEMS } from './customerTabs';
import { colors, radii, spacing } from './tokens';

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Bell, ChevronLeft } from 'lucide-react-native';

export function DesignSystemSample() {
  const [name, setName] = useState('سارا محمدی');
  const [phone, setPhone] = useState('0912');
  const [tab, setTab] = useState('home');

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="سامانه طراحی پاکشو"
        subtitle="دکمه‌ها، کارت، ورودی و وضعیت‌ها"
        trailing={<Bell color={colors.teal[800]} size={18} />}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="caption" color={colors.ink[500]}>
          کاغذ کرم، جوهر سبزآبی، و قلم وزیرمتن. این صفحه فقط برای بازبینی اجزای مشترک است.
        </AppText>

        <View style={styles.row}>
          <Button label="ثبت سفارش" icon={ChevronLeft} iconPosition="end" />
          <Button label="جزئیات" variant="secondary" size="md" />
          <Button label="انصراف" variant="ghost" size="sm" />
          <Button label="خروج" variant="danger" size="sm" />
        </View>

        <TextField
          label="نام"
          value={name}
          onChangeText={setName}
          placeholder="نام و نام خانوادگی"
          helper="همان نامی که متخصص روی سفارش می‌بیند."
        />
        <TextField
          label="موبایل"
          value={phone}
          onChangeText={setPhone}
          placeholder="۰۹۱۲xxxxxxx"
          error="شماره را کامل وارد کنید."
          keyboardType="phone-pad"
        />

        <Card>
          <AppText variant="heading">کارت سفارش</AppText>
          <AppText variant="body" color={colors.ink[600]}>
            نظافت داخل منزل، فردا صبح. مبلغ را قبل از ثبت می‌بینید.
          </AppText>
          <AppText variant="label" color={colors.teal[700]}>
            ۱۵۰٬۰۰۰ تومان
          </AppText>
        </Card>

        <View style={styles.stateGrid}>
          <View style={styles.stateCell}>
            <EmptyState compact title="سفارشی نیست" description="اولین نظافت را رزرو کنید." />
          </View>
          <View style={styles.stateCell}>
            <LoadingState label="در حال هماهنگی" />
          </View>
          <View style={styles.stateCell}>
            <ErrorState compact message="موقعیت پیدا نشد. آدرس را دستی بنویسید." />
          </View>
        </View>
      </ScrollView>
      <BottomTabBar items={CUSTOMER_TAB_ITEMS} activeId={tab} onChange={setTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream[50] },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  stateGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  stateCell: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
});
