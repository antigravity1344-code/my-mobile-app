import { previewAuditMock, startPreviewNetworkAudit, stopPreviewNetworkAudit } from './previewNetworkAudit';
/** DEV-ONLY. No production auth or network data is used in preview. */
type Role = 'customer' | 'worker';
export type Scenario = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'CANCEL_REQUESTED' | 'COMPLETED' | 'CANCELLED' | 'EMPTY' | 'ERROR';
let role: Role | null = null;
let scenario: Scenario = 'PENDING';
const store = new Map<string, string>();

export const previewAvailable = (): boolean =>
  typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW === '1';

export function beginPreview(nextRole: Role): void {
  if (!previewAvailable()) return;
  role = nextRole;
  startPreviewNetworkAudit();
  scenario = 'PENDING';
  store.clear();
}
export function endPreview(): void {
  role = null;
  stopPreviewNetworkAudit();
  scenario = 'PENDING';
  store.clear();
}
export function previewActive(): boolean { return previewAvailable() && role !== null; }
export function previewRole(): Role | null { return previewActive() ? role : null; }
export function previewScenario(): Scenario { return scenario; }
export function setPreviewScenario(next: Scenario): void { if (previewActive()) scenario = next; }
export function previewRead(key: string): string | null { return store.get(key) ?? null; }
export function previewWrite(key: string, value: string): void { store.set(key, value); }
export function previewRemove(key: string): void { store.delete(key); }

const order = () => ({
  id: 'PREVIEW-ORDER-1',
  customerId: 'PREVIEW-CUSTOMER',
  workerId: 'PREVIEW-WORKER',
  cleanerId: scenario === 'PENDING' ? null : 'PREVIEW-WORKER',
  cleanerName: 'متخصص نمونه',
  serviceId: 'home_unit_cleaning',
  serviceTitle: 'نظافت منزل',
  customerName: 'مشتری نمونه',
  date: '۱۴۰۵/۰۷/۲۵',
  time: '۰۹:۰۰',
  durationHours: 3,
  address: 'تهران، خیابان نمونه، پلاک آزمایشی',
  price: 450000,
  paymentMethod: 'CASH',
  status: scenario,
  createdAt: '2026-10-12T08:00:00.000Z',
  detailsNote: '',
  notes: '',
});
/** All calls are handled in-memory; unknown URLs deliberately fail closed. */
export async function previewApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  if (!previewActive()) throw new Error('Preview transport used outside preview');
  const method = (options.method || 'GET').toUpperCase();
  previewAuditMock(method);
  const path = endpoint.split('?')[0];
  // Reject ALL mutations before any mock route, including wallet, addresses, alerts and logout.
  if (method !== 'GET') return { success: false, message: 'این عملیات در پیش‌نمایش غیرفعال است؛ داده‌ای ارسال نشد.' };
  if (scenario === 'ERROR' && (path === '/orders' || path === '/orders/available')) {
    return { success: false, message: 'خطای آزمایشی دریافت سفارش‌ها' };
  }
  if (path === '/orders/available' && method === 'GET')
    return { success: true, orders: scenario === 'EMPTY' ? [] : [order()] };
  if (path === '/orders' && method === 'GET')
    return { success: true, orders: scenario === 'EMPTY' ? [] : [order()] };
  if (path === '/notifications' && method === 'GET')
    return { success: true, notifications: [{ id: 'PREVIEW-N-1', orderId: 'PREVIEW-ORDER-1', title: 'اعلان نمایشی', body: 'این اعلان واقعی نیست.', createdAt: '2026-10-12T08:00:00.000Z', readAt: null }] };
  if (path === '/wallet') return { success: true, balance: 0, transactions: [] };
  if (path === '/loyalty') return { success: true, loyalty: { tier: 'NEW', title: 'عضو جدید', discountPercentage: 0, completedOrdersCount: 0, nextTierOrderTarget: 0 } };
  if (path === '/users/addresses') return { success: true, addresses: [] };
  if (path === '/users/me') return { success: true, user: {
    id: role === 'worker' ? 'PREVIEW-WORKER' : 'PREVIEW-CUSTOMER',
    phone: '09000000000', name: role === 'worker' ? 'متخصص نمونه' : 'مشتری نمونه',
    role: role === 'worker' ? 'WORKER' : 'CUSTOMER', status: 'ACTIVE'
  }};
  return { success: false, message: 'اطلاعات این بخش هنوز در پیش‌نمایش نمونه‌سازی نشده است.' };
}
