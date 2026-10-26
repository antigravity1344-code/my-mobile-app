import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, type } from '../../theme/customerHome';
import { previewActive } from './previewRuntime';
import {
  initialAddressState, loadWorkerAddress, saveWorkerAddress, workerAddressReducer,
} from './workerAddress';

type Props = { name?: string; onLogout: () => void; onOpenArea: () => void; onOpenBank: () => void };

/** Specialist-only profile entry. Customer profile and onboarding are separate. */
export function WorkerAddressScreen({ name, onLogout, onOpenArea, onOpenBank }: Props) {
  const [state, dispatch] = useReducer(workerAddressReducer, initialAddressState);
  const request = useRef<AbortController | null>(null);
  const preview = previewActive();

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    dispatch({ type: 'load' });
    const result = await loadWorkerAddress(controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    dispatch({ type: 'loaded', result });
  }, []);

  useEffect(() => {
    void load();
    return () => { request.current?.abort(); request.current = null; };
  }, [load]);

  const save = async () => {
    if (request.current || state.phase !== 'ready' || state.sessionExpired || preview) return;
    const controller = new AbortController();
    request.current = controller;
    dispatch({ type: 'save' });
    const result = await saveWorkerAddress(state.draft, controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    dispatch({ type: 'saved', result });
  };

  const canEdit = state.phase === 'ready' && !state.sessionExpired && !preview;
  const canSave = canEdit && state.draft.trim() !== state.savedAddress;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>حساب متخصص</Text>
        {!!name && <Text style={styles.name}>{name}</Text>}
        <Pressable accessibilityRole="button" onPress={onOpenBank} style={styles.card}>
          <Text style={styles.heading}>شبا و رمز تغییر شبا</Text>
          <Text style={styles.description}>ثبت شبا و مدیریت رمز مخصوص آن</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpenArea} style={styles.card}>
          <Text style={styles.heading}>محدوده فعالیت</Text>
          <Text style={styles.description}>انتخاب شهر و محله‌های کاری</Text>
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.heading}>آدرس محل سکونت</Text>
          <Text style={styles.description}>آدرس کامل محل سکونت خود را وارد کنید.</Text>
          {preview && <Text style={styles.description}>این آدرس نمونه است؛ ذخیره در پیش‌نمایش غیرفعال است.</Text>}
          {state.phase === 'loading' ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.teal} />
              <Text style={styles.description}>در حال دریافت آدرس…</Text>
            </View>
          ) : state.savedAddress !== null ? (
            <>
              <TextInput
                accessibilityLabel="آدرس محل سکونت"
                style={styles.input}
                multiline
                textAlignVertical="top"
                editable={canEdit}
                value={state.draft}
                onChangeText={(value) => dispatch({ type: 'edit', value })}
                placeholder="آدرس محل سکونت"
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.description}>{state.draft.trim().length} / ۳۰۰</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave, busy: state.phase === 'saving' }}
                disabled={!canSave}
                onPress={() => void save()}
                style={[styles.button, !canSave && styles.disabled]}
              >
                {state.phase === 'saving' ? <ActivityIndicator color={colors.white} /> :
                  <Text style={styles.buttonText}>ذخیره آدرس</Text>}
              </Pressable>
            </>
          ) : null}
          {!!state.message && (
            <Text accessibilityLiveRegion="polite" style={[styles.message, state.error && styles.error]}>
              {state.message}
            </Text>
          )}
          {state.phase === 'loadError' && !state.sessionExpired && (
            <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.button}>
              <Text style={styles.buttonText}>تلاش دوباره</Text>
            </Pressable>
          )}
          {state.sessionExpired && <Text style={styles.description}>برای ادامه، از حساب خارج شوید و دوباره وارد شوید.</Text>}
        </View>
        <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logout}>
          <Text style={styles.logoutText}>خروج از حساب</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 16 },
  title: { ...type.bold, color: colors.text, fontSize: 22, textAlign: 'right' },
  name: { ...type.medium, color: colors.text, textAlign: 'right' },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 20, gap: 14 },
  heading: { ...type.bold, fontSize: 18, color: colors.text, textAlign: 'right' },
  description: { ...type.regular, color: colors.muted, textAlign: 'right', lineHeight: 24 },
  loading: { gap: 12, paddingVertical: 20 },
  input: {
    ...type.regular, color: colors.text, borderWidth: 1, borderColor: colors.mutedLight,
    borderRadius: 12, padding: 12, minHeight: 120, fontSize: 16, textAlign: 'right', writingDirection: 'rtl',
  },
  button: { backgroundColor: colors.teal, borderRadius: 12, padding: 14, alignItems: 'center', minHeight: 48 },
  disabled: { opacity: 0.5 },
  buttonText: { ...type.semibold, color: colors.white, fontSize: 16 },
  message: { ...type.medium, color: colors.tealDark, textAlign: 'right', lineHeight: 24 },
  error: { color: colors.dot },
  logout: { padding: 14, alignItems: 'center' },
  logoutText: { ...type.medium, color: colors.dot },
});
