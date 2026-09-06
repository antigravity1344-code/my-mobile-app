import { X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { calculatePrice, type PricingOptions } from '../../utils/pricing';
import type { CleaningService } from '../../types/service';

interface PricingTableProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (service: CleaningService, options: PricingOptions) => void;
}

const SCENARIOS: Array<{ title: string; serviceId: string; options: PricingOptions }> = [
  { title: 'منزل، ۴ ساعت', serviceId: 'home_unit_cleaning', options: { durationHours: 4 } },
  { title: 'راه‌پله، ۳ طبقه', serviceId: 'staircase_common_areas', options: { floors: 3, buildingAge: 'نوساز تا ۱۰ سال' } },
  { title: 'راه‌پله، ۵ طبقه با پارکینگ', serviceId: 'staircase_common_areas', options: { floors: 5, parking: true, buildingAge: 'نوساز تا ۱۰ سال' } },
  { title: 'مبل‌شویی، ۷ نفره', serviceId: 'sofa_carpet_washing', options: { sofaSeats: '۷ نفره', mattresses: 0 } },
];

export const PricingTable = ({ visible, onClose, onSelect }: PricingTableProps) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.heading}>جدول شفاف تعرفه‌ها</Text>
          <Pressable onPress={onClose} accessibilityLabel="بستن جدول تعرفه‌ها"><X size={20} color="#475569" /></Pressable>
        </View>
        <Text style={styles.subtitle}>مبالغ نمونه‌اند و قبل از پرداخت با جزئیات سفارش محاسبه می‌شوند.</Text>
        {SCENARIOS.map((scenario) => {
          const service = SERVICES_CATALOG.find((item) => item.id === scenario.serviceId);
          if (!service) return null;
          const durationHours = Number(scenario.options.durationHours ?? service.estimatedDurationHours ?? 4);
          const amount = calculatePrice(service, durationHours, scenario.options);
          return (
            <View key={scenario.title} style={styles.row}>
              <View style={styles.rowText}><Text style={styles.title}>{scenario.title}</Text><Text style={styles.amount}>{amount.toLocaleString('fa-IR')} تومان</Text></View>
              <Pressable onPress={() => { onClose(); onSelect(service, scenario.options); }} style={styles.button}><Text style={styles.buttonText}>انتخاب و رزرو</Text></Pressable>
            </View>
          );
        })}
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: '#0f172a', fontSize: 20, fontWeight: '800', textAlign: 'right' },
  subtitle: { color: '#64748b', fontSize: 12, textAlign: 'right', lineHeight: 19 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rowText: { flex: 1, gap: 4 },
  title: { color: '#0f172a', fontWeight: '700', textAlign: 'right' },
  amount: { color: '#059669', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  button: { backgroundColor: '#e0f2fe', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  buttonText: { color: '#0369a1', fontSize: 12, fontWeight: '800' },
});
