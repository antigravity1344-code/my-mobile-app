import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../../theme/customerHome';
import { SERVICES_CATALOG } from '../../config/servicesData';
import { toPersianDigits } from '../../utils/jalaliDateOptions';
import { formatJalaliDateTime } from '../../utils/jalaliDisplay';
import { loadCustomerOffers } from './customerOffers';
import { offerDurationChoices } from './offerBookingDraft';
import { formatOfferPrice, tierLabel, type CustomerOffer } from './customerOffersModel';

const titleOf = (serviceId: string) => SERVICES_CATALOG.find((service) => service.id === serviceId)?.title || serviceId;
const percentOff = (bp: number) => Math.round((10000 - bp) / 100);

export function CustomerOffersScreen({ onBack, onBook }: { onBack: () => void; onBook: (offer: CustomerOffer) => void }) {
  const [offers, setOffers] = useState<CustomerOffer[] | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPhase('loading'); setMessage(null);
    const result = await loadCustomerOffers(controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null;
    if (!result.ok) { setPhase('error'); setMessage(result.message); return; }
    setOffers(result.offers.filter((offer) => offerDurationChoices(offer.startAt, offer.endAt, offer.quantity ?? 1).length > 0)); setPhase('ready');
  }, []);
  useEffect(() => { void load(); return () => { request.current?.abort(); request.current = null; }; }, [load]);
  return <ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.link}>بازگشت</Text></Pressable>
    <Text style={styles.title}>ساعت‌های پیشنهادی متخصصان</Text>
    <Text style={styles.note}>متخصصان ساعت‌های آزاد خود را با قیمت مشخص ثبت کرده‌اند. هر کدام را بخواهید رزرو کنید؛ سفارش مستقیماً برای همان متخصص ثبت می‌شود.</Text>
    {phase === 'loading' && <ActivityIndicator color={colors.teal} />}
    {phase === 'ready' && offers && !offers.length && <Text style={styles.note}>فعلاً هیچ متخصصی پیشنهادی ثبت نکرده است. می‌توانید سفارش عادی ثبت کنید.</Text>}
    {phase === 'ready' && offers?.map((offer) => {
      const off = percentOff(offer.adjustmentBasisPoints);
      return <View key={offer.id} style={styles.card}>
        <Text style={styles.heading}>{titleOf(offer.serviceId)}</Text>
        <Text style={styles.note}>
          {offer.worker.name} · درجه {tierLabel(offer.worker.tierKey)}
          {offer.worker.ratingAverage != null ? ` · ${toPersianDigits(offer.worker.ratingAverage.toFixed(1))} ستاره (${toPersianDigits(offer.worker.ratingCount)})` : ''}
        </Text>
        <Text style={styles.note}>{formatJalaliDateTime(offer.startAt, { withTime: true })} تا {toPersianDigits((formatJalaliDateTime(offer.endAt, { withTime: true }).split('،').pop() || '').trim())}</Text>
        {offer.total != null && <Text style={styles.price}>
          {formatOfferPrice(offer.total, offer.currencyUnit)}{offer.quantity && offer.quantity > 1 ? ` برای ${toPersianDigits(offer.quantity)} ساعت` : ''}
        </Text>}
        {off !== 0 && <Text style={off > 0 ? styles.good : styles.note}>{off > 0 ? `${toPersianDigits(off)}٪ ارزان‌تر از تعرفه` : `${toPersianDigits(-off)}٪ بالاتر از تعرفه (متخصص طلایی)`}</Text>}
        <Pressable accessibilityRole="button" onPress={() => onBook(offer)} style={styles.button}><Text style={styles.buttonText}>رزرو این ساعت</Text></Pressable>
      </View>;
    })}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.note}>{message}</Text>}
    {phase === 'error' && <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.link}>تلاش دوباره</Text></Pressable>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 }, title: { ...type.bold, fontSize: 22, textAlign: 'right', color: colors.text },
  note: { ...type.regular, textAlign: 'right', color: colors.muted, lineHeight: 24 }, heading: { ...type.semibold, textAlign: 'right', color: colors.text },
  link: { ...type.medium, textAlign: 'right', color: colors.teal }, price: { ...type.bold, fontSize: 18, textAlign: 'right', color: colors.text },
  good: { ...type.medium, textAlign: 'right', color: colors.teal },
  card: { padding: 14, gap: 6, borderWidth: 1, borderColor: colors.mutedLight, borderRadius: 12 },
  button: { backgroundColor: colors.teal, padding: 14, alignItems: 'center', borderRadius: 12, marginTop: 6 }, buttonText: { ...type.semibold, color: colors.white },
});
