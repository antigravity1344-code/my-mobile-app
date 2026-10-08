import { describe, expect, it } from 'vitest';
import type { ApiOrder } from '../../api/types';
import {
  canAcceptWorkerOrder,
  canCallWorkerCustomer,
  canCompleteWorkerOrder,
  isActiveWorkerJob,
  normalizeWorkerOrderStatus,
  partitionWorkerJobs,
  preAcceptOrderView,
  workerOrderArea,
  workerStatusLabel,
  workerStatusTone,
  type WorkerOrderStatus,
} from './workerOrderStatus';

const ALL: WorkerOrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'CONFIRMED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'UNKNOWN',
];

describe('workerOrderStatus', () => {
  it('keeps the raw backend status and never turns CANCELLED or CONFIRMED into an open order', () => {
    expect(normalizeWorkerOrderStatus('CANCELLED')).toBe('CANCELLED');
    expect(normalizeWorkerOrderStatus('CONFIRMED')).toBe('CONFIRMED');
    expect(normalizeWorkerOrderStatus('ASSIGNED')).toBe('ASSIGNED');
    expect(normalizeWorkerOrderStatus('accepted')).toBe('ACCEPTED');
    expect(normalizeWorkerOrderStatus('SOMETHING_NEW')).toBe('UNKNOWN');
    expect(normalizeWorkerOrderStatus(undefined)).toBe('UNKNOWN');
  });

  it('gives every status its own Persian label', () => {
    const labels = ALL.map(workerStatusLabel);
    expect(new Set(labels).size).toBe(ALL.length);
    expect(workerStatusLabel('CANCELLED')).toBe('لغو شده');
    expect(workerStatusLabel('ACCEPTED')).toBe('پذیرفته شده');
    expect(workerStatusLabel('COMPLETED')).toBe('انجام شده');
    expect(workerStatusTone('CANCELLED')).toBe('cancelled');
    expect(workerStatusTone('UNKNOWN')).toBe('neutral');
    expect(workerStatusTone('PENDING')).toBe('open');
  });

  it('allows actions only where the server allows them', () => {
    expect(ALL.filter(canAcceptWorkerOrder)).toEqual(['PENDING']);
    expect(ALL.filter(canCompleteWorkerOrder)).toEqual(['ACCEPTED']);
    expect(ALL.filter(isActiveWorkerJob)).toEqual(['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']);
    for (const status of ['CANCELLED', 'COMPLETED', 'UNKNOWN', 'PENDING'] as WorkerOrderStatus[]) {
      expect(canCompleteWorkerOrder(status)).toBe(false);
      expect(canCallWorkerCustomer(status, '09121234567')).toBe(false);
    }
    expect(canCallWorkerCustomer('ACCEPTED', '09121234567')).toBe(true);
    expect(canCallWorkerCustomer('IN_PROGRESS', '09121234567')).toBe(true);
    expect(canCallWorkerCustomer('ACCEPTED', '')).toBe(false);
  });

  it('puts active jobs first (newest first) and keeps cancelled/completed in history', () => {
    const orders = [
      { id: 'old-active', status: 'ACCEPTED' as WorkerOrderStatus, createdAt: '2026-10-01T08:00:00.000Z' },
      { id: 'cancelled', status: 'CANCELLED' as WorkerOrderStatus, createdAt: '2026-10-07T08:00:00.000Z' },
      { id: 'new-active', status: 'IN_PROGRESS' as WorkerOrderStatus, createdAt: '2026-10-05T08:00:00.000Z' },
      { id: 'done', status: 'COMPLETED' as WorkerOrderStatus, createdAt: '2026-10-03T08:00:00.000Z' },
      { id: 'odd', status: 'UNKNOWN' as WorkerOrderStatus, createdAt: 'not-a-date' },
    ];
    const { active, history } = partitionWorkerJobs(orders);
    expect(active.map((o) => o.id)).toEqual(['new-active', 'old-active']);
    expect(history.map((o) => o.id)).toEqual(['cancelled', 'done', 'odd']);
    expect(active.some((o) => o.status === 'CANCELLED' || o.status === 'COMPLETED')).toBe(false);
  });

  it('derives the area from the server field or the first address segment', () => {
    expect(workerOrderArea({ area: 'سعادت‌آباد', address: 'سعادت‌آباد' })).toBe('سعادت‌آباد');
    expect(workerOrderArea({ address: 'شهرک غرب، خیابان ایران زمین، پلاک ۴' })).toBe('شهرک غرب');
    expect(workerOrderArea({ area: '', address: '' })).toBe('');
    expect(workerOrderArea({})).toBe('');
    // مثل سرور: بخشی که عدد دارد یا خیلی بلند است نشانی دقیق حساب می‌شود و محدوده نیست
    expect(workerOrderArea({ address: 'خیابان ولیعصر پلاک ۱۲ واحد ۳' })).toBe('');
    expect(workerOrderArea({ address: 'Street 12, Tehran' })).toBe('');
    expect(workerOrderArea({ address: 'ا'.repeat(41) })).toBe('');
  });

  it('keeps only the area for an open order, even if private fields arrive', () => {
    const leaky = {
      id: 'o1',
      status: 'PENDING',
      serviceTitle: 'نظافت منزل',
      address: 'سعادت‌آباد، خیابان سرو، پلاک ۸',
      addressNotes: 'زنگ دوم',
      notes: 'با شماره ۰۹۱۲۰۰۰۰۰۰۰ تماس بگیرید',
      customerName: 'نام مشتری',
      customerPhone: '09120000000',
      customerAvatar: 'avatar.png',
      price: 100000,
    } as unknown as ApiOrder;
    const view = preAcceptOrderView(leaky);
    expect(view.address).toBe('سعادت‌آباد');
    expect(view.addressNotes).toBeNull();
    expect(view.notes).toBe('');
    expect(view.customerName).toBe('');
    expect(view.customerPhone).toBe('');
    expect(view.customerAvatar).toBe('');
    expect(view.serviceTitle).toBe('نظافت منزل');
    expect(view.price).toBe(100000);
    expect(JSON.stringify(view)).not.toMatch(/09120000000|۰۹۱۲|پلاک|زنگ/);
    expect(leaky.customerPhone).toBe('09120000000');
  });
});
