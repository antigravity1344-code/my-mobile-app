import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import {
  Briefcase,
  MapPin,
  Clock,
  CheckCircle,
  Phone,
  User,
} from 'lucide-react-native';
import { useOrders } from '../../features/orders';
import { useBooking } from '../../context/BookingContext';

export type SpecialistCategory = 'all' | 'cleaner' | 'hourly_laborer' | 'painter' | 'sofa_cleaner';

interface NativeOrder {
  id: string;
  serviceTitle: string;
  category: SpecialistCategory;
  badge: string;
  customerName: string;
  phone: string;
  district: string;
  address: string;
  date: string;
  timeSlot: string;
  wageTotal: number;
  paymentMethod: 'ONLINE' | 'CASH';
  detailsNote: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
}

interface NativeWorkerPortalProps {
  onSwitchToCustomer?: () => void;
  onLogout?: () => void;
}

export const NativeWorkerPortal: React.FC<NativeWorkerPortalProps> = ({
  onSwitchToCustomer,
  onLogout,
}) => {
  const { updateOrderStatus } = useOrders();
  const { paymentReceipt, selectedService, addressDetails, selectedDate, selectedTimeSlot } = useBooking();

  const [activeCategory, setActiveCategory] = useState<SpecialistCategory>('all');
  const [activeTab, setActiveTab] = useState<'available' | 'my_jobs'>('available');
  const [acceptedOrderIds, setAcceptedOrderIds] = useState<string[]>([]);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);

  const dynamicDate = selectedDate
    ? `${selectedDate.dayOfWeek} ${selectedDate.dayOfMonth} ${selectedDate.monthName}`
    : 'امروز - ۲۷ شهریور';

  const defaultOrders: NativeOrder[] = [
    {
      id: paymentReceipt ? paymentReceipt.orderId : 'ORD-9041',
      serviceTitle: selectedService?.title || 'نظافت داخل منزل / واحد',
      category: 'cleaner',
      badge: 'ساعتی',
      customerName: addressDetails.recipientName || 'علی رضایی',
      phone: addressDetails.contactPhone || '09123456789',
      district: addressDetails.district || 'سعادت‌آباد',
      address: addressDetails.fullAddress || 'خیابان سرو، پلاک ۲۴، واحد ۳',
      date: dynamicDate,
      timeSlot: selectedTimeSlot?.label || '۱۰:۰۰ تا ۱۲:۰۰ (صبح)',
      wageTotal: paymentReceipt ? Math.round(paymentReceipt.amountInRials / 10) : 600000,
      paymentMethod: 'ONLINE',
      detailsNote: '۴ ساعت کار، نظافت عادی آشپزخانه و پذیرایی',
      status: 'OPEN',
    },
    {
      id: 'ORD-8812',
      serviceTitle: 'کارگر ساعتی (جابجایی اثاثیه و تخلیه انبار)',
      category: 'hourly_laborer',
      badge: 'ساعتی',
      customerName: 'محمد کاظمی',
      phone: '09129876543',
      district: 'شهرک غرب',
      address: 'بلوار دادمان، خیابان درختی، پلاک ۱۲',
      date: 'فردا - ۲۸ شهریور',
      timeSlot: '۰۸:۰۰ تا ۱۱:۰۰ (صبح زود)',
      wageTotal: 440000,
      paymentMethod: 'ONLINE',
      detailsNote: 'جابجایی کارتن‌های وسایل با آسانسور',
      status: 'OPEN',
    },
    {
      id: 'ORD-7734',
      serviceTitle: 'نقاشی ساختمان و بتونه‌کاری',
      category: 'painter',
      badge: 'متراژی',
      customerName: 'رضا حدادی',
      phone: '09351112233',
      district: 'نیاوران',
      address: 'خیابان باهنر، کوچه یاس، پلاک ۸',
      date: 'شنبه - ۲۹ شهریور',
      timeSlot: '۰۹:۰۰ تا ۱۷:۰۰ (تمام وقت)',
      wageTotal: 5100000,
      paymentMethod: 'CASH',
      detailsNote: 'رنگ وینیل ضدآب برای سالن پذیرایی',
      status: 'OPEN',
    },
    {
      id: 'ORD-6651',
      serviceTitle: 'مبل‌شویی و شستشوی تشک در محل',
      category: 'sofa_cleaner',
      badge: 'تعدادی',
      customerName: 'سارا نوری',
      phone: '09127778899',
      district: 'ونک',
      address: 'خیابان ملاصدرا، پلاک ۴۵، واحد ۲',
      date: 'یکشنبه - ۳۰ شهریور',
      timeSlot: '۱۱:۰۰ تا ۱۴:۰۰ (ظهر)',
      wageTotal: 850000,
      paymentMethod: 'ONLINE',
      detailsNote: 'مبل ۷ نفره استیل با دستگاه خشک‌کن',
      status: 'OPEN',
    },
  ];

  const handleAcceptOrder = (order: NativeOrder) => {
    if (acceptedOrderIds.includes(order.id)) return;

    setAcceptedOrderIds(prev => [...prev, order.id]);
    updateOrderStatus(order.id, 'IN_PROGRESS', 'متخصص تاییدشده پاکشو');
    setSuccessAlert(`سفارش شماره ${order.id} با موفقیت به نام شما پذیرفته شد.`);
    setTimeout(() => setSuccessAlert(null), 5000);
  };

  const handleCallCustomer = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const filteredOrders = defaultOrders.filter(order => {
    if (activeCategory === 'all') return true;
    return order.category === activeCategory;
  });

  const availableOrders = filteredOrders.filter(o => !acceptedOrderIds.includes(o.id));
  const myAcceptedOrders = defaultOrders.filter(o => acceptedOrderIds.includes(o.id));

  return (
    <View style={styles.container}>
      {/* هدر بالای کارتابل کارگر */}
      <View style={styles.headerBar}>
        <View style={styles.workerProfile}>
          <View style={styles.avatarBox}>
            <Briefcase size={22} color="#fff" />
          </View>
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.workerName}>پنل کارگر و متخصص</Text>
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>آماده کار</Text>
              </View>
            </View>
            <Text style={styles.workerSub}>مشاهده و پذیرش مستقیم سفارشات مشتریان</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {onSwitchToCustomer && (
            <Pressable onPress={onSwitchToCustomer} style={styles.switchButton}>
              <User size={14} color="#0284c7" />
              <Text style={styles.switchButtonText}>نمای مشتری</Text>
            </Pressable>
          )}
          {onLogout && (
            <Pressable onPress={onLogout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>خروج</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* پیام تایید موفقیت */}
      {successAlert && (
        <View style={styles.alertSuccess}>
          <CheckCircle size={18} color="#059669" />
          <Text style={styles.alertSuccessText}>{successAlert}</Text>
        </View>
      )}

      {/* تب سوییچ بین سفارش‌های باز و سفارش‌های من */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab('available')}
          style={[styles.tabItem, activeTab === 'available' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            سفارش‌های جدید ({availableOrders.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('my_jobs')}
          style={[styles.tabItem, activeTab === 'my_jobs' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'my_jobs' && styles.tabTextActive]}>
            کارهای من ({myAcceptedOrders.length})
          </Text>
        </Pressable>
      </View>

      {/* دسته‌بندی تخصص‌ها در حالت سفارش‌های جدید */}
      {activeTab === 'available' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {[
            { id: 'all', label: 'همه تخصص‌ها' },
            { id: 'cleaner', label: 'نظافتچی منزل' },
            { id: 'hourly_laborer', label: 'کارگر ساعتی' },
            { id: 'painter', label: 'نقاش ساختمان' },
            { id: 'sofa_cleaner', label: 'مبل‌شویی' },
          ].map(cat => (
            <Pressable
              key={cat.id}
              onPress={() => setActiveCategory(cat.id as SpecialistCategory)}
              style={[
                styles.categoryChip,
                activeCategory === cat.id && styles.categoryChipActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  activeCategory === cat.id && styles.categoryChipTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* لیست کارت‌های سفارش */}
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'available' ? (
          availableOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <CheckCircle size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>سفارش بازی در این تخصص موجود نیست</Text>
              <Text style={styles.emptyDesc}>به محض ثبت سفارش جدید توسط مشتری، در این بخش نمایش داده می‌شود.</Text>
            </View>
          ) : (
            availableOrders.map(order => (
              <View key={order.id} style={styles.orderCard}>
                {/* هدر کارت */}
                <View style={styles.cardTop}>
                  <View style={styles.badgeBox}>
                    <Text style={styles.badgeText}>{order.badge}</Text>
                  </View>
                  <View style={styles.titleArea}>
                    <Text style={styles.serviceTitle}>{order.serviceTitle}</Text>
                    <Text style={styles.orderId}>کد سفارش: {order.id}</Text>
                  </View>
                </View>

                {/* اطلاعات سفارش */}
                <View style={styles.infoRow}>
                  <MapPin size={16} color="#0284c7" />
                  <Text style={styles.infoText}>
                    <Text style={styles.boldText}>{order.district}: </Text>
                    {order.address}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Clock size={16} color="#0284c7" />
                  <Text style={styles.infoText}>{order.date} | {order.timeSlot}</Text>
                </View>

                <View style={styles.infoRow}>
                  <User size={16} color="#0284c7" />
                  <Text style={styles.infoText}>مشتری: {order.customerName}</Text>
                </View>

                {order.detailsNote ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteText}>توضیحات: {order.detailsNote}</Text>
                  </View>
                ) : null}

                {/* بخش دستمزد و دکمه پذیرش */}
                <View style={styles.cardFooter}>
                  <View style={styles.wageBox}>
                    <Text style={styles.wageLabel}>دستمزد کارگر:</Text>
                    <Text style={styles.wageValue}>{order.wageTotal.toLocaleString('fa-IR')} تومان</Text>
                  </View>

                  <Pressable
                    onPress={() => handleAcceptOrder(order)}
                    style={styles.acceptButton}
                  >
                    <CheckCircle size={16} color="#fff" />
                    <Text style={styles.acceptButtonText}>پذیرش سفارش و اعزام</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )
        ) : (
          myAcceptedOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Briefcase size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>هنوز سفارشی را نپذیرفته‌اید</Text>
              <Text style={styles.emptyDesc}>از برگه «سفارش‌های جدید»، سفارش‌های دلخواه خود را بررسی و قبول کنید.</Text>
            </View>
          ) : (
            myAcceptedOrders.map(order => (
              <View key={order.id} style={[styles.orderCard, styles.myJobCard]}>
                <View style={styles.cardTop}>
                  <View style={styles.inProgressBadge}>
                    <Text style={styles.inProgressBadgeText}>در حال انجام</Text>
                  </View>
                  <View style={styles.titleArea}>
                    <Text style={styles.serviceTitle}>{order.serviceTitle}</Text>
                    <Text style={styles.orderId}>کد سفارش: {order.id}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <MapPin size={16} color="#059669" />
                  <Text style={styles.infoText}>
                    <Text style={styles.boldText}>{order.district}: </Text>
                    {order.address}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Clock size={16} color="#059669" />
                  <Text style={styles.infoText}>{order.date} | {order.timeSlot}</Text>
                </View>

                <View style={styles.actionButtonsRow}>
                  <Pressable
                    onPress={() => handleCallCustomer(order.phone)}
                    style={styles.callButton}
                  >
                    <Phone size={16} color="#fff" />
                    <Text style={styles.callButtonText}>تماس با مشتری ({order.phone})</Text>
                  </Pressable>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.wageBox}>
                    <Text style={styles.wageLabel}>مبلغ تسویه:</Text>
                    <Text style={styles.wageValue}>{order.wageTotal.toLocaleString('fa-IR')} تومان</Text>
                  </View>
                  <View style={styles.acceptedTag}>
                    <CheckCircle size={14} color="#059669" />
                    <Text style={styles.acceptedTagText}>تایید شده توسط شما</Text>
                  </View>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  headerBar: {
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
  },
  workerProfile: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'right',
  },
  onlineBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  onlineText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
  },
  workerSub: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'right',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  switchButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  switchButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  logoutButtonText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
  },
  alertSuccess: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
  },
  alertSuccessText: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  tabBar: {
    flexDirection: 'row-reverse',
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: '#059669',
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row-reverse',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  categoryChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  emptyBox: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyDesc: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  myJobCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  cardTop: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
  },
  titleArea: {
    flex: 1,
    alignItems: 'flex-end',
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },
  orderId: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  badgeBox: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    color: '#0369a1',
    fontSize: 10,
    fontWeight: '700',
  },
  inProgressBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  inProgressBadgeText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
    flex: 1,
  },
  boldText: {
    fontWeight: '700',
    color: '#0f172a',
  },
  noteBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  noteText: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'right',
  },
  actionButtonsRow: {
    marginTop: 4,
    marginBottom: 10,
  },
  callButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 10,
  },
  callButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    marginTop: 4,
  },
  wageBox: {
    alignItems: 'flex-end',
  },
  wageLabel: {
    fontSize: 10,
    color: '#64748b',
  },
  wageValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
  },
  acceptButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  acceptedTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  acceptedTagText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
});
