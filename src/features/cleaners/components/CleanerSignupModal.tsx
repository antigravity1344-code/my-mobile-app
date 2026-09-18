import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { CANCELLATION_RULES } from '../types/cleaner';
import { useCleaners } from '../hooks/useCleaners';

export const CleanerSignupModal: React.FC = () => {
  const {
    signupVisible,
    signupConsent,
    signupErrors,
    signupSuccess,
    closeSignup,
    toggleSignupRule,
    toggleIdentityCheck,
    submitSignupConsent,
  } = useCleaners();

  return (
    <Modal visible={signupVisible} animationType="slide" transparent onRequestClose={closeSignup}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={closeSignup} style={styles.closeBtn}>
              <X size={18} color="#334155" />
            </Pressable>
            <Text style={styles.headerTitle}>ثبت‌نام نظافتچی</Text>
            <View style={styles.closeBtn} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.intro}>
              ادامه ثبت‌نام و احراز هویت فقط پس از تایید همه قوانین لغو ممکن است. هیچ پیش‌فرضی تیک
              نخورده است.
            </Text>

            {CANCELLATION_RULES.map((rule) => {
              const accepted = signupConsent.acceptedRuleKeys.includes(rule.key);
              return (
                <Pressable
                  key={rule.key}
                  onPress={() => toggleSignupRule(rule.key)}
                  style={[styles.ruleCard, accepted && styles.ruleCardAccepted]}
                >
                  <View style={[styles.checkbox, accepted && styles.checkboxAccepted]}>
                    {accepted ? <Check size={14} color="#fff" /> : null}
                  </View>
                  <View style={styles.ruleCopy}>
                    <Text style={styles.ruleTitle}>{rule.title}</Text>
                    <Text style={styles.ruleDescription}>{rule.description}</Text>
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              onPress={toggleIdentityCheck}
              style={[styles.ruleCard, signupConsent.acceptedIdentityCheck && styles.ruleCardAccepted]}
            >
              <View
                style={[
                  styles.checkbox,
                  signupConsent.acceptedIdentityCheck && styles.checkboxAccepted,
                ]}
              >
                {signupConsent.acceptedIdentityCheck ? <Check size={14} color="#fff" /> : null}
              </View>
              <View style={styles.ruleCopy}>
                <Text style={styles.ruleTitle}>تایید فرآیند احراز هویت</Text>
                <Text style={styles.ruleDescription}>
                  بدون این تایید، پروفایل نظافتچی فعال و احراز هویت‌شده نمی‌شود.
                </Text>
              </View>
            </Pressable>

            {signupErrors.map((error) => (
              <Text key={error} style={styles.error}>
                {error}
              </Text>
            ))}

            {signupSuccess ? (
              <Text style={styles.success}>قوانین تایید شد. ادامه ثبت‌نام مجاز است.</Text>
            ) : null}

            <Pressable onPress={submitSignupConsent} style={styles.submitBtn}>
              <Text style={styles.submitBtnText}>بررسی تایید قوانین</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  intro: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'right',
    lineHeight: 20,
    marginBottom: 14,
  },
  ruleCard: {
    flexDirection: 'row-reverse',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  ruleCardAccepted: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxAccepted: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  ruleCopy: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
    marginBottom: 4,
  },
  ruleDescription: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
    lineHeight: 18,
  },
  error: {
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'right',
    marginBottom: 6,
  },
  success: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 10,
  },
  submitBtn: {
    marginTop: 8,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
