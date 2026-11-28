import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { ADDONS, buildingOptions, calculateStaircase, NUMBER_LABELS, RATE_LABELS, SUPPLIES_NOTE, type Rates } from '../../../server/pricing/staircase';
import { normalizePersianDigits } from '../../utils/bookingValidation';
import { colors, fontFamily, ui } from '../../theme';
import type { BookingTimingErrors } from './bookingTimingValidation';

type Props = { confirmedTotal?: number; rates: Rates | null; values: Record<string, string | number | boolean>; change: (key: string, value: string | number | boolean) => void; errors?: BookingTimingErrors };
export function StaircaseForm({ rates, values, change, confirmedTotal, errors }: Props) {
  if (!rates) return <Text style={styles.text}>تعرفهٔ محاسباتی راه‌پله هنوز در دسترس نیست.</Text>;
  const options = buildingOptions(values);
  const price = calculateStaircase(rates, options);
  const amount = (n: number) => n.toLocaleString('fa-IR') + ' تومان';
  return <View style={styles.form}>
    <Text style={styles.title}>مشخصات ساختمان</Text>
    {Object.entries(NUMBER_LABELS).map(([key, label]) => <View key={key}>
      <Text style={[styles.text, styles.fieldLabel]}>{label}</Text>
      <TextInput accessibilityLabel={label} keyboardType="number-pad" value={String(options[key])} style={styles.input}
        onChangeText={text => { const digits = normalizePersianDigits(text.trim()); if (/^\d*$/.test(digits)) change(key, digits === '' ? '' : Number(digits)); }} />
      {errors?.[key as keyof BookingTimingErrors] && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{errors[key as keyof BookingTimingErrors]}</Text>}
    </View>)}
    {(['noLift', ...ADDONS] as const).map(key => {
      const isElevator = key === 'noLift';
      const label = isElevator ? 'آسانسور دارد؟' : RATE_LABELS[key] + ' (+' + amount(rates[key]) + ')';
      return <View key={key} accessibilityRole="radiogroup">
        <Text style={[styles.text, styles.fieldLabel]}>{label}</Text>
        <View style={styles.choices}>{[true, false].map(yes => {
          const value = isElevator ? !yes : yes;
          const selected = options[key] === value;
          return <Pressable key={String(yes)} accessibilityRole="radio" accessibilityState={{ checked: selected }}
            onPress={() => change(key, value)} style={[styles.check, styles.choice, selected && styles.checked]}>
            <Text style={styles.text}>{yes ? 'بله' : 'خیر'}</Text>
          </Pressable>;
        })}</View>
      </View>;
    })}
    <Text style={styles.text}>{SUPPLIES_NOTE}</Text>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: options.detergent === true }}
      onPress={() => change('detergent', !options.detergent)} style={[styles.check, options.detergent === true && styles.checked]}>
      <Text style={styles.text}>{options.detergent ? '☑ ' : '☐ '}درخواست {RATE_LABELS.detergent} (+{amount(rates.detergent)})</Text>
    </Pressable>
    <Text accessibilityLiveRegion="polite" style={styles.title}>{price ? (confirmedTotal == null ? 'برآورد خدمت: ' : 'مبلغ تأییدشده: ') + amount(confirmedTotal ?? price.total) : 'تعدادهای ساختمان را کامل کنید.'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  form: { gap: 10 }, title: { fontFamily: fontFamily.bold, textAlign: 'right', color: colors.text, fontSize: 16 },
  text: { fontFamily: fontFamily.regular, textAlign: 'right', color: colors.text, lineHeight: 23 },
  fieldLabel: { textAlign: 'center' },
  feedback: { fontFamily: fontFamily.regular, color: ui.dangerText, fontSize: 12, marginTop: 4, textAlign: 'right' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, textAlign: 'right' },
  check: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10 },
  choices: { flexDirection: 'row-reverse', gap: 8 }, choice: { flex: 1, alignItems: 'center' },
  checked: { backgroundColor: colors.tealSoft, borderColor: colors.tealDark },
});
