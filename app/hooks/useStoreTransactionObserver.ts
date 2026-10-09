import { useEffect } from 'react';
import { digitalPurchasesEnabled, usesStoreBilling } from '@/lib/storePurchases';
import { startStoreTransactionObserver } from '@/services/iap';

/**
 * While signed in on iOS / Android: verify + finish store transactions that
 * the App Store / Google Play re-deliver (interrupted purchases, Ask to Buy,
 * pending payments completed later). No-op on web.
 */
export function useStoreTransactionObserver(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated || !usesStoreBilling() || !digitalPurchasesEnabled()) return;
    return startStoreTransactionObserver();
  }, [isAuthenticated]);
}
