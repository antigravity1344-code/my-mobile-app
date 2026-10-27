import { describe, expect, it, vi } from 'vitest';
import { installWorkerBackNavigation, installWorkerContentBackNavigation, type WorkerContentBackRef } from './workerBackNavigation';
import type { WorkerMainView } from './WorkerMainShell';

function fixture(view: WorkerMainView, backInContent?: () => boolean) {
  let back!: () => boolean;
  const navigate = vi.fn();
  const remove = vi.fn();
  const dispose = installWorkerBackNavigation({ addEventListener: (event, handler) => {
    expect(event).toBe('hardwareBackPress'); back = handler; return { remove };
  } }, view, navigate, backInContent);
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

describe('available-order detail navigation', () => {
  it.each(['new_orders', 'my_jobs'] as const)('closes details to the retained list before navigating away from %s', view => {
    const contentBackRef: WorkerContentBackRef = { current: null };
    const f = fixture(view, () => contentBackRef.current?.() ?? false);
    let detailsOpen = true;
    const onBack = vi.fn(() => {
      if (!detailsOpen) return false;
      detailsOpen = false;
      return true;
    });
    const events = { addEventListener: vi.fn() };
    const dispose = installWorkerContentBackNavigation(events, onBack, contentBackRef);
    expect(events.addEventListener).not.toHaveBeenCalled();
    expect(f.back()).toBe(true);
    expect(detailsOpen).toBe(false);
    expect(f.navigate).not.toHaveBeenCalled();
    expect(f.back()).toBe(true);
    expect(f.navigate).toHaveBeenCalledWith('home');
    dispose();
    expect(contentBackRef.current).toBeNull();
  });

  it('does not clear a newer screen handler when the previous screen cleans up', () => {
    const ref: WorkerContentBackRef = { current: null };
    const events = { addEventListener: vi.fn() };
    const oldDispose = installWorkerContentBackNavigation(events, () => true, ref);
    const newer = () => false;
    const newDispose = installWorkerContentBackNavigation(events, newer, ref);
    oldDispose();
    expect(ref.current).toBe(newer);
    newDispose();
    expect(ref.current).toBeNull();
  });

  it('also handles Android Back in the standalone portal and removes its listener', () => {
    const remove = vi.fn();
    const events = { addEventListener: vi.fn(() => ({ remove })) };
    const onBack = vi.fn(() => true);
    const dispose = installWorkerContentBackNavigation(events, onBack);
    expect(events.addEventListener).toHaveBeenCalledWith('hardwareBackPress', onBack);
    dispose();
    expect(remove).toHaveBeenCalledOnce();
  });
});
