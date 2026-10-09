import { useEffect, useState } from 'react';
import { fetchStorePrices, type StorePrice } from '@/services/iap';
import { usesStoreBilling } from '@/lib/storePurchases';

/**
 * Store-localized prices (App Store / Google Play) for the given product IDs.
 * Web returns {} (the website shows the SAR catalog prices and pays with N-Genius).
 */
export function useStorePrices(productIds: string[]): {
  prices: Record<string, StorePrice>;
  loading: boolean;
} {
  const key = productIds.join('|');
  const native = usesStoreBilling();
  const [state, setState] = useState<{ key: string; prices: Record<string, StorePrice>; loading: boolean }>(
    () => ({ key, prices: {}, loading: native }),
  );
  useEffect(() => {
    if (!native || !key) return;
    let alive = true;
    void fetchStorePrices(key.split('|')).then((prices) => {
      if (alive) setState({ key, prices, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [key, native]);
  if (!native) return { prices: {}, loading: false };
  return state.key === key ? { prices: state.prices, loading: state.loading } : { prices: {}, loading: true };
}
