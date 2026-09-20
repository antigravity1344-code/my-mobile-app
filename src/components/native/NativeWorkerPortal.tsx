import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import {
  Briefcase,
  MapPin,
  Clock,
  CheckCircle,
  Phone,
  User,
} from 'lucide-react-native';
import { UserData } from '../../types/user';
import { apiFetch } from '../../api/apiClient';

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
  user: UserData;
  onSwitchToCustomer?: () => void;
  onLogout?: () => void;
}

export const NativeWorkerPortal: React.FC<NativeWorkerPortalProps> = ({
  user,
  onSwitchToCustomer,
  onLogout,
}) => {
  const [activeCategory, setActiveCategory] = useState<SpecialistCategory>('all');
  const [activeTab, setActiveTab] = useState<'available' | 'my_jobs'>('available');
  const [availableOrders, setAvailableOrders] = useState<NativeOrder[]>([]);
  const [myAcceptedOrders, setMyAcceptedOrders] = useState<NativeOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);

  const mapBackendOrder = (o: any): NativeOrder => ({
    id: o.id,
    serviceTitle: o.serviceTitle || 'نظافت منزل',
    category: 'cleaner',
    badge: 'ساعتی',
    customerName: o.customerName || 'مشتری',
    phone: o.customerPhone || '09120000000',
    district: o.address ? o.address.split(' ')[0] : 'تهران',
    address: o.address || 'بدون آدرس',
    date: o.date || 'امروز',
    timeSlot: o.time || 'نامشخص',
    wageTotal: o.price ? Math.round(o.price * 0.8) : 500000,
    paymentMethod: 'ONLINE',
    detailsNote: o.notes || '',
    status: o.status === 'PENDING' ? 'OPEN' : (o.status === 'ACCEPTED' || o.status === 'ASSIGNED' || o.status === 'IN_PROGRESS') ? 'IN_PROGRESS' : o.status === 'COMPLETED' ? 'COMPLETED' : 'OPEN',
  });

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const availRes = await apiFetch('/orders/available');
      if (availRes.success && availRes.orders) {
        setAvailableOrders(availRes.orders.map(mapBackendOrder));
      }

      if (user?.id) {
        const myRes = await apiFetch('/orders?userId=' + user.id + '&role=WORKER');
        if (myRes.success && myRes.orders) {
          setMyAcceptedOrders(myRes.orders.map(mapBackendOrder));
        }
      }
    } catch (e) {
      console.log('Error fetching orders', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const handleAcceptOrder = async (order: NativeOrder) => {
    if (!user?.id) return;
    try {
      const res = await apiFetch('/orders/' + order.id + '/accept', {
        method: 'PUT',
        body: JSON.stringify({ cleanerId: user.id }),
      });
      if (res.success) {
        setSuccessAlert('سفارش شماره ' + order.id + ' با موفقیت پذیرفته شد.');
        setTimeout(() => setSuccessAlert(null), 5000);
        fetchOrders();
      } else {
        alert(res.message || 'خطا در پذیرش سفارش');
      }
    } catch (e) {
      alert('خطا در ارتباط با سرور');
    }
  };

  const handleCompleteOrder = async (order: NativeOrder) => {
    if (!user?.id) return;
    try {
      const res = await apiFetch('/orders/' + order.id + '/complete', {
        method: 'PUT',
        body: JSON.stringify({ cleanerId: user.id }),
      });
      if (res.success) {
        setSuccessAlert('سفارش شماره ' + order.id + ' تکمیل شد.');
        setTimeout(() => setSuccessAlert(null), 5000);
        fetchOrders();
      } else {
        alert(res.message || 'خطا در تکمیل سفارش');
      }
    } catch (e) {
      alert('خطا در ارتباط با سرور');
    }
  };

  const handleCallCustomer = (phone: string) => {
    Linking.openURL('tel:' + phone);
  };

  const filteredOrders = availableOrders.filter(order => {
    if (activeCategory === 'all') return true;
    return order.category === activeCategory;
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <View style={styles.workerProfile}>
          <View style={styles.avatarBox}>
            <Briefcase size={22} color="#fff" />
          </View>
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.workerName}>{user?.name || 'پنل کارگر'}</Text>
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>آماده کار</Text>
              </View>
            </View>
            <Text style={styles.workerSub}>مشاهده و پذیرش سفارشات</Text>
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

      {successAlert && (
        <View style={styles.alertSuccess}>
          <CheckCircle size={18} color="#059669" />
          <Text style={styles.alertSuccessText}>{successAlert}</Text>
        </View>
      )}

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

      {activeTab === 'available' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.categoryScroll, { flexDirection: 'row-reverse' }]}
        >
          {[
            { id: 'all', label: 'همه تخصص‌ها' },
            { id: 'cleaner', label: 'نظافتچی منزل' },
            { id: 'hourly_laborer', label: 'کارگر ساعتی' },
          ].map(cat => (
            <Pressable
              key={cat.id}
              onPress={() => setActiveCategory(cat.id as SpecialistCategory)}
              style={[
                styles.categoryChip,
                activeCategory === cat.id && styles.categoryChipActive
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

      {loading && <ActivityIndicator size="large" color="#059669" style={{marginTop: 20}} />}

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {!loading && activeTab === 'available' ? (
          filteredOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <CheckCircle size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>سفارش بازی موجود نیست</Text>
            </View>
          ) : (
            filteredOrders.map(order => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.cardTop}>
                  <View style={styles.badgeBox}>
                    <Text style={styles.badgeText}>{order.badge}</Text>
                  </View>
                  <View style={styles.titleArea}>
                    <Text style={styles.serviceTitle}>{order.serviceTitle}</Text>
                    <Text style={styles.orderId}>کد سفارش: {order.id}</Text>
                  </View>
                </View>

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
                    <Text style={styles.acceptButtonText}>پذیرش سفارش</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )
        ) : !loading && activeTab === 'my_jobs' ? (
          myAcceptedOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Briefcase size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>هنوز سفارشی نپذیرفته‌اید</Text>
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
                  {order.status === 'COMPLETED' ? (
                    <View style={styles.acceptedTag}>
                      <CheckCircle size={14} color="#0284c7" />
                      <Text style={[styles.acceptedTagText, { color: '#0284c7' }]}>تکمیل شده</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                      <View style={styles.acceptedTag}>
                        <CheckCircle size={14} color="#059669" />
                        <Text style={styles.acceptedTagText}>پذیرفته شده</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleCompleteOrder(order)}
                        style={styles.completeButton}
                      >
                        <Text style={styles.completeButtonText}>اتمام کار</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            ))
          )
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  headerBar: { backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 16 },
  workerProfile: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatarBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  workerName: { fontSize: 16, fontWeight: '800', color: '#ffffff', textAlign: 'right' },
  onlineBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  onlineText: { color: '#34d399', fontSize: 10, fontWeight: '700' },
  workerSub: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 2 },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  switchButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  switchButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  logoutButton: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  logoutButtonText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  alertSuccess: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#6ee7b7', padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 14 },
  alertSuccessText: { color: '#065f46', fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  tabBar: { flexDirection: 'row-reverse', backgroundColor: '#1e293b', marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 4 },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabItemActive: { backgroundColor: '#059669' },
  tabText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#ffffff' },
  categoryScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row-reverse' },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  categoryChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  categoryChipText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  categoryChipTextActive: { color: '#ffffff', fontWeight: '800' },
  listContent: { padding: 16, paddingBottom: 40, gap: 14 },
  emptyBox: { backgroundColor: '#1e293b', borderRadius: 20, padding: 32, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  emptyTitle: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  emptyDesc: { color: '#94a3b8', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  orderCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  myJobCard: { borderLeftWidth: 4, borderLeftColor: '#059669' },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 10 },
  titleArea: { flex: 1, alignItems: 'flex-end' },
  serviceTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', textAlign: 'right' },
  orderId: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  badgeBox: { backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { color: '#0369a1', fontSize: 10, fontWeight: '700' },
  inProgressBadge: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  inProgressBadgeText: { color: '#047857', fontSize: 10, fontWeight: '700' },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoText: { fontSize: 12, color: '#475569', textAlign: 'right', flex: 1 },
  boldText: { fontWeight: '700', color: '#0f172a' },
  noteBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 8, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  noteText: { color: '#64748b', fontSize: 11, textAlign: 'right' },
  actionButtonsRow: { marginTop: 4, marginBottom: 10 },
  callButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 12, paddingVertical: 10 },
  callButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  cardFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, marginTop: 4 },
  wageBox: { alignItems: 'flex-end' },
  wageLabel: { fontSize: 10, color: '#64748b' },
  wageValue: { fontSize: 14, fontWeight: '900', color: '#059669' },
  acceptButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  acceptButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  acceptedTag: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  acceptedTagText: { color: '#059669', fontSize: 11, fontWeight: '700' },
  completeButton: { backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  completeButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
});
