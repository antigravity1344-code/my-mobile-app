import { describe, expect, it } from 'vitest';
import { completedRecencyIso, selectSmartHero, type SmartHeroOrder } from './selectSmartHero';

const known = new Set(['home_unit_cleaning', 'building_painting']);
const canReorder = (serviceId: string) => known.has(serviceId);

function order(partial: Partial<SmartHeroOrder> & Pick<SmartHeroOrder, 'id' | 'status' | 'createdAt'>): SmartHeroOrder {
  return {
    serviceId: 'home_unit_cleaning',
    serviceTitle: 'نظافت منزل',
    ...partial,
  };
}

describe('selectSmartHero', () => {
  it('shows a loading placeholder before any orders arrive', () => {
    expect(selectSmartHero([], { loading: true, error: null }, canReorder)).toEqual({ kind: 'loading' });
  });

  it('keeps the current hero while a later refresh is in flight', () => {
    const active = order({ id: 'a', status: 'PENDING', createdAt: '2026-04-01T00:00:00.000Z' });
    expect(selectSmartHero([active], { loading: true, error: null }, canReorder).kind).toBe('active');
  });

  it('shows an error instead of the empty history when the load fails', () => {
    expect(selectSmartHero([], { loading: false, error: 'اتصال برقرار نشد' }, canReorder)).toEqual({
      kind: 'error',
      message: 'اتصال برقرار نشد',
    });
  });

  it('does not replace a loaded hero with the empty state when a refresh reports an error', () => {
    const active = order({ id: 'a', status: 'IN_PROGRESS', createdAt: '2026-04-02T00:00:00.000Z' });
    expect(selectSmartHero([active], { loading: false, error: 'قطع شد' }, canReorder).kind).toBe('active');
  });

  it('picks the newest active order and counts the rest', () => {
    const older = order({ id: 'old', status: 'CONFIRMED', createdAt: '2026-03-01T00:00:00.000Z', serviceTitle: 'قدیمی' });
    const newer = order({
      id: 'new',
      status: 'PENDING',
      createdAt: '2026-04-01T00:00:00.000Z',
      serviceId: 'building_painting',
      serviceTitle: 'نقاشی ساختمان',
    });
    const completed = order({ id: 'done', status: 'COMPLETED', createdAt: '2026-05-01T00:00:00.000Z' });
    const hero = selectSmartHero([older, completed, newer], { loading: false, error: null }, canReorder);
    expect(hero).toEqual({ kind: 'active', order: newer, otherActiveCount: 1 });
  });

  it('offers reorder from the newest completed order only', () => {
    const older = order({ id: 'old', status: 'COMPLETED', createdAt: '2026-01-01T00:00:00.000Z', serviceTitle: 'قدیمی' });
    const newer = order({
      id: 'new',
      status: 'COMPLETED',
      createdAt: '2026-02-01T00:00:00.000Z',
      serviceId: 'building_painting',
      serviceTitle: 'نقاشی ساختمان',
    });
    const cancelled = order({ id: 'x', status: 'CANCELLED', createdAt: '2026-06-01T00:00:00.000Z', serviceTitle: 'لغو' });
    const hero = selectSmartHero([older, cancelled, newer], { loading: false, error: null }, canReorder);
    expect(hero).toEqual({ kind: 'reorder', order: newer, preselectServiceId: 'building_painting' });
  });

  it('keeps the active hero when a completed order was updated more recently', () => {
    const active = order({ id: 'a', status: 'ASSIGNED', createdAt: '2026-01-01T00:00:00.000Z' });
    const completed = order({
      id: 'done',
      status: 'COMPLETED',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(selectSmartHero([completed, active], { loading: false, error: null }, canReorder).kind).toBe('active');
  });

  it('picks the completed order with the latest completion time, not the latest created time', () => {
    const createdLater = order({
      id: 'created-later',
      status: 'COMPLETED',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
      serviceTitle: 'قدیمی‌تر در انجام',
    });
    const completedLater = order({
      id: 'completed-later',
      status: 'COMPLETED',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      serviceId: 'building_painting',
      serviceTitle: 'نقاشی ساختمان',
    });
    const hero = selectSmartHero([createdLater, completedLater], { loading: false, error: null }, canReorder);
    expect(hero).toEqual({ kind: 'reorder', order: completedLater, preselectServiceId: 'building_painting' });
  });

  it('falls back to createdAt when the completion time is missing or unparseable', () => {
    expect(completedRecencyIso({ createdAt: '2026-04-01T00:00:00.000Z' })).toBe('2026-04-01T00:00:00.000Z');
    expect(completedRecencyIso({ createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '   ' })).toBe('2026-04-01T00:00:00.000Z');
    expect(completedRecencyIso({ createdAt: '2026-04-01T00:00:00.000Z', updatedAt: 'not-a-date' })).toBe(
      '2026-04-01T00:00:00.000Z',
    );
    const fallback = order({ id: 'fallback', status: 'COMPLETED', createdAt: '2026-04-01T00:00:00.000Z', updatedAt: 'not-a-date' });
    const older = order({ id: 'older', status: 'COMPLETED', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' });
    const hero = selectSmartHero([older, fallback], { loading: false, error: null }, canReorder);
    expect(hero).toEqual({ kind: 'reorder', order: fallback, preselectServiceId: 'home_unit_cleaning' });
  });

  it('ignores a cancelled order even when it is newer than the completed one', () => {
    const completed = order({
      id: 'done',
      status: 'COMPLETED',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
      serviceId: 'building_painting',
    });
    const cancelled = order({
      id: 'x',
      status: 'CANCELLED',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      serviceTitle: 'لغو',
    });
    const hero = selectSmartHero([cancelled, completed], { loading: false, error: null }, canReorder);
    expect(hero).toEqual({ kind: 'reorder', order: completed, preselectServiceId: 'building_painting' });
  });

  it('shows the latest completed order and leaves service selection manual when it left the catalog', () => {
    const unknown = order({
      id: 'u',
      status: 'COMPLETED',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      serviceId: 'missing_service',
    });
    const olderKnown = order({ id: 'k', status: 'COMPLETED', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(selectSmartHero([unknown, olderKnown], { loading: false, error: null }, canReorder)).toEqual({
      kind: 'reorder',
      order: unknown,
      preselectServiceId: undefined,
    });
  });

  it('hides the hero when history is only cancelled orders', () => {
    const cancelled = order({ id: 'x', status: 'CANCELLED', createdAt: '2026-04-01T00:00:00.000Z' });
    expect(selectSmartHero([cancelled], { loading: false, error: null }, canReorder)).toEqual({ kind: 'none' });
  });

  it('hides the hero when the customer has no orders', () => {
    expect(selectSmartHero([], { loading: false, error: null }, canReorder)).toEqual({ kind: 'none' });
  });
});
