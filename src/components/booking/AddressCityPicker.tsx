import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { defaultCityForBlankAddress, loadServiceAreaCatalog, type CityAddress, type ServiceAreaCatalog, type ServiceCity } from '../../api/serviceAreas';
import { colors, type } from '../../theme/customerHome';

type Props = { value: CityAddress; onSelectCity: (city: ServiceCity) => void; onSelectDistrict: (name: string) => void };
/** Shared by web and native address forms; old addresses never acquire a guessed city. */
export function AddressCityPicker({ value, onSelectCity, onSelectDistrict }: Props) {
  const [catalog, setCatalog] = useState<ServiceAreaCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { cityId, city, district, fullAddress } = value;
  const retry = useCallback(() => setAttempt(count => count + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void loadServiceAreaCatalog(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setCatalog(result.catalog); setError(result.message); setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const initial = defaultCityForBlankAddress({ cityId, city, district, fullAddress }, catalog);
    if (initial) onSelectCity(initial);
  }, [catalog, cityId, city, district, fullAddress, onSelectCity]);
  const selected = catalog?.cities.find(city => city.id === value.cityId);
  const neighborhoods = selected?.neighborhoods.filter(name => name.includes(value.district?.trim() || '')) || [];
  return <View style={styles.block}>
    <Text style={styles.label}>شهر</Text>
    {!!value.city && <Text style={styles.note}>شهر این نشانی: {value.city}</Text>}
    {!value.city && !!(value.district || value.fullAddress) && <Text style={styles.note}>شهر این نشانی قبلاً ثبت نشده است؛ می‌توانید آن را انتخاب کنید.</Text>}
    {loading && <ActivityIndicator color={colors.teal} />}
    {!!error && <><Text style={styles.note}>{error}</Text><Pressable accessibilityRole="button" onPress={retry}><Text style={styles.link}>تلاش دوباره</Text></Pressable></>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
      {catalog?.cities.map(city => <Pressable key={city.id} accessibilityRole="button" accessibilityState={{ selected: city.id === value.cityId }}
        aria-pressed={city.id === value.cityId}
        onPress={() => { if (city.id !== value.cityId || city.name !== value.city) onSelectCity(city); }} style={[styles.chip, city.id === value.cityId && styles.selected]}><Text style={styles.text}>{city.name}</Text></Pressable>)}
    </ScrollView>
    {!!selected && !selected.neighborhoods.length && <Text style={styles.note}>محله‌ای برای این شهر ثبت نشده است؛ نام محله را در فرم وارد کنید.</Text>}
    {!!neighborhoods.length && <><Text style={styles.note}>محله‌های ثبت‌شده</Text><ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
      {neighborhoods.map(name => <Pressable key={name} accessibilityRole="button" onPress={() => onSelectDistrict(name)} style={[styles.chip, value.district === name && styles.selected]}><Text style={styles.text}>{name}</Text></Pressable>)}
    </ScrollView></>}
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: 8 }, label: { ...type.semibold, textAlign: 'right', color: colors.text },
  note: { ...type.regular, textAlign: 'right', color: colors.muted, lineHeight: 22 },
  row: { flexDirection: 'row-reverse', gap: 8 }, chip: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.mutedLight },
  selected: { backgroundColor: colors.tealSoft, borderColor: colors.teal }, text: { ...type.medium, color: colors.text }, link: { ...type.medium, color: colors.teal },
});
