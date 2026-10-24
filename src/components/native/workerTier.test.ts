import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKER_TIER_ENDPOINT, workerTierBadge, workerTierFromResponse } from './workerTier';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const brandTeal = /teal:\s*'([^']+)'/.exec(readFileSync(join(__dirname, '../../theme/customerHome.ts'), 'utf8'))![1];

describe('worker own tier (D-67, D-71)', () => {
  it('maps only a successful known tierKey', () => {
    expect(workerTierFromResponse({ success: true, tierKey: 'gray', tierSince: null })).toBe('gray');
    expect(workerTierFromResponse({ success: true, tierKey: 'silver' })).toBe('silver');
    expect(workerTierFromResponse({ success: true, tierKey: 'gold' })).toBe('gold');
    expect(workerTierFromResponse({ success: true, tierKey: 'gold_plus' })).toBe('gold_plus');
    expect(workerTierFromResponse({ success: true, tierKey: 'VIP' })).toBeNull();
    expect(workerTierFromResponse({ success: false, tierKey: 'gold' })).toBeNull();
    expect(workerTierFromResponse({ success: true })).toBeNull();
    expect(workerTierFromResponse(null)).toBeNull();
    expect(workerTierFromResponse('gold')).toBeNull();
  });

  it('badge labels are Persian, include gray, and unknown shows nothing', () => {
    expect(workerTierBadge('gray')?.label).toBe('درجه خاکستری');
    expect(workerTierBadge('silver')?.label).toBe('درجه نقره‌ای');
    expect(workerTierBadge('gold')?.label).toBe('درجه طلایی');
    expect(workerTierBadge('gold_plus')?.label).toBe('درجه طلایی پلاس');
    expect(workerTierBadge(null)).toBeNull();
    expect(workerTierBadge(undefined)).toBeNull();
  });

  it('badges never use the brand turquoise and gold plus differs from gold', () => {
    for (const key of ['gray', 'silver', 'gold', 'gold_plus'] as const) {
      const badge = workerTierBadge(key)!;
      for (const c of [badge.background, badge.color, badge.border]) {
        expect(c.toLowerCase()).not.toBe(brandTeal.toLowerCase());
      }
    }
    expect(workerTierBadge('gold_plus')!.borderWidth).toBeGreaterThan(workerTierBadge('gold')!.borderWidth);
  });

  it('home shell fetches the own tier and the home card renders the badge', () => {
    const shell = read('WorkerMainShell.tsx');
    expect(shell).toContain('apiFetch(WORKER_TIER_ENDPOINT)');
    expect(shell).toContain('workerTierFromResponse');
    expect(shell).toContain('tierKey={tierKey}');
    const home = read('WorkerHomeScreen.tsx');
    expect(home).toContain('workerTierBadge(tierKey)');
    expect(WORKER_TIER_ENDPOINT).toBe('/workers/me/tier');
  });

  it('preview answers gray for the own tier', () => {
    expect(read('previewRuntime.ts')).toContain("path === '/workers/me/tier'");
  });
});
