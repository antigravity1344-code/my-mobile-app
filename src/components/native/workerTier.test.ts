import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WORKER_TIER_ENDPOINT,
  workerTierBadge,
  workerTierFromResponse,
  workerTierNextFromResponse,
  workerTierProgressText,
  type WorkerTierNext,
} from './workerTier';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const next = (over: Partial<WorkerTierNext> = {}): WorkerTierNext => ({
  tierKey: 'silver', remainingOrders: 8, remainingPoints: 0, minRating: 4.3, ratingMet: true, progress: 0.4, ...over,
});

describe('worker own tier (D-67, D-71, D-75)', () => {
  it('maps only a successful known tierKey', () => {
    expect(workerTierFromResponse({ success: true, tierKey: 'gray', tierSince: null })).toBe('gray');
    expect(workerTierFromResponse({ success: true, tierKey: 'gold_plus' })).toBe('gold_plus');
    expect(workerTierFromResponse({ success: true, tierKey: 'VIP' })).toBeNull();
    expect(workerTierFromResponse({ success: false, tierKey: 'gold' })).toBeNull();
    expect(workerTierFromResponse(null)).toBeNull();
  });

  it('gray never gets a badge; higher tiers get a small themed pill', () => {
    expect(workerTierBadge('gray')).toBeNull();
    expect(workerTierBadge(null)).toBeNull();
    expect(workerTierBadge('silver')?.label).toBe('نقره‌ای');
    expect(workerTierBadge('gold')?.label).toBe('طلایی');
    expect(workerTierBadge('gold_plus')?.icon).toBe('star');
    expect(workerTierBadge('gold_plus')!.borderWidth).toBeGreaterThan(workerTierBadge('gold')!.borderWidth);
  });

  it('parses next only from a valid response; anything odd hides it', () => {
    const ok = { success: true, tierKey: 'gray', next: next() };
    expect(workerTierNextFromResponse(ok)).toEqual(next());
    expect(workerTierNextFromResponse({ success: true, tierKey: 'gray', next: null })).toBeNull();
    expect(workerTierNextFromResponse({ success: false, tierKey: 'gray', next: next() })).toBeNull();
    expect(workerTierNextFromResponse({ success: true, tierKey: 'gray', next: { ...next(), tierKey: 'gray' } })).toBeNull();
    expect(workerTierNextFromResponse({ success: true, tierKey: 'gray', next: { ...next(), remainingOrders: -1 } })).toBeNull();
    expect(workerTierNextFromResponse({ success: true, tierKey: 'gray', next: { ...next(), progress: 5 } })!.progress).toBe(1);
  });

  it('progress text is encouraging, Persian-digit and mentions rating gently', () => {
    expect(workerTierProgressText(next())).toBe('۸ سفارش دیگر تا سطح نقره‌ای');
    expect(workerTierProgressText(next({ remainingPoints: 120 }))).toBe('۸ سفارش و ۱۲۰ امتیاز دیگر تا سطح نقره‌ای');
    expect(workerTierProgressText(next({ ratingMet: false }))).toBe('۸ سفارش دیگر تا سطح نقره‌ای · میانگین ستاره ۴٫۳ لازم است');
    expect(workerTierProgressText(next({ remainingOrders: 0, ratingMet: false }))).toBe('برای سطح نقره‌ای میانگین ستاره ۴٫۳ لازم است');
    expect(workerTierProgressText(next({ tierKey: 'gold', remainingOrders: 0 }))).toBeNull();
    expect(workerTierProgressText(null)).toBeNull();
    expect(workerTierProgressText(next())).not.toContain('خاکستری');
  });

  it('home shell fetches the own tier and the home renders pill and progress', () => {
    const shell = read('WorkerMainShell.tsx');
    expect(shell).toContain('apiFetch(WORKER_TIER_ENDPOINT)');
    expect(shell).toContain('workerTierNextFromResponse(response)');
    expect(shell).toContain('tierNext={tierNext}');
    const home = read('WorkerHomeScreen.tsx');
    expect(home).toContain('workerTierBadge(tierKey)');
    expect(home).toContain('workerTierProgressText(tierNext)');
    expect(WORKER_TIER_ENDPOINT).toBe('/workers/me/tier');
  });

  it('preview answers gray with progress toward silver', () => {
    expect(read('previewRuntime.ts')).toContain("path === '/workers/me/tier'");
  });
});