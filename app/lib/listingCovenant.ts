export const LISTING_COVENANT_VERSION = 'listing-covenant-v2';

type CovenantRequest = {
  resolve: (accepted: boolean) => void;
};

let current: CovenantRequest | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeListingCovenant(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isListingCovenantOpen(): boolean {
  return current !== null;
}

/** Shows معاهدة سرح; resolves true when user accepts. */
export function requestListingCovenant(): Promise<boolean> {
  return new Promise((resolve) => {
    if (current) {
      current.resolve(false);
    }
    current = { resolve };
    notify();
  });
}

export function closeListingCovenant(accepted: boolean) {
  if (!current) return;
  const { resolve } = current;
  current = null;
  notify();
  resolve(accepted);
}
