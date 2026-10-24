import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKER_RATING_ENDPOINT, workerRatingFromResponse, workerRatingText } from './workerRating';

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');

describe('workerRating (D-73)', () => {
  it('accepts only a valid own-rating response', () => {
    expect(workerRatingFromResponse({ success: true, average: 4.8, count: 12 })).toEqual({ average: 4.8, count: 12 });
    expect(workerRatingFromResponse({ success: true, average: null, count: 0 })).toEqual({ average: null, count: 0 });
    expect(workerRatingFromResponse({ success: false, average: 4.8, count: 12 })).toBeNull();
    expect(workerRatingFromResponse({ success: true, average: 7, count: 2 })).toBeNull();
    expect(workerRatingFromResponse({ success: true, average: 4, count: -1 })).toBeNull();
    expect(workerRatingFromResponse({ success: true, average: null, count: 3 })).toBeNull();
    expect(workerRatingFromResponse(null)).toBeNull();
  });

  it('shows the average with the count in Persian digits from the first rating', () => {
    expect(workerRatingText({ average: 4.8, count: 12 })).toBe('۴٫۸ (۱۲ نظر)');
    expect(workerRatingText({ average: 5, count: 1 })).toBe('۵٫۰ (۱ نظر)');
  });

  it('shows — with no ratings or on error', () => {
    expect(workerRatingText({ average: null, count: 0 })).toBe('—');
    expect(workerRatingText(null)).toBe('—');
    expect(workerRatingText(undefined)).toBe('—');
  });

  it('is wired into the shell, the home stat box and the preview', () => {
    expect(WORKER_RATING_ENDPOINT).toBe('/workers/me/rating');
    const shell = read('WorkerMainShell.tsx');
    expect(shell).toContain('apiFetch(WORKER_RATING_ENDPOINT)');
    expect(shell).toContain('rating={rating}');
    expect(read('WorkerHomeScreen.tsx')).toContain('workerRatingText(rating)');
    expect(read('previewRuntime.ts')).toContain("path === '/workers/me/rating'");
  });
});
