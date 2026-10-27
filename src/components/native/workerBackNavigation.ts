import type { WorkerMainView } from './WorkerMainShell';

type BackEvents = {
  addEventListener: (event: 'hardwareBackPress', handler: () => boolean) => { remove: () => void };
};

export type WorkerContentBackRef = { current: (() => boolean) | null };

/** The shell owns Android Back; standalone portals register directly. */
export function installWorkerContentBackNavigation(events: BackEvents, onBack: () => boolean, contentBackRef?: WorkerContentBackRef) {
  if (!contentBackRef) {
    const subscription = events.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }
  contentBackRef.current = onBack;
  return () => {
    if (contentBackRef.current === onBack) contentBackRef.current = null;
  };
}

/** Keep Android Back aligned with the in-app parent destinations. */
export function installWorkerBackNavigation(events: BackEvents, view: WorkerMainView, navigate: (view: WorkerMainView) => void, backInContent?: () => boolean) {
  const subscription = events.addEventListener('hardwareBackPress', () => {
    if (backInContent?.()) return true;
    if (view === 'home') return false;
    navigate(view === 'work_area' || view === 'bank_details' ? 'profile' : 'home');
    return true;
  });
  return () => subscription.remove();
}
