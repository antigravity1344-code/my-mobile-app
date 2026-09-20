import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { HelpCircle, Phone, MessageCircle, ChevronDown, ChevronUp, X, Send } from 'lucide-react-native';
import { appStorage } from '../../../utils/storage';
import { SUPPORT_FAQ, SUPPORT_HOURS, SUPPORT_PHONE, SUPPORT_TEL_URL } from '../supportConfig';

export interface SupportUser {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  user: SupportUser;
}

type SupportMessage = {
  id: string;
  userId: string;
  subject: string;
  body: string;
  createdAt: string;
  status: 'OPEN';
};

const storageKeyFor = (userId: string) => `paksho_support_messages_${userId}`;

export const NativeSupportScreen: React.FC<Props> = ({ user }) => {
  const [openFaqId, setOpenFaqId] = useState<string | null>(SUPPORT_FAQ[0]?.id ?? null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      if (!user?.id) {
        setMessages([]);
        setHydrated(true);
        return;
      }
      const saved = await appStorage.getItem<SupportMessage[]>(storageKeyFor(user.id), []);
      if (!alive) return;
      const scoped = Array.isArray(saved)
        ? saved.filter((m) => m && m.userId === user.id)
        : [];
      setMessages(scoped);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  React.useEffect(() => {
    if (!hydrated || !user?.id) return;
    void appStorage.setItem(storageKeyFor(user.id), messages);
  }, [messages, hydrated, user?.id]);

  const displayName = useMemo(() => user.name || 'کاربر پاکشو', [user.name]);

  const callSupport = () => {
    void Linking.openURL(SUPPORT_TEL_URL).catch(() => {
      Alert.alert('خطا', 'امکان برقراری تماس فراهم نشد.');
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
    const next: SupportMessage = {
      id: `sup_${Date.now()}`,
      userId: user.id,
      subject: subject.trim(),
      body: body.trim(),
      createdAt: new Date().toLocaleString('fa-IR'),
      status: 'OPEN',
    };
    setMessages((prev) => [next, ...prev]);
    setSubject('');
    setBody('');
    setError(null);
    setComposeOpen(false);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <HelpCircle size={22} color="#0284c7" />
          <Text style={styles.heroTitle}>پشتیبانی پاکشو</Text>
          <Text style={styles.heroSub}>
            {displayName} عزیز، سوال‌های متداول را ببینید یا با پشتیبانی تماس بگیرید.
          </Text>
          <Text style={styles.meta}>ساعات پاسخگویی: {SUPPORT_HOURS}</Text>
          <Text style={styles.meta}>شناسه شما: {user.id}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={callSupport} style={styles.primaryBtn}>
            <Phone size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>تماس با پشتیبانی</Text>
          </Pressable>
          <Pressable onPress={() => setComposeOpen(true)} style={styles.secondaryBtn}>
            <MessageCircle size={16} color="#0369a1" />
            <Text style={styles.secondaryBtnText}>ارسال پیام</Text>
          </Pressable>
        </View>
        <Text style={styles.phoneHint}>شماره: {SUPPORT_PHONE}</Text>

        <Text style={styles.sectionTitle}>سوالات متداول</Text>
        {SUPPORT_FAQ.map((item) => {
          const open = openFaqId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setOpenFaqId(open ? null : item.id)}
              style={[styles.faqCard, open && styles.faqOpen]}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQ}>{item.question}</Text>
                {open ? <ChevronUp size={16} color="#0284c7" /> : <ChevronDown size={16} color="#64748b" />}
              </View>
              {open ? <Text style={styles.faqA}>{item.answer}</Text> : null}
            </Pressable>
          );
        })}

        <Text style={styles.sectionTitle}>پیام‌های شما</Text>
        {messages.length === 0 ? (
          <Text style={styles.empty}>هنوز پیامی ثبت نشده است.</Text>
        ) : (
          messages.map((msg) => (
            <View key={msg.id} style={styles.msgCard}>
              <View style={styles.msgTop}>
                <Text style={styles.msgSubject}>{msg.subject}</Text>
                <Text style={styles.msgStatus}>باز</Text>
              </View>
              <Text style={styles.msgBody}>{msg.body}</Text>
              <Text style={styles.msgMeta}>{msg.createdAt}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>پیام به پشتیبانی</Text>
              <Pressable onPress={() => setComposeOpen(false)} style={styles.closeBtn}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.modalHint}>از طرف {displayName} · {user.phone}</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="موضوع"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="متن پیام"
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.textArea]}
              multiline
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={submitMessage} style={styles.primaryBtn}>
              <Send size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>ثبت پیام</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  hero: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 6, alignItems: 'flex-end' },
  heroTitle: { color: '#0f172a', fontWeight: '800', fontSize: 18 },
  heroSub: { color: '#475569', fontSize: 13, textAlign: 'right', lineHeight: 20 },
  meta: { color: '#94a3b8', fontSize: 11, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: 8 },
  primaryBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0284c7', borderRadius: 13, paddingVertical: 13 },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#e0f2fe', borderRadius: 13, paddingVertical: 13 },
  secondaryBtnText: { color: '#0369a1', fontWeight: '800' },
  phoneHint: { textAlign: 'right', color: '#64748b', fontSize: 12 },
  sectionTitle: { marginTop: 8, textAlign: 'right', color: '#0f172a', fontWeight: '800', fontSize: 15 },
  faqCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  faqOpen: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' },
  faqHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  faqQ: { flex: 1, textAlign: 'right', color: '#0f172a', fontWeight: '700', fontSize: 13 },
  faqA: { textAlign: 'right', color: '#475569', fontSize: 12, lineHeight: 20 },
  empty: { textAlign: 'right', color: '#64748b', fontSize: 12 },
  msgCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  msgTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  msgSubject: { color: '#0f172a', fontWeight: '800', fontSize: 13 },
  msgStatus: { color: '#047857', backgroundColor: '#ecfdf5', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontSize: 10, fontWeight: '700' },
  msgBody: { textAlign: 'right', color: '#475569', fontSize: 12, lineHeight: 19 },
  msgMeta: { textAlign: 'right', color: '#94a3b8', fontSize: 11 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#f8fafc', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  closeBtn: { padding: 6 },
  modalHint: { textAlign: 'right', color: '#64748b', fontSize: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: '#0f172a', textAlign: 'right' },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  error: { color: '#b91c1c', backgroundColor: '#fee2e2', padding: 10, borderRadius: 10, textAlign: 'right' },
});
