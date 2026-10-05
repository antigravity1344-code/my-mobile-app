import { gpsStatusCopy, resolveGpsFix } from './gpsUi';

import { describe, expect, it, vi } from 'vitest';

describe('resolveGpsFix', () => {
  it('reports denied without asking for a position', async () => {
    const getPosition = vi.fn(async () => ({ latitude: 1, longitude: 2 }));
    const result = await resolveGpsFix({
      requestPermission: async () => ({ granted: false, errorMessage: 'مجوز رد شد.' }),
      getPosition,
      waitMs: 50,
    });
    expect(result.status).toBe('denied');
    expect(result.message).toBe('مجوز رد شد.');
    expect(getPosition).not.toHaveBeenCalled();
  });

  it('reports empty when permission is granted and no coordinates return', async () => {
    const result = await resolveGpsFix({
      requestPermission: async () => ({ granted: true }),
      getPosition: async () => null,
      waitMs: 50,
    });
    expect(result.status).toBe('empty');
    expect(result.coordinates).toBeNull();
  });

  it('returns coordinates on success', async () => {
    const result = await resolveGpsFix({
      requestPermission: async () => ({ granted: true }),
      getPosition: async () => ({ latitude: 35.7, longitude: 51.4 }),
      waitMs: 50,
    });
    expect(result.status).toBe('success');
    expect(result.coordinates).toEqual({ latitude: 35.7, longitude: 51.4 });
  });

  it('resolves as timeout when the position call hangs', async () => {
    const result = await resolveGpsFix({
      requestPermission: async () => ({ granted: true }),
      getPosition: () => new Promise(() => undefined),
      waitMs: 30,
    });
    expect(result.status).toBe('timeout');
  });
});

describe('gpsStatusCopy', () => {
  it('keeps a manual-address hint on the error states', () => {
    expect(gpsStatusCopy('denied')?.body).toContain('دستی');
    expect(gpsStatusCopy('empty')?.body).toContain('دستی');
    expect(gpsStatusCopy('timeout')?.body).toContain('بنویسید');
  });
});
