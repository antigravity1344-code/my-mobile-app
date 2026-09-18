import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface EmptyCleanersStateProps {
  isSearching: boolean;
  onResetFilters: () => void;
}

export const EmptyCleanersState: React.FC<EmptyCleanersStateProps> = ({
  isSearching,
  onResetFilters,
}) => (
  <View style={styles.container}>
    <Text style={styles.title}>
      {isSearching ? 'نظافتچی‌ای با این جستجو پیدا نشد' : 'نظافتچی فعالی در این سطح نیست'}
    </Text>
    <Text style={styles.subtitle}>فیلتر یا عبارت جستجو را تغییر دهید و دوباره تلاش کنید.</Text>
    <Pressable onPress={onResetFilters} style={styles.button}>
      <Text style={styles.buttonText}>بازنشانی فیلترها</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
});
