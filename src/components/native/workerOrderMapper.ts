import type { ApiOrder } from '../../api/types';
import { classifyWorkerOrder, describeWorkerServiceFacts, type WorkerServiceCategory } from './workerServiceCategory';
import { normalizeWorkerOrderStatus, workerOrderArea, type WorkerOrderStatus } from './workerOrderStatus';

/** سفارش آمادهٔ نمایش در پنل متخصص (خانه و پنل سفارش‌ها از همین شکل استفاده می‌کنند). */
export interface NativeOrder {
  id: string;
  serviceTitle: string;
  category: WorkerServiceCategory | null;
  badge: string;
  customerName: string;
  phone: string;
  district: string;
  address: string;
  date: string;
  timeSlot: string;
  grossOrderAmount: number;
  currencyUnit?: string;
  startReported: boolean | null;
  startStatus: string | null;
  startAcceptanceKey: string | null;
  paymentMethod: 'ONLINE' | 'CASH';
  detailsNote: string;
  /** وضعیت خام سرور (CANCELLED/CONFIRMED دیگر به OPEN تبدیل نمی‌شوند). */
  status: WorkerOrderStatus;
  createdAt: string;
  /** مبلغ خام سرور؛ null یعنی سرور مبلغی نفرستاده است. */
  rawPrice: number | null;
  /** تاریخ و ساعت خام سرور، بدون مقدار جایگزین. */
  rawDate: string;
  rawTime: string;
  /** کلید خدمت از سرور (مثلاً staircase_common_areas)؛ null یعنی سرور کلیدی نفرستاده است. */
  serviceId: string | null;
}

export function mapWorkerOrder(o: ApiOrder): NativeOrder {
  const classified = classifyWorkerOrder(o);
  return {
    id: o.id,
    serviceTitle: o.serviceTitle || 'نظافت منزل',
    category: classified.category,
    badge: classified.badge,
    customerName: o.customerName || 'مشتری',
    phone: o.customerPhone || '',
    district: workerOrderArea(o),
    address: o.address || '',
    date: o.date || 'امروز',
    timeSlot: o.time || 'نامشخص',
    grossOrderAmount: typeof o.price === 'number' ? o.price : 0,
    currencyUnit: o.currencyUnit,
    startReported: typeof o.startReported === 'boolean' ? o.startReported : null,
    startStatus: typeof o.startStatus === 'string' ? o.startStatus : null,
    startAcceptanceKey: typeof o.startAcceptanceKey === 'string' ? o.startAcceptanceKey : null,
    paymentMethod: o.paymentMethod === 'ONLINE' ? 'ONLINE' : 'CASH',
    detailsNote: describeWorkerServiceFacts(o),
    status: normalizeWorkerOrderStatus(o.status),
    createdAt: o.createdAt || '',
    rawPrice: typeof o.price === 'number' && Number.isFinite(o.price) ? o.price : null,
    rawDate: typeof o.date === 'string' ? o.date : '',
    rawTime: typeof o.time === 'string' ? o.time : '',
    serviceId: typeof o.serviceId === 'string' && o.serviceId.trim() ? o.serviceId.trim() : null,
  };
}
