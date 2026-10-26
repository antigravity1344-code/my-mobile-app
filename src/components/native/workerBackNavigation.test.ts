import { describe, expect, it, vi } from 'vitest';
import { installWorkerBackNavigation } from './workerBackNavigation';
import type { WorkerMainView } from './WorkerMainShell';

function fixture(view: WorkerMainView) {
  let back!: () => boolean;
  const navigate = vi.fn();
  const remove = vi.fn();
  const dispose = installWorkerBackNavigation({ addEventListener: (event, handler) => {
    expect(event).toBe('hardwareBackPress'); back = handler; return { remove };
  } }, view, navigate);
  return { back, navigate, remove, dispose };
}

describe('worker Android back navigation', () => {
  it('returns account subpages to the profile and consumes the event', () => {
    for (const view of ['work_area', 'bank_details'] as const) {
      const f = fixture(view); expect(f.back()).toBe(true); expect(f.navigate).toHaveBeenCalledWith('profile');
    }
  });
  it('returns tabs, home cards and notifications home instead of closing the app', () => {
    for (const view of ['profile', 'support', 'new_orders', 'my_jobs', 'alerts', 'calendar', 'services', 'transactions', 'feedbacks'] as const) {
      const f = fixture(view); expect(f.back()).toBe(true); expect(f.navigate).toHaveBeenCalledWith('home');
    }
  });
  it('keeps native exit behavior only on home and removes the previous listener on navigation/unmount', () => {
    const f = fixture('home'); expect(f.back()).toBe(false); expect(f.navigate).not.toHaveBeenCalled();
    f.dispose(); expect(f.remove).toHaveBeenCalledOnce();
  });
});
