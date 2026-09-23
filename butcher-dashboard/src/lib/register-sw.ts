import { BUTCHER_BASE_PATH, withButcherBase } from '@/constants/butcherBasePath';

export async function registerButcherServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  const scope = BUTCHER_BASE_PATH ? `${BUTCHER_BASE_PATH}/` : '/';
  const registration = await navigator.serviceWorker.register(withButcherBase('/sw.js'), {
    scope,
    updateViaCache: 'none',
  });
  return registration;
}

export function unregisterButcherServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }
  return navigator.serviceWorker.getRegistrations().then((regs) => {
    void Promise.all(regs.map((reg) => reg.unregister()));
    return true;
  });
}
