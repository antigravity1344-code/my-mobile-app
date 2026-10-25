import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gregorianToJalali } from '../../utils/pricing';
import type { WorkerWallet } from '../../features/worker/services/workerFinance';
import {
  WORKER_FEEDBACK_FORBIDDEN_KEYS,
  WORKER_FEEDBACK_PRIVACY_NOTE,
  WORKER_HOME_CARD_KEYS,
  WORKER_HOME_CARD_LABEL,
  WORKER_SERVICES_NOTE,
  WORKER_TRANSACTIONS_NOTE,
  jalaliDayKey,
  normalizeWorkerSkills,
  toggleWorkerSkill,
  workerCalendarDays,
  workerCalendarWeek,
  workerFeedbackEmpty,
  workerFeedbackHasForbiddenField,
  workerFeedbackStats,
  workerLedgerCreditRows,
  workerLedgerRows,
  workerLedgerWorkRows,
  workerServiceRows,
} from './workerHomeCards';
import { WORKER_STAT_PLACEHOLDER } from './workerHomeModel';

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');
const now = new Date(2026, 9, 24, 10, 0, 0); // شنبه ۲ آبان ۱۴۰۵
const [jy, jm, jd] = gregorianToJalali(2026, 10, 24);
const pad = (n: number) => String(n).padStart(2, '0');
const todayJ = `${jy}/${pad(jm)}/${pad(jd)}`;

const wallet: WorkerWallet = {
  balances: [{ currencyUnit: 'تومان', balance: -1250 }],
  canAcceptNewOrders: false,
  topUpAvailable: false,
  transactions: [
    {
      id: 'commission-1', type: 'COMMISSION', amount: -1250, currencyUnit: 'تومان', orderId: 'order-9',
      createdAt: '2026-10-25T08:00:00.000Z', grossAmount: 5000, commissionAmount: 1250, netAmount: 3750, ratePercent: 25,
    },
    {
      id: 'topup-1', type: 'TOPUP', amount: 5000, currencyUnit: 'تومان', orderId: null,
      createdAt: '2026-10-24T08:00:00.000Z', grossAmount: null, commissionAmount: null, netAmount: null, ratePercent: null,
    },
  ],
};

describe('worker home cards model', () => {
  it('groups reservations by Jalali day and keeps status labels', () => {
    const days = workerCalendarDays([
      { id: 'a', serviceTitle: 'نظافت منزل', status: 'ACCEPTED', rawDate: todayJ, rawTime: '14:00' },
      { id: 'b', serviceTitle: 'مبل‌شویی', status: 'COMPLETED', rawDate: todayJ, rawTime: '09:00' },
      { id: 'c', serviceTitle: 'نقاشی', status: 'CANCELLED', rawDate: '2026-10-25', rawTime: '11:00' },
      { id: 'd', serviceTitle: 'بدون تاریخ', status: 'ASSIGNED', rawDate: '', rawTime: '' },
    ], now);
    expect(days[0].key).toBe(jalaliDayKey([jy, jm, jd]));
    expect(days[0].jobs.map((job) => job.id)).toEqual(['b', 'a']);
    expect(days[0].jobs[0].statusLabel).toBe('انجام‌شده');
    expect(days[0].jobs[1].statusLabel).toBe('پذیرفته‌شده');
    expect(days[1].jobs[0].status).toBe('CANCELLED');
    expect(days[2]).toMatchObject({ key: 'undated', title: 'بدون تاریخ مشخص' });
    expect(days[0].title).toContain('امروز');
  });

  it('builds a Saturday-start week and counts only dated jobs', () => {
    const week = workerCalendarWeek([
      { id: 'a', serviceTitle: 'کار', status: 'ACCEPTED', rawDate: todayJ, rawTime: '10:00' },
      { id: 'b', serviceTitle: 'کار', status: 'COMPLETED', rawDate: todayJ, rawTime: '12:00' },
      { id: 'c', serviceTitle: 'فردا', status: 'ACCEPTED', rawDate: '2026-10-25', rawTime: '09:00' },
      { id: 'd', serviceTitle: 'بی‌تاریخ', status: 'ACCEPTED', rawDate: '', rawTime: '' },
    ], now);
    expect(week).toHaveLength(7);
    expect(week[0].weekday).toBe('ش');
    expect(week[0].isToday).toBe(true);
    expect(week[0].jobCount).toBe(2);
    expect(week[1].jobCount).toBe(1);
    expect(week.every((day) => day.key.includes('-'))).toBe(true);
  });

  it('marks catalog services active only from stored skills and keeps unknown skills', () => {
    const rows = workerServiceRows(['home_unit_cleaning', 'home', '', 'home_unit_cleaning']);
    const home = rows.find((row) => row.id === 'home_unit_cleaning');
    const stair = rows.find((row) => row.id === 'staircase_common_areas');
    const extra = rows.find((row) => row.id === 'home');
    expect(home).toMatchObject({ active: true, known: true, title: 'نظافت داخل منزل / واحد' });
    expect(stair).toMatchObject({ active: false, known: true });
    expect(extra).toMatchObject({ active: true, known: false });
    expect(normalizeWorkerSkills(['  a  ', 'a', 2, '', 'x'.repeat(41)])).toEqual(['a']);
    expect(toggleWorkerSkill(['home_unit_cleaning'], 'staircase_common_areas')).toEqual([
      'home_unit_cleaning',
      'staircase_common_areas',
    ]);
    expect(toggleWorkerSkill(['home_unit_cleaning'], 'home_unit_cleaning')).toEqual([]);
  });

  it('splits wallet history into commission and top-up and never treats ledger as work income', () => {
    const rows = workerLedgerRows(wallet);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.isWorkIncome === false)).toBe(true);
    expect(workerLedgerWorkRows(rows).map((row) => row.id)).toEqual(['commission-1']);
    expect(workerLedgerCreditRows(rows).map((row) => row.id)).toEqual(['topup-1']);
    expect(workerLedgerWorkRows(rows)[0]).toMatchObject({
      kind: 'commission',
      title: 'کمیسیون کار',
      grossAmount: 5000,
      commissionAmount: 1250,
      netAmount: 3750,
      ratePercent: 25,
    });
    expect(workerLedgerCreditRows(rows)[0]).toMatchObject({
      kind: 'topup',
      title: 'شارژ اعتبار کیف پول',
    });
    expect(workerLedgerRows(null)).toEqual([]);
  });

  it('exposes only statistical feedback and drops comment-bearing fields', () => {
    expect(workerFeedbackStats({ average: 4.8, count: 12 })).toEqual({
      average: 4.8,
      count: 12,
      headline: '۴٫۸ (۱۲ نظر)',
    });
    expect(workerFeedbackEmpty(workerFeedbackStats({ average: null, count: 0 }))).toBe(true);
    expect(workerFeedbackStats(null).headline).toBe(WORKER_STAT_PLACEHOLDER);
    const stats = workerFeedbackStats({ average: 5, count: 1 });
    expect(Object.keys(stats).sort()).toEqual(['average', 'count', 'headline']);
    expect(workerFeedbackHasForbiddenField(stats)).toBe(false);
    expect(workerFeedbackHasForbiddenField({
      average: 5,
      count: 1,
      customerComment: 'عالی بود',
      comment: 'متن نظر',
    })).toBe(true);
    expect(WORKER_FEEDBACK_FORBIDDEN_KEYS).toEqual(expect.arrayContaining([
      'comment', 'customerComment', 'text', 'body', 'review', 'customerTags',
    ]));
    expect(WORKER_FEEDBACK_PRIVACY_NOTE).toContain('متن نظر یا کامنت مشتری');
  });

  it('wires the four cards from home into the shell without comment text', () => {
    expect(WORKER_HOME_CARD_KEYS).toEqual(['calendar', 'services', 'transactions', 'feedbacks']);
    expect(WORKER_HOME_CARD_LABEL.feedbacks).toBe('بازخوردها');
    const home = read('WorkerHomeScreen.tsx');
    expect(home).toContain('onOpenCard?.(card)');
    expect(home).not.toContain('به‌زودی');
    expect(home).not.toMatch(/customerComment|متن نظر/);
    const shell = read('WorkerMainShell.tsx');
    expect(shell).toContain('WorkerHomeCardScreen');
    expect(shell).toContain('onOpenCard={(card) => onChangeView(card)}');
    const cards = read('WorkerHomeCardScreens.tsx');
    expect(cards).toContain('WORKER_FEEDBACK_PRIVACY_NOTE');
    expect(cards).toContain(WORKER_SERVICES_NOTE.slice(0, 20));
    expect(cards).toContain(WORKER_TRANSACTIONS_NOTE.slice(0, 20));
    expect(cards).not.toMatch(/customerComment|order\.ratings|commentText/);
    expect(cards).not.toContain('درآمد این هفته');
  });
});
