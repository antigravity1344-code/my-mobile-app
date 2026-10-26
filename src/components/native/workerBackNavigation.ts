import type { WorkerMainView } from './WorkerMainShell';

type BackEvents = {
  addEventListener: (event: 'hardwareBackPress', handler: () => boolean) => { remove: () => void };
};

/** Keep Android Back aligned with the in-app parent destinations. */
export function installWorkerBackNavigation(events: BackEvents, view: WorkerMainView, navigate: (view: WorkerMainView) => void) {
  const subscription = events.addEventListener('hardwareBackPress', () => {
    if (view === 'home') return false;
    navigate(view === 'work_area' || view === 'bank_details' ? 'profile' : 'home');
    return true;
  });
  return () => subscription.remove();
}
