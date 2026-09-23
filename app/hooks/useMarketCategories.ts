import {
  fetchMarketCategories,
  type MarketCategory,
} from '@/services/categories';
import { useCallback, useEffect, useState } from 'react';

/**
 * Loads market taxonomy after API reachability probe; refetch on focus.
 */
export function useMarketCategories(refetchOnFocus = false) {
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cats = await fetchMarketCategories();
      setCategories(cats.filter((c) => !c.parentId && c.isActive));
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { categories, loading, reload: load, refetchOnFocus };
}
