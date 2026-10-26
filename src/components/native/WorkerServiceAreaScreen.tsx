import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ServiceAreaCatalog } from '../../api/serviceAreas';
import { colors, type } from '../../theme/customerHome';
import { loadWorkerServiceArea, saveWorkerServiceArea, validAreaSelection, type WorkerServiceArea } from './workerServiceArea';
import { previewActive } from './previewRuntime';

export function WorkerServiceAreaScreen({ onBack }: { onBack: () => void }) {
  const [catalog, setCatalog] = useState<ServiceAreaCatalog | null>(null);
  const [saved, setSaved] = useState<WorkerServiceArea | null>(null);
  const [cityId, setCityId] = useState('');
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const request = useRef<AbortController | null>(null);
  const preview = previewActive();
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPhase('loading'); setMessage(null);
    const result = await loadWorkerServiceArea(controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    if (!result.ok) { setPhase('error'); setMessage(result.message); return; }
    setCatalog(result.catalog); setSaved(result.area);
    setCityId(result.area?.cityId || result.catalog.defaultCityId);
    setNeighborhoods(result.area?.neighborhoods || []);
    setReloadRequired(false); setPhase('ready');
  }, []);
  useEffect(() => { void load(); return () => { request.current?.abort(); request.current = null; }; }, [load]);
  const save = async () => {
    if (!catalog || request.current || preview || reloadRequired || phase !== 'ready' || !validAreaSelection(catalog, cityId, neighborhoods)) return;
    const controller = new AbortController(); request.current = controller;
    setPhase('saving'); setMessage(null);
    const result = await saveWorkerServiceArea({ cityId, neighborhoods, catalogVersion: catalog.version, expectedVersion: saved?.version || 0 }, controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null; setPhase('ready');
    if (!result.ok) { setReloadRequired(true); setMessage(result.message); return; }
    setSaved(result.area); setCatalog(result.catalog); setNeighborhoods(result.area?.neighborhoods || []);
    setMessage('محدوده فعالیت ذخیره شد.');
  };
  const editable = phase === 'ready' && !preview && !reloadRequired;
  const city = catalog?.cities.find(value => value.id === cityId);
  const outdated = neighborhoods.some(name => !city?.neighborhoods.includes(name));
  return <ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.link}>بازگشت به حساب متخصص</Text></Pressable>
    <Text style={styles.title}>محدوده فعالیت</Text>
    <Text style={styles.note}>یک شهر و محله‌هایی را که در آن‌ها کار می‌کنید انتخاب کنید. آدرس محل سکونت شما جداگانه ذخیره می‌شود.</Text>
    {preview && <Text style={styles.note}>این اطلاعات نمونه است؛ ذخیره در پیش‌نمایش غیرفعال است.</Text>}
    {!!saved && <Text style={styles.note}>محدوده ذخیره‌شده: {saved.cityName}؛ {saved.neighborhoods.join('، ')}</Text>}
    {phase === 'loading' && <ActivityIndicator color={colors.teal} />}
    {catalog && <>
      <Text style={styles.label}>شهر</Text>
      <ScrollView horizontal contentContainerStyle={styles.row}>
        {catalog.cities.map(value => <Pressable key={value.id} accessibilityRole="button" disabled={!editable}
          accessibilityState={{ selected: value.id === cityId, disabled: !editable }}
          onPress={() => { if (value.id !== cityId) { setCityId(value.id); setNeighborhoods([]); setMessage(null); } }}
          style={[styles.chip, value.id === cityId && styles.selected]}><Text style={styles.text}>{value.name}</Text></Pressable>)}
      </ScrollView>
      <Text style={styles.label}>محله‌ها؛ چند انتخاب مجاز است</Text>
      {!city?.neighborhoods.length && <Text style={styles.note}>مدیر هنوز محله‌ای برای این شهر ثبت نکرده است. پس از ثبت محله‌ها می‌توانید محدوده را ذخیره کنید.</Text>}
      {outdated && <Text style={styles.note}>فهرست محله‌ها تغییر کرده است. محدوده قبلی حفظ شده؛ محله‌های جاری را دوباره انتخاب کنید.</Text>}
      {outdated && <Pressable accessibilityRole="button" disabled={!editable} onPress={() => setNeighborhoods([])}><Text style={styles.link}>انتخاب دوباره محله‌ها</Text></Pressable>}
      <View style={styles.wrap}>{city?.neighborhoods.map(name => <Pressable key={name} accessibilityRole="checkbox" disabled={!editable}
        accessibilityState={{ checked: neighborhoods.includes(name), disabled: !editable }}
        onPress={() => { setNeighborhoods(current => current.includes(name) ? current.filter(value => value !== name) : [...current, name]); setMessage(null); }}
        style={[styles.chip, neighborhoods.includes(name) && styles.selected]}><Text style={styles.text}>{name}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" disabled={!editable || !validAreaSelection(catalog, cityId, neighborhoods)} onPress={() => void save()}
        style={[styles.button, (!editable || !validAreaSelection(catalog, cityId, neighborhoods)) && styles.disabled]}>
        {phase === 'saving' ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>ذخیره محدوده فعالیت</Text>}
      </Pressable>
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.note}>{message}</Text>}
    {(phase === 'error' || reloadRequired) && <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.link}>بازخوانی نتیجه و فهرست جاری</Text></Pressable>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 }, title: { ...type.bold, fontSize: 22, textAlign: 'right', color: colors.text },
  label: { ...type.semibold, textAlign: 'right', color: colors.text }, note: { ...type.regular, textAlign: 'right', color: colors.muted, lineHeight: 24 },
  link: { ...type.medium, textAlign: 'right', color: colors.teal }, row: { flexDirection: 'row-reverse', gap: 8 },
  wrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }, chip: { padding: 12, borderWidth: 1, borderColor: colors.mutedLight, borderRadius: 12 },
  selected: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, text: { ...type.medium, color: colors.text },
  button: { backgroundColor: colors.teal, padding: 14, alignItems: 'center', borderRadius: 12 }, buttonText: { ...type.semibold, color: colors.white }, disabled: { opacity: 0.5 },
});
