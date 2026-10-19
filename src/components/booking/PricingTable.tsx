import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from '../native/BottomSheetModal';
import { SERVICES_CATALOG } from '../../config/servicesData';
import type { PricingOptions } from '../../utils/pricing';
import type { CleaningService } from '../../types/service';
import { colors, fontFamily, ui, TOUCH_MIN } from '../../theme';

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
  <BottomSheetModal visible={visible} onRequestClose={onClose}>
    {(bottomInset) => (
    <View style={styles.backdrop}>
      <View style={[styles.modal, { paddingBottom: 20 + bottomInset }]}>
        <View style={styles.header}>
          <Text style={styles.heading}>جدول شفاف تعرفه‌ها</Text>
          <Pressable onPress={onClose} accessibilityLabel="بستن جدول تعرفه‌ها"><X size={20} color={colors.muted} /></Pressable>
        </View>
        <Text style={styles.subtitle}>این فهرست فقط نوع خدمت را انتخاب می‌کند. مبلغ را سرور اعلام می‌کند.</Text>
        {SCENARIOS.map((scenario) => {
          const service = SERVICES_CATALOG.find((item) => item.id === scenario.serviceId);
          if (!service) return null;
          return (
            <View key={scenario.title} style={styles.row}>
              <View style={styles.rowText}><Text style={styles.title}>{scenario.title}</Text><Text style={styles.serverPrice}>قیمت را سرور اعلام می‌کند</Text></View>
              <Pressable onPress={() => { onClose(); onSelect(service, scenario.options); }} style={styles.button}><Text style={styles.buttonText}>انتخاب و رزرو</Text></Pressable>
            </View>
          );
        })}
      </View>
    </View>
    )}
  </BottomSheetModal>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 20, gap: 12 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: colors.text, fontSize: 20, fontFamily: fontFamily.bold, textAlign: 'right' },
  subtitle: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 12, textAlign: 'right', lineHeight: 19 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: ui.divider },
  rowText: { flex: 1, gap: 4 },
  title: { color: colors.text, fontFamily: fontFamily.bold, textAlign: 'right' },
  serverPrice: { color: colors.muted, fontSize: 12, fontFamily: fontFamily.regular, textAlign: 'right' },
  button: { minHeight: TOUCH_MIN, backgroundColor: colors.tealSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  buttonText: { color: colors.tealDark, fontSize: 12, fontFamily: fontFamily.bold },
});
