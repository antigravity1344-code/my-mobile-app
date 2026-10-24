import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { HelpCircle, Phone, MessageCircle, ChevronDown, ChevronUp, X, Send } from 'lucide-react-native';
import { BottomSheetModal } from '../../../components/native/BottomSheetModal';
import { RTL_SINGLE_LINE_INPUT } from '../../../components/native/rtlInput';
import { useSheetKeyboard } from '../../../components/native/useSheetKeyboard';
import { type } from '../../../theme';
import { colors as wc, radius as wr, shadowMd as wShadowMd, shadowSm as wShadowSm } from '../../../theme/customerHome';
import { apiFetch } from '../../../api/apiClient';
import { formatJalaliDateTime } from '../../../utils/jalaliDisplay';
import { SUPPORT_FAQ, SUPPORT_HOURS, WORKER_SUPPORT_FAQ, SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_URL } from '../supportConfig';
import { SUPPORT_GREETING, supportSenderLine } from '../supportGreeting';

export interface SupportUser {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  user: SupportUser;
  appearance?: 'customer' | 'worker';
}

type SupportMessage = {
  id: string;
  userId: string;
  subject: string;
  body: string;
  createdAt: string;
  status: 'OPEN';
};

export const NativeSupportScreen: React.FC<Props> = ({ user, appearance = 'customer' }) => {
  const workerAppearance = appearance === 'worker';
  const faqItems = appearance === 'worker' ? WORKER_SUPPORT_FAQ : SUPPORT_FAQ;
  const [openFaqId, setOpenFaqId] = useState<string | null>(faqItems[0]?.id ?? null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sheetKb = useSheetKeyboard(composeOpen);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);

  const loadMessages = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!user?.id) {
      if (!mounted.current) return;
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await apiFetch('/support/messages');
    if (!mounted.current || generation !== loadGeneration.current) return;
    const saved = Array.isArray(res.messages) ? res.messages : [];
    setMessages(saved.filter((m: SupportMessage) => m && m.userId === user.id));
    setError(res.success ? null : (res.message || 'دریافت پیام‌ها انجام نشد. لطفاً دوباره تلاش کنید.'));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    mounted.current = true;
    void loadMessages();
    const pendingLoads = loadGeneration;
    return () => {
      mounted.current = false;
      pendingLoads.current++;
    };
  }, [loadMessages]);

  // After a successful send the sheet closes and the page scrolls to «پیام‌های شما», where the new
  // message is the first item (the list sits below the FAQ, out of view on most phones).
  const pageScrollRef = useRef<ScrollView>(null);
  const messagesYRef = useRef(0);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    },
    [],
  );
  const senderLine = supportSenderLine(user.phone);

  const callSupport = () => {
    void Linking.openURL(SUPPORT_TEL_URL).catch(() => {
      Alert.alert('خطا', 'تماس برقرار نشد.');
    });
  };

  const submitMessage = () => {
    if (!user?.id) {
      setError('برای ارسال پیام باید وارد حساب شده باشید.');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setError('موضوع و متن پیام الزامی است.');
      return;
    }
    void (async () => {
      const res = await apiFetch('/support/messages', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      if (!res.success || !res.message) {
        setError(res.message || 'ارسال پیام انجام نشد. لطفاً دوباره تلاش کنید.');
        return;
      }
      setMessages((prev) => [res.message as SupportMessage, ...prev]);
      setSubject('');
      setBody('');
      setError(null);
      Keyboard.dismiss();
      setComposeOpen(false);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        pageScrollRef.current?.scrollTo({ y: Math.max(0, messagesYRef.current - 8), animated: true });
      }, 350);
    })();
  };

  return (
    <View style={[styles.root, workerAppearance && workerStyles.root]}>
      <ScrollView ref={pageScrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, workerAppearance && workerStyles.hero]}>
          <HelpCircle size={22} color={workerAppearance ? wc.teal : '#0284c7'} />
          <Text style={[styles.heroTitle, workerAppearance && workerStyles.heroTitle]}>پشتیبانی پاکشو</Text>
          <Text style={[styles.heroSub, workerAppearance && workerStyles.heroSub]}>{SUPPORT_GREETING}</Text>
          <Text style={[styles.meta, workerAppearance && workerStyles.meta]}>ساعات پاسخگویی: {SUPPORT_HOURS}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={callSupport} style={[styles.primaryBtn, workerAppearance && workerStyles.primaryBtn]}>
            <Phone size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>تماس با پشتیبانی</Text>
          </Pressable>
          <Pressable onPress={() => setComposeOpen(true)} style={[styles.secondaryBtn, workerAppearance && workerStyles.secondaryBtn]}>
            <MessageCircle size={16} color={workerAppearance ? wc.teal : '#0369a1'} />
            <Text style={[styles.secondaryBtnText, workerAppearance && workerStyles.secondaryBtnText]}>ارسال پیام</Text>
          </Pressable>
        </View>
        <Text style={[styles.phoneHint, workerAppearance && workerStyles.phoneHint]}>شماره: {SUPPORT_PHONE_DISPLAY}</Text>

        <Text style={[styles.sectionTitle, workerAppearance && workerStyles.sectionTitle]}>سوالات متداول</Text>
        {faqItems.map((item) => {
          const open = openFaqId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setOpenFaqId(open ? null : item.id)}
              style={[styles.faqCard, workerAppearance && workerStyles.faqCard, open && styles.faqOpen, open && workerAppearance && workerStyles.faqOpen]}
            >
              <View style={styles.faqHeader}>
                <Text style={[styles.faqQ, workerAppearance && workerStyles.textMain]}>{item.question}</Text>
                {open ? <ChevronUp size={16} color={workerAppearance ? wc.teal : '#0284c7'} /> : <ChevronDown size={16} color="#64748b" />}
              </View>
              {open ? <Text style={[styles.faqA, workerAppearance && workerStyles.textMuted]}>{item.answer}</Text> : null}
            </Pressable>
          );
        })}

        <Text
          style={[styles.sectionTitle, workerAppearance && workerStyles.sectionTitle]}
          onLayout={(e) => {
            messagesYRef.current = e.nativeEvent.layout.y;
          }}
        >
          پیام‌های شما
        </Text>
        {error && !composeOpen ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => void loadMessages()} style={styles.retry} accessibilityRole="button" disabled={loading} accessibilityState={{ disabled: loading }}>
              <Text style={styles.retryText}>تلاش دوباره</Text>
            </Pressable>
          </View>
        ) : null}
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={workerAppearance ? wc.teal : '#0f766e'} />
            <Text style={[styles.empty, workerAppearance && workerStyles.empty]}>در حال دریافت پیام‌ها...</Text>
          </View>
        ) : !error && messages.length === 0 ? (
          <Text style={[styles.empty, workerAppearance && workerStyles.empty]}>هنوز پیامی ثبت نشده است.</Text>
        ) : (
          messages.map((msg) => (
            <View key={msg.id} style={[styles.msgCard, workerAppearance && workerStyles.msgCard]}>
              <View style={styles.msgTop}>
                <Text style={[styles.msgSubject, workerAppearance && workerStyles.textMain]}>{msg.subject}</Text>
                <Text style={[styles.msgStatus, workerAppearance && workerStyles.msgStatus]}>در انتظار پاسخ</Text>
              </View>
              <Text style={[styles.msgBody, workerAppearance && workerStyles.textMuted]}>{msg.body}</Text>
              <Text style={[styles.msgMeta, workerAppearance && workerStyles.meta]}>{formatJalaliDateTime(msg.createdAt, { withTime: true })}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <BottomSheetModal visible={composeOpen} onRequestClose={() => setComposeOpen(false)}>
        {(bottomInset) => {
        const sheetLayout = sheetKb.layout(bottomInset);
        return (
        <KeyboardAvoidingView
          style={[styles.modalOverlay, { paddingBottom: sheetLayout.liftBottom }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          onLayout={sheetKb.onOverlayLayout}
        >
          <View style={[styles.modalCard, workerAppearance && workerStyles.modalCard, { paddingBottom: 16 + sheetLayout.contentBottomInset }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, workerAppearance && workerStyles.textMain]}>پیام به پشتیبانی</Text>
              <Pressable onPress={() => setComposeOpen(false)} style={styles.closeBtn}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>
            {senderLine ? <Text style={styles.modalHint}>{supportSenderLine(user.phone)}</Text> : null}
            <TextInput
              {...RTL_SINGLE_LINE_INPUT}
              value={subject}
              onChangeText={setSubject}
              placeholder="موضوع"
              placeholderTextColor="#94a3b8"
              style={[styles.input, workerAppearance && workerStyles.input]}
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="متن پیام"
              placeholderTextColor="#94a3b8"
              style={[styles.input, workerAppearance && workerStyles.input, styles.textArea]}
              multiline
            />
            {error ? <Text style={[styles.error, styles.modalError]}>{error}</Text> : null}
            <Pressable onPress={submitMessage} style={[styles.primaryBtn, workerAppearance && workerStyles.primaryBtn, styles.submitBtn]}>
              <Send size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>ثبت پیام</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        );
        }}
      </BottomSheetModal>
    </View>
  );
};

const workerStyles = StyleSheet.create({
  root: { backgroundColor: wc.bg },
  hero: { backgroundColor: wc.white, borderRadius: 20, padding: 20, borderColor: wc.border, ...wShadowMd },
  heroTitle: { color: wc.text },
  heroSub: { color: wc.muted },
  meta: { color: wc.mutedLight },
  textMain: { color: wc.text },
  textMuted: { color: wc.muted },
  primaryBtn: { backgroundColor: wc.teal, borderRadius: wr.button, ...wShadowSm },
  secondaryBtn: { backgroundColor: wc.tealSoft, borderRadius: wr.button },
  secondaryBtnText: { color: wc.tealDark },
  phoneHint: { color: wc.muted },
  sectionTitle: { color: wc.text },
  empty: { color: wc.muted },
  faqCard: { backgroundColor: wc.white, borderRadius: wr.card, padding: 16, minHeight: 44, borderColor: wc.border, ...wShadowSm },
  faqOpen: { backgroundColor: wc.white, borderColor: wc.teal },
  msgCard: { backgroundColor: wc.white, borderRadius: wr.card, padding: 16, borderColor: wc.border, ...wShadowSm },
  msgStatus: { color: wc.tealDark, backgroundColor: wc.tealSoft },
  modalCard: { backgroundColor: wc.bg },
  input: { backgroundColor: wc.white, borderRadius: wr.button, minHeight: 48, borderColor: 'rgba(31, 42, 40, 0.12)', color: wc.text },
});

const fa = {
  writingDirection: 'rtl' as const,
  includeFontPadding: false,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  hero: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 6, alignItems: 'flex-end' },
  heroTitle: { ...type.bold, ...fa, fontWeight: '400', color: '#0f172a', fontSize: 18, textAlign: 'right' },
  heroSub: { ...type.regular, ...fa, fontWeight: '400', color: '#475569', fontSize: 13, textAlign: 'right', lineHeight: 20 },
  meta: { ...type.regular, ...fa, fontWeight: '400', color: '#94a3b8', fontSize: 11, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: 8 },
  primaryBtn: { flex: 1, minHeight: 48, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0284c7', borderRadius: 13, paddingVertical: 13 },
  primaryBtnText: { ...type.bold, ...fa, fontWeight: '400', color: '#fff' },
  submitBtn: { flex: 0, minHeight: 48 },
  secondaryBtn: { flex: 1, minHeight: 48, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#e0f2fe', borderRadius: 13, paddingVertical: 13 },
  secondaryBtnText: { ...type.bold, ...fa, fontWeight: '400', color: '#0369a1' },
  phoneHint: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#64748b', fontSize: 12 },
  sectionTitle: { ...type.bold, ...fa, fontWeight: '400', marginTop: 8, textAlign: 'right', color: '#0f172a', fontSize: 15 },
  faqCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  faqOpen: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' },
  faqHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  faqQ: { ...type.bold, ...fa, fontWeight: '400', flex: 1, textAlign: 'right', color: '#0f172a', fontSize: 13 },
  faqA: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#475569', fontSize: 12, lineHeight: 20 },
  empty: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#64748b', fontSize: 12 },
  loadingRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  msgCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  msgTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  msgSubject: { ...type.bold, ...fa, fontWeight: '400', color: '#0f172a', fontSize: 13, textAlign: 'right', flex: 1 },
  msgStatus: { ...type.bold, ...fa, fontWeight: '400', color: '#047857', backgroundColor: '#ecfdf5', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontSize: 10 },
  msgBody: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#475569', fontSize: 12, lineHeight: 19 },
  msgMeta: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#94a3b8', fontSize: 11 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#f8fafc', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { ...type.bold, ...fa, fontWeight: '400', color: '#0f172a', fontSize: 16, textAlign: 'right' },
  closeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modalHint: { ...type.regular, ...fa, fontWeight: '400', textAlign: 'right', color: '#64748b', fontSize: 12 },
  input: { ...type.regular, ...fa, fontWeight: '400', backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: '#0f172a', textAlign: 'right' },
  textArea: { minHeight: 110, maxHeight: 160, textAlignVertical: 'top' },
  errorBox: { backgroundColor: '#fee2e2', padding: 10, borderRadius: 10, gap: 8 },
  error: { ...type.regular, ...fa, fontWeight: '400', color: '#b91c1c', textAlign: 'right' },
  modalError: { backgroundColor: '#fee2e2', padding: 10, borderRadius: 10 },
  retry: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  retryText: { ...type.bold, ...fa, fontWeight: '400', color: '#0f766e', textAlign: 'right' },
});
