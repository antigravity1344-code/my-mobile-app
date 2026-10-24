import { WEB_PREVIEW_GATE } from '../../config/webPreviewGate';
import { previewAuditMock, startPreviewNetworkAudit, stopPreviewNetworkAudit } from './previewNetworkAudit';
/** DEV-ONLY. No production auth or network data is used in preview. */
type Role = 'customer' | 'worker';
export type Scenario = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'CANCEL_REQUESTED' | 'COMPLETED' | 'CANCELLED' | 'EMPTY' | 'ERROR';
let role: Role | null = null;
let closing = false;
let generation = 0;
/** A retired preview remains fenced until its entire JS runtime is destroyed by reload. */
export function previewClosing(): boolean { return closing; }
export function previewGeneration(): number { return generation; }
export function previewCanCommit(epoch: number): boolean { return epoch === generation && !closing; }
export function beginPreviewShutdown(): void {
  if (role === null) return;
  closing = true;
  generation += 1;
  store.clear();
  console.info('[PAKSHO_PREVIEW_NETWORK_AUDIT]', 'preview_quarantined');
}

let scenario: Scenario = 'PENDING';
const store = new Map<string, string>();

export const previewAvailable = (): boolean => {
  const flagged = process.env.EXPO_PUBLIC_PAKSHO_UI_PREVIEW === '1';
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (dev && flagged) return true;
  // Browser QA only (document exists). Native store builds stay closed.
  return typeof document !== 'undefined' && WEB_PREVIEW_GATE;
};

export function beginPreview(nextRole: Role): void {
  if (!previewAvailable()) return;
  if (closing) return; // A retired JS context must reload before any new session.
  role = nextRole;
  generation += 1;
  startPreviewNetworkAudit();
  scenario = 'PENDING';
  store.clear();
}
export function endPreview(): void {
  // An active preview can only retire into quarantine. Its pending callbacks must
  // never fall through to real networking, tokens or persistent storage.
  if (role !== null) { beginPreviewShutdown(); return; }
  if (closing) return;
  role = null;
  generation += 1;
  stopPreviewNetworkAudit();
  scenario = 'PENDING';
  store.clear();
}
export function previewActive(): boolean { return previewAvailable() && role !== null; }
export function previewRole(): Role | null { return previewActive() ? role : null; }
export function previewScenario(): Scenario { return scenario; }
export function setPreviewScenario(next: Scenario): void { if (previewActive()) scenario = next; }
export function previewRead(key: string): string | null { return closing ? null : store.get(key) ?? null; }
export function previewWrite(key: string, value: string): void { if (!closing) store.set(key, value); }
export function previewRemove(key: string): void { if (!closing) store.delete(key); }

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
  if (closing) return { success: false, message: 'نشست پیش‌نمایش پایان یافته است.' };
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
  if (path === '/workers/me/tier') {
    return {
      success: true, tierKey: 'gray', tierSince: null,
      next: { tierKey: 'silver', remainingOrders: 8, remainingPoints: 0, minRating: 4, ratingMet: true, progress: 0.6 },
    };
  }
  if (path === '/workers/me/rating') return { success: true, average: null, count: 0 };
  if (path === '/users/addresses') return { success: true, addresses: [] };
  if (path === '/users/me') return { success: true, user: {
    id: role === 'worker' ? 'PREVIEW-WORKER' : 'PREVIEW-CUSTOMER',
    phone: '09000000000', name: role === 'worker' ? 'علی رضایی' : 'مشتری نمونه',
    role: role === 'worker' ? 'WORKER' : 'CUSTOMER', status: 'ACTIVE'
  }};
  return { success: false, message: 'اطلاعات این بخش هنوز در پیش‌نمایش نمونه‌سازی نشده است.' };
}
